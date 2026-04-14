// AgentOS Bridge - Background Service Worker
// Handles Google OAuth, reads/writes Google Docs

// ============================================
// AUTH
// ============================================

function getAuthToken(interactive) {
  return new Promise(function(resolve, reject) {
    chrome.identity.getAuthToken({ interactive: interactive }, function(token) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// ============================================
// GOOGLE DOCS API
// ============================================

async function readDoc(docId) {
  var token = await getAuthToken(false);
  var resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!resp.ok) throw new Error('Failed to read doc: ' + resp.status);
  var doc = await resp.json();

  // Extract plain text from the doc
  var text = '';
  if (doc.body && doc.body.content) {
    doc.body.content.forEach(function(el) {
      if (el.paragraph && el.paragraph.elements) {
        el.paragraph.elements.forEach(function(e) {
          if (e.textRun) text += e.textRun.content;
        });
      }
    });
  }
  return { text: text, title: doc.title, docId: docId };
}

async function appendToDoc(docId, text) {
  var token = await getAuthToken(false);
  // First get doc to find end index
  var resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  var doc = await resp.json();
  var endIndex = 1;
  if (doc.body && doc.body.content) {
    var last = doc.body.content[doc.body.content.length - 1];
    if (last) endIndex = last.endIndex - 1;
  }

  var resp2 = await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: endIndex }, text: text } }]
    })
  });
  if (!resp2.ok) throw new Error('Failed to write doc: ' + resp2.status);
  return await resp2.json();
}

async function replaceInDoc(docId, oldText, newText) {
  var token = await getAuthToken(false);
  var resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        replaceAllText: {
          containsText: { text: oldText, matchCase: true },
          replaceText: newText
        }
      }]
    })
  });
  if (!resp.ok) throw new Error('Failed to replace in doc: ' + resp.status);
  return await resp.json();
}

// ============================================
// TASK OPERATIONS
// ============================================

async function markTaskDone(docId, taskText) {
  var timestamp = new Date().toLocaleString();
  // Replace [ ] task with [x] task in TODO, and add to DONE
  await replaceInDoc(docId, '[ ] ' + taskText, '');

  // Add to DONE section
  var doc = await readDoc(docId);
  var doneMarker = '== DONE ==';
  var doneIdx = doc.text.indexOf(doneMarker);
  if (doneIdx > -1) {
    var insertAfter = doneIdx + doneMarker.length;
    // Find next newline after DONE marker
    var nextNl = doc.text.indexOf('\n', insertAfter);
    if (nextNl > -1) {
      var token = await getAuthToken(false);
      await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: nextNl + 1 }, text: '[' + timestamp + '] ' + taskText + '\n' } }]
        })
      });
    }
  }
  return { success: true, task: taskText, timestamp: timestamp };
}

async function addTask(docId, taskText) {
  var doc = await readDoc(docId);
  var todoMarker = '== TODO ==';
  var todoIdx = doc.text.indexOf(todoMarker);
  if (todoIdx > -1) {
    var insertAfter = todoIdx + todoMarker.length;
    var nextNl = doc.text.indexOf('\n', insertAfter);
    if (nextNl > -1) {
      var token = await getAuthToken(false);
      await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: nextNl + 1 }, text: '[ ] ' + taskText + '\n' } }]
        })
      });
    }
  }
  return { success: true, task: taskText };
}

async function updateWhatsNext(docId, priority, status, blocker) {
  var doc = await readDoc(docId);
  var marker = '== WHAT\'S NEXT ==';
  var idx = doc.text.indexOf(marker);
  if (idx === -1) marker = '== WHATS NEXT ==';
  idx = doc.text.indexOf(marker);
  if (idx > -1) {
    // Find the section end (next == or end)
    var sectionEnd = doc.text.indexOf('\n---', idx + marker.length);
    if (sectionEnd === -1) sectionEnd = doc.text.indexOf('== ', idx + marker.length);
    if (sectionEnd === -1) sectionEnd = doc.text.length;

    var newContent = '\nPriority: ' + priority + '\nStatus: ' + (status || 'In progress') + '\nBlocked by: ' + (blocker || 'Nothing') + '\n';

    var token = await getAuthToken(false);
    // Delete old content and insert new
    var startDel = idx + marker.length;
    await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { deleteContentRange: { range: { startIndex: startDel, endIndex: sectionEnd } } },
          { insertText: { location: { index: startDel }, text: newContent } }
        ]
      })
    });
  }
  return { success: true };
}

async function addLink(docId, url, label) {
  var doc = await readDoc(docId);
  var marker = '== LIVE LINKS ==';
  var idx = doc.text.indexOf(marker);
  if (idx > -1) {
    var insertAfter = idx + marker.length;
    var nextNl = doc.text.indexOf('\n', insertAfter);
    if (nextNl > -1) {
      var linkText = label ? '- ' + label + ': ' + url : '- ' + url;
      var token = await getAuthToken(false);
      await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: nextNl + 1 }, text: linkText + '\n' } }]
        })
      });
    }
  }
  return { success: true };
}

// ============================================
// MESSAGE HANDLER
// ============================================

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  var docId = null;

  // Get stored doc ID
  chrome.storage.local.get(['docId'], function(data) {
    docId = data.docId;

    if (!docId && msg.action !== 'setDoc' && msg.action !== 'login' && msg.action !== 'getStatus') {
      sendResponse({ error: 'No Google Doc connected. Use the popup to connect one.' });
      return;
    }

    switch (msg.action) {
      case 'login':
        getAuthToken(true).then(function(token) {
          sendResponse({ success: true, token: token });
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      case 'setDoc':
        // Extract doc ID from URL or direct ID
        var id = msg.docId;
        if (id.includes('docs.google.com')) {
          var match = id.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match) id = match[1];
        }
        chrome.storage.local.set({ docId: id, docUrl: msg.docId }, function() {
          sendResponse({ success: true, docId: id });
        });
        break;

      case 'getStatus':
        chrome.storage.local.get(['docId', 'docUrl'], function(data) {
          if (data.docId) {
            readDoc(data.docId).then(function(doc) {
              // Parse sections
              var text = doc.text;
              var todos = [];
              var dones = [];
              var todoMatch = text.match(/== TODO ==([\s\S]*?)(?:== DONE|---)/);
              if (todoMatch) {
                todoMatch[1].split('\n').forEach(function(line) {
                  line = line.trim();
                  if (line.startsWith('[ ]')) todos.push(line.replace('[ ] ', ''));
                });
              }
              var doneMatch = text.match(/== DONE ==([\s\S]*?)(?:---)/);
              if (doneMatch) {
                doneMatch[1].split('\n').forEach(function(line) {
                  line = line.trim();
                  if (line.startsWith('[') && !line.startsWith('[ ]')) dones.push(line);
                });
              }
              sendResponse({
                connected: true,
                docId: data.docId,
                docUrl: data.docUrl,
                title: doc.title,
                todos: todos,
                dones: dones,
                whatsNext: text.match(/Priority:\s*(.+)/)?.[1] || 'None'
              });
            }).catch(function(err) {
              sendResponse({ connected: true, docId: data.docId, error: err.message });
            });
          } else {
            sendResponse({ connected: false });
          }
        });
        break;

      case 'readDoc':
        readDoc(docId).then(function(doc) {
          sendResponse({ success: true, text: doc.text, title: doc.title });
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      case 'markDone':
        markTaskDone(docId, msg.task).then(function(r) {
          sendResponse(r);
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      case 'addTask':
        addTask(docId, msg.task).then(function(r) {
          sendResponse(r);
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      case 'addLink':
        addLink(docId, msg.url, msg.label).then(function(r) {
          sendResponse(r);
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      case 'updateNext':
        updateWhatsNext(docId, msg.priority, msg.status, msg.blocker).then(function(r) {
          sendResponse(r);
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      case 'appendText':
        appendToDoc(docId, msg.text).then(function(r) {
          sendResponse({ success: true });
        }).catch(function(err) {
          sendResponse({ error: err.message });
        });
        break;

      default:
        sendResponse({ error: 'Unknown action: ' + msg.action });
    }
  });

  return true; // keep message channel open for async
});
