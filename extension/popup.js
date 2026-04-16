// AgentOS Bridge - Popup Script v3.0.0
// Session management UI + doc/sheet connection + task display

document.addEventListener('DOMContentLoaded', function() {
  // Existing elements
  var connStatus = document.getElementById('connStatus');
  var docIdDisplay = document.getElementById('docIdDisplay');
  var sheetIdDisplay = document.getElementById('sheetIdDisplay');
  var docUrlInput = document.getElementById('docUrlInput');
  var sheetUrlInput = document.getElementById('sheetUrlInput');
  var connectBtn = document.getElementById('connectBtn');
  var connectSheetBtn = document.getElementById('connectSheetBtn');
  var readDocBtn = document.getElementById('readDocBtn');
  var disconnectBtn = document.getElementById('disconnectBtn');
  var todoList = document.getElementById('todoList');
  var doneList = document.getElementById('doneList');

  // v3.0 Session elements
  var sessionBtn = document.getElementById('sessionBtn');
  var sessionIndicator = document.getElementById('sessionIndicator');
  var sessionDot = document.getElementById('sessionDot');
  var sessionStatusText = document.getElementById('sessionStatusText');
  var sessionStats = document.getElementById('sessionStats');
  var statActions = document.getElementById('statActions');
  var statDuration = document.getElementById('statDuration');
  var statSession = document.getElementById('statSession');

  // Session state
  var sessionActive = false;
  var sessionStartTime = null;
  var sessionTimer = null;

  function extractDocId(url) {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url.trim();
  }

  function extractSheetId(url) {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url.trim();
  }

  function updateUI(loggedIn, docId, sheetId) {
    if (loggedIn && docId) {
      connStatus.textContent = 'Connected';
      connStatus.className = 'value connected';
      docIdDisplay.textContent = docId.substring(0, 20) + '...';
      docIdDisplay.className = 'value';
    } else if (loggedIn) {
      connStatus.textContent = 'Logged in - no doc';
      connStatus.className = 'value';
      docIdDisplay.textContent = '---';
      docIdDisplay.className = 'value none';
    } else {
      connStatus.textContent = 'Not connected';
      connStatus.className = 'value none';
      docIdDisplay.textContent = '---';
      docIdDisplay.className = 'value none';
    }
    if (sheetId) {
      sheetIdDisplay.textContent = sheetId.substring(0, 20) + '...';
      sheetIdDisplay.className = 'value connected';
    } else {
      sheetIdDisplay.textContent = 'None (optional)';
      sheetIdDisplay.className = 'value none';
    }
  }

  function loadTasks(docText) {
    if (!docText) return;
    var todoItems = [];
    var doneItems = [];
    var lines = docText.split('\n');
    var inTodo = false;
    var inDone = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('== TODO ==') !== -1) { inTodo = true; inDone = false; continue; }
      if (line.indexOf('== DONE ==') !== -1) { inTodo = false; inDone = true; continue; }
      if (line.indexOf('== STATUS ==') !== -1 || line.indexOf('== NOTES ==') !== -1 ||
          line.indexOf('== BROWSER') !== -1 || line.indexOf('== SHEET') !== -1 ||
          line.indexOf('== LIVE') !== -1 || line.indexOf('== WHAT') !== -1 ||
          line.indexOf('== SESSION') !== -1) {
        inTodo = false; inDone = false; continue;
      }
      if (inTodo && line.indexOf('[ ]') === 0) todoItems.push(line.substring(4).trim());
      if (inDone && (line.indexOf('[x]') === 0 || line.indexOf('[SKIPPED]') === 0)) doneItems.push(line);
    }
    if (todoItems.length > 0) {
      todoList.innerHTML = '';
      for (var t = 0; t < todoItems.length; t++) {
        var div = document.createElement('div');
        div.className = 'task-item';
        div.textContent = todoItems[t];
        todoList.appendChild(div);
      }
    } else {
      todoList.innerHTML = '<div class="task-item" style="color:#4caf50">No pending tasks</div>';
    }
    if (doneItems.length > 0) {
      doneList.innerHTML = '';
      var start = Math.max(0, doneItems.length - 5);
      for (var d = start; d < doneItems.length; d++) {
        var div = document.createElement('div');
        div.className = 'task-item';
        div.textContent = doneItems[d];
        doneList.appendChild(div);
      }
    } else {
      doneList.innerHTML = '<div class="task-item" style="color:#666">No completed tasks yet</div>';
    }
}

  // ========= SESSION UI MANAGEMENT v3.0 =========
  function updateSessionUI(active, sessionId, actionCount) {
    sessionActive = active;
    if (active) {
      sessionBtn.textContent = 'End Session';
      sessionBtn.className = 'btn btn-session active';
      sessionIndicator.className = 'session-indicator running';
      sessionDot.className = 'session-dot running';
      sessionStatusText.textContent = 'Session running...';
      sessionStats.style.display = 'grid';
      if (sessionId) statSession.textContent = sessionId.substring(0, 8);
      if (actionCount !== undefined) statActions.textContent = actionCount;
      if (!sessionStartTime) sessionStartTime = Date.now();
      startSessionTimer();
    } else {
      sessionBtn.textContent = 'Start Session';
      sessionBtn.className = 'btn btn-session';
      sessionIndicator.className = 'session-indicator idle';
      sessionDot.className = 'session-dot';
      sessionStatusText.textContent = 'No active session';
      sessionStats.style.display = 'none';
      sessionStartTime = null;
      stopSessionTimer();
    }
  }

  function startSessionTimer() {
    stopSessionTimer();
    sessionTimer = setInterval(function() {
      if (sessionStartTime) {
        var elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
        if (elapsed < 60) statDuration.textContent = elapsed + 's';
        else if (elapsed < 3600) statDuration.textContent = Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's';
        else statDuration.textContent = Math.floor(elapsed / 3600) + 'h ' + Math.floor((elapsed % 3600) / 60) + 'm';
      }
    }, 1000);
  }

  function stopSessionTimer() {
    if (sessionTimer) {
      clearInterval(sessionTimer);
      sessionTimer = null;
    }
  }

  // ========= SESSION BUTTON =========
  if (sessionBtn) {
    sessionBtn.addEventListener('click', function() {
      if (sessionActive) {
        // End session - tell content script
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'endSessionFromPopup' });
          }
        });
        updateSessionUI(false);
      } else {
        // Start session - tell content script
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'startSessionFromPopup' });
          }
        });
        updateSessionUI(true, 'starting...', 0);
      }
    });
  }

  // ========= CHECK STATUS ON LOAD =========
  chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
    if (resp) {
      updateUI(resp.loggedIn, resp.docId, resp.sheetId);
      if (resp.loggedIn && resp.docId) {
        chrome.runtime.sendMessage({ action: 'readDoc' }, function(docResp) {
          if (docResp && docResp.success) loadTasks(docResp.text);
        });
      }
    }
  });

  // ========= CONNECT DOC =========
  connectBtn.addEventListener('click', function() {
    var url = docUrlInput.value.trim();
    if (!url) return;
    var docId = extractDocId(url);
    chrome.runtime.sendMessage({ action: 'checkAuth' }, function(resp) {
      if (resp && resp.loggedIn) {
        chrome.runtime.sendMessage({ action: 'setDocId', docId: docId }, function() {
          updateUI(true, docId, null);
          docUrlInput.value = '';
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'connected' });
          });
          chrome.runtime.sendMessage({ action: 'readDoc' }, function(docResp) {
            if (docResp && docResp.success) loadTasks(docResp.text);
          });
        });
      } else {
        chrome.runtime.sendMessage({ action: 'login' }, function(loginResp) {
          if (loginResp && loginResp.success) {
            chrome.runtime.sendMessage({ action: 'setDocId', docId: docId }, function() {
              updateUI(true, docId, null);
              docUrlInput.value = '';
            });
          }
        });
      }
    });
  });

  // ========= CONNECT SHEET =========
  connectSheetBtn.addEventListener('click', function() {
    var url = sheetUrlInput.value.trim();
    if (!url) return;
    var sheetId = extractSheetId(url);
    chrome.runtime.sendMessage({ action: 'setSheetId', sheetId: sheetId }, function() {
      sheetIdDisplay.textContent = sheetId.substring(0, 20) + '...';
      sheetIdDisplay.className = 'value connected';
      sheetUrlInput.value = '';
    });
  });

  // ========= READ DOC =========
  readDocBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
          if (resp && resp.success) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'pasteText', text: resp.text });
            loadTasks(resp.text);
          }
        });
      }
    });
  });

  // ========= DISCONNECT =========
  disconnectBtn.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'logout' }, function() {
      updateUI(false, null, null);
      updateSessionUI(false);
      todoList.innerHTML = '<div class="task-item" style="color:#666">Not connected</div>';
      doneList.innerHTML = '<div class="task-item" style="color:#666">Not connected</div>';
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'disconnected' });
      });
    });
  });

});// AgentOS Bridge - Popup Script v2.0.0
// Handles popup UI, doc/sheet connection, task display
document.addEventListener('DOMContentLoaded', function() {
  var connStatus = document.getElementById('connStatus');
  var docIdDisplay = document.getElementById('docIdDisplay');
  var sheetIdDisplay = document.getElementById('sheetIdDisplay');
  var docUrlInput = document.getElementById('docUrlInput');
  var sheetUrlInput = document.getElementById('sheetUrlInput');
  var connectBtn = document.getElementById('connectBtn');
  var connectSheetBtn = document.getElementById('connectSheetBtn');
  var readDocBtn = document.getElementById('readDocBtn');
  var disconnectBtn = document.getElementById('disconnectBtn');
  var todoList = document.getElementById('todoList');
  var doneList = document.getElementById('doneList');

  function extractDocId(url) {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url.trim();
  }

  function extractSheetId(url) {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url.trim();
  }

  function updateUI(loggedIn, docId, sheetId) {
    if (loggedIn && docId) {
      connStatus.textContent = 'Connected';
      connStatus.className = 'value connected';
      docIdDisplay.textContent = docId.substring(0, 20) + '...';
      docIdDisplay.className = 'value';
    } else if (loggedIn) {
      connStatus.textContent = 'Logged in - no doc';
      connStatus.className = 'value';
      docIdDisplay.textContent = '---';
      docIdDisplay.className = 'value none';
    } else {
      connStatus.textContent = 'Not connected';
      connStatus.className = 'value none';
      docIdDisplay.textContent = '---';
      docIdDisplay.className = 'value none';
    }
    if (sheetId) {
      sheetIdDisplay.textContent = sheetId.substring(0, 20) + '...';
      sheetIdDisplay.className = 'value connected';
    } else {
      sheetIdDisplay.textContent = 'None (optional)';
      sheetIdDisplay.className = 'value none';
    }
  }

  function loadTasks(docText) {
    if (!docText) return;
    var todoItems = [];
    var doneItems = [];
    var lines = docText.split('\n');
    var inTodo = false;
    var inDone = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('== TODO ==') !== -1) { inTodo = true; inDone = false; continue; }
      if (line.indexOf('== DONE ==') !== -1) { inTodo = false; inDone = true; continue; }
      if (line.indexOf('== STATUS ==') !== -1 || line.indexOf('== NOTES ==') !== -1 ||
          line.indexOf('== BROWSER') !== -1 || line.indexOf('== SHEET') !== -1) {
        inTodo = false; inDone = false; continue;
      }
      if (inTodo && line.indexOf('[ ]') === 0) todoItems.push(line.substring(4).trim());
      if (inDone && (line.indexOf('[x]') === 0 || line.indexOf('[SKIPPED]') === 0)) doneItems.push(line);
    }
    if (todoItems.length > 0) {
      todoList.innerHTML = '';
      for (var t = 0; t < todoItems.length; t++) {
        var div = document.createElement('div');
        div.className = 'task-item';
        div.textContent = todoItems[t];
        todoList.appendChild(div);
      }
    } else {
      todoList.innerHTML = '<div class="task-item" style="color:#4caf50">No pending tasks</div>';
    }
    if (doneItems.length > 0) {
      doneList.innerHTML = '';
      var start = Math.max(0, doneItems.length - 5);
      for (var d = start; d < doneItems.length; d++) {
        var div = document.createElement('div');
        div.className = 'task-item';
        div.textContent = doneItems[d];
        doneList.appendChild(div);
      }
    } else {
      doneList.innerHTML = '<div class="task-item" style="color:#666">No completed tasks yet</div>';
    }
  }

  // Check status on load
  chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
    if (resp) {
      updateUI(resp.loggedIn, resp.docId, resp.sheetId);
      if (resp.loggedIn && resp.docId) {
        chrome.runtime.sendMessage({ action: 'readDoc' }, function(docResp) {
          if (docResp && docResp.success) loadTasks(docResp.text);
        });
      }
    }
  });

  // Connect doc
  connectBtn.addEventListener('click', function() {
    var url = docUrlInput.value.trim();
    if (!url) return;
    var docId = extractDocId(url);
    chrome.runtime.sendMessage({ action: 'checkAuth' }, function(resp) {
      if (resp && resp.loggedIn) {
        chrome.runtime.sendMessage({ action: 'setDocId', docId: docId }, function() {
          updateUI(true, docId, null);
          docUrlInput.value = '';
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'connected' });
          });
          chrome.runtime.sendMessage({ action: 'readDoc' }, function(docResp) {
            if (docResp && docResp.success) loadTasks(docResp.text);
          });
        });
      } else {
        chrome.runtime.sendMessage({ action: 'login' }, function(loginResp) {
          if (loginResp && loginResp.success) {
            chrome.runtime.sendMessage({ action: 'setDocId', docId: docId }, function() {
              updateUI(true, docId, null);
              docUrlInput.value = '';
            });
          }
        });
      }
    });
  });

  // Connect sheet
  connectSheetBtn.addEventListener('click', function() {
    var url = sheetUrlInput.value.trim();
    if (!url) return;
    var sheetId = extractSheetId(url);
    chrome.runtime.sendMessage({ action: 'setSheetId', sheetId: sheetId }, function() {
      sheetIdDisplay.textContent = sheetId.substring(0, 20) + '...';
      sheetIdDisplay.className = 'value connected';
      sheetUrlInput.value = '';
    });
  });

  // Read doc
  readDocBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
          if (resp && resp.success) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'pasteText', text: resp.text });
            loadTasks(resp.text);
          }
        });
      }
    });
  });

  // Disconnect
  disconnectBtn.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'logout' }, function() {
      updateUI(false, null, null);
      todoList.innerHTML = '<div class="task-item" style="color:#666">Not connected</div>';
      doneList.innerHTML = '<div class="task-item" style="color:#666">Not connected</div>';
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'disconnected' });
      });
    });
  });
});
