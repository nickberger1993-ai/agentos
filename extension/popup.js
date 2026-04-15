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
