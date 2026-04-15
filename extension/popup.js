// AgentOS Bridge - Popup Script v2.0.0
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
    // Parse TODO
    var todoItems = [];
    var doneItems = [];
    var lines = docText.split('\n');
    var inTodo = false;
    var inDone = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('== TODO ==') !== -1) { inTodo = true; inDone = false; continue; }
      if (line.indexOf('== DONE ==') !== -1) { inTodo = false; inDone = true; continue; }
      if (line.indexOf('== STATUS ==') !== -1 || line.indexOf('== NOTES ==') !== -1 || line.indexOf('== BROWSER') !== -1 || line.indexOf('== SHEET') !== -1) { inTodo = false; inDone = false; continue; }

      if (inTodo && line.indexOf('[ ]') === 0) {
        todoItems.push(line.substring(4).trim());
      }
      if (inDone && (line.indexOf('[x]') === 0 || line.indexOf('[SKIPPED]') === 0)) {
        doneItems.push(line);
      }
    }

    // Render TODO
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

    // Render DONE (last 5)
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
          // Notify content script
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'connected' });
          });
          // Load tasks
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
});// AgentOS Bridge - Popup Script
document.addEventListener('DOMContentLoaded', function() {
  var loginSection = document.getElementById('loginSection');
  var docSection = document.getElementById('docSection');
  var statusSection = document.getElementById('statusSection');
  var loginBtn = document.getElementById('loginBtn');
  var connectDocBtn = document.getElementById('connectDocBtn');
  var disconnectBtn = document.getElementById('disconnectBtn');
  var readDocBtn = document.getElementById('readDocBtn');

  // ===========================================
  // CHECK CURRENT STATE
  // ===========================================
  function checkStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
      if (chrome.runtime.lastError) {
        console.log('[AgentOS Popup] Error getting status:', chrome.runtime.lastError.message);
        showLogin();
        return;
      }
      console.log('[AgentOS Popup] Status:', JSON.stringify(resp));
      if (resp && resp.loggedIn && resp.docId) {
        showStatus(resp);
      } else if (resp && resp.loggedIn) {
        showDocInput();
      } else {
        showLogin();
      }
    });
  }

  // ===========================================
  // UI STATES - use classList for reliable toggling
  // ===========================================
  function hideAll() {
    loginSection.classList.add('hidden');
    docSection.classList.add('hidden');
    statusSection.classList.add('hidden');
  }

  function showLogin() {
    hideAll();
    loginSection.classList.remove('hidden');
  }

  function showDocInput() {
    hideAll();
    docSection.classList.remove('hidden');
  }

  function showStatus(data) {
    hideAll();
    statusSection.classList.remove('hidden');

    var statusText = document.getElementById('statusText');
    var docIdDisplay = document.getElementById('docIdDisplay');

    if (statusText) {
      statusText.textContent = 'Connected';
      statusText.style.color = '#22c55e';
    }
    if (docIdDisplay && data.docId) {
      docIdDisplay.textContent = data.docId.substring(0, 20) + '...';
      docIdDisplay.title = data.docId;
    }
    loadTasks();
  }

  // ===========================================
  // ACTIONS
  // ===========================================
  loginBtn.addEventListener('click', function() {
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;

    chrome.runtime.sendMessage({ action: 'login' }, function(resp) {
      if (chrome.runtime.lastError) {
        console.log('[AgentOS Popup] Login error:', chrome.runtime.lastError.message);
        loginBtn.textContent = 'Sign in with Google';
        loginBtn.disabled = false;
        var errEl = document.getElementById('loginError');
        if (errEl) {
          errEl.textContent = chrome.runtime.lastError.message;
          errEl.classList.remove('hidden');
        }
        return;
      }
      if (resp && resp.success) {
        showDocInput();
      } else {
        loginBtn.textContent = 'Sign in with Google';
        loginBtn.disabled = false;
        var errEl = document.getElementById('loginError');
        if (errEl) {
          errEl.textContent = resp ? resp.error : 'Login failed';
          errEl.classList.remove('hidden');
        }
      }
    });
  });

  connectDocBtn.addEventListener('click', function() {
    var docUrl = document.getElementById('docUrl').value.trim();
    var match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    var docId = match ? match[1] : docUrl;

    if (!docId) {
      var errEl = document.getElementById('docError');
      if (errEl) {
        errEl.textContent = 'Please enter a valid Google Doc URL';
        errEl.classList.remove('hidden');
      }
      return;
    }

    console.log('[AgentOS Popup] Connecting doc:', docId);
    chrome.runtime.sendMessage({ action: 'setDocId', docId: docId }, function(resp) {
      if (resp && resp.success) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'connected', docId: docId });
          }
        });
        showStatus({ docId: docId });
      }
    });
  });

  disconnectBtn.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'logout' }, function() {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'disconnected' });
        }
      });
      showLogin();
    });
  });

  if (readDocBtn) {
    readDocBtn.addEventListener('click', function() {
      readDocBtn.textContent = 'Reading...';
      readDocBtn.disabled = true;

      chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
        readDocBtn.textContent = 'Read Doc';
        readDocBtn.disabled = false;

        if (resp && resp.success && resp.text) {
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'pasteText', text: resp.text });
            }
          });
        } else {
          var statusText = document.getElementById('statusText');
          if (statusText) {
            statusText.textContent = 'Error: ' + (resp ? resp.error : 'Failed');
            statusText.style.color = '#ef4444';
          }
        }
      });
    });
  }

  // ===========================================
  // LOAD TASKS FROM DOC
  // ===========================================
  function loadTasks() {
    chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
      if (resp && resp.success && resp.text) {
        var todoList = document.getElementById('todoList');
        var doneList = document.getElementById('doneList');
        if (!todoList || !doneList) return;

        todoList.innerHTML = '';
        doneList.innerHTML = '';

        var lines = resp.text.split('\n');
        var inTodo = false;
        var inDone = false;
        var todoCount = 0;
        var doneCount = 0;

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();

          if (line.indexOf('== TODO ==') !== -1) { inTodo = true; inDone = false; continue; }
          if (line.indexOf('== DONE ==') !== -1) { inDone = true; inTodo = false; continue; }
          if (line.indexOf('== ') === 0 && line.indexOf(' ==') !== -1) { inTodo = false; inDone = false; continue; }

          if (inTodo && line.indexOf('[ ]') === 0) {
            var taskText = line.substring(3).trim();
            var li = document.createElement('li');
            li.textContent = taskText;
            li.style.cssText = 'cursor:pointer;padding:6px 0;border-bottom:1px solid #1a1a1a;font-size:12px;color:#ccc';
            li.title = 'Click to mark done';
            li.addEventListener('click', (function(t) {
              return function() {
                chrome.runtime.sendMessage({ action: 'taskDone', taskText: t });
                this.style.textDecoration = 'line-through';
                this.style.opacity = '0.5';
              };
            })(taskText));
            todoList.appendChild(li);
            todoCount++;
          }

          if (inDone && line.indexOf('[') === 0 && doneCount < 5) {
            var li2 = document.createElement('li');
            li2.textContent = line;
            li2.style.cssText = 'opacity:0.6;padding:6px 0;border-bottom:1px solid #1a1a1a;font-size:12px;color:#888';
            doneList.appendChild(li2);
            doneCount++;
          }
        }

        if (todoCount === 0) {
          todoList.innerHTML = '<li style="color:#555;font-size:12px;text-align:center;padding:16px">No open tasks</li>';
        }
        if (doneCount === 0) {
          doneList.innerHTML = '<li style="color:#555;font-size:12px;text-align:center;padding:16px">No completed tasks yet</li>';
        }
      } else {
        console.log('[AgentOS Popup] Failed to load tasks:', resp ? resp.error : 'no response');
      }
    });
  }

  // Start
  checkStatus();
});
