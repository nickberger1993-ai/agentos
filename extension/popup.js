// AgentOS Bridge - Popup Script

document.addEventListener('DOMContentLoaded', function() {

  var loginSection = document.getElementById('loginSection');
  var docSection = document.getElementById('docSection');
  var statusSection = document.getElementById('statusSection');
  var loginBtn = document.getElementById('loginBtn');
  var connectDocBtn = document.getElementById('connectDocBtn');
  var disconnectBtn = document.getElementById('disconnectBtn');

  // ===========================================
  // CHECK CURRENT STATE
  // ===========================================

  function checkStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
      if (chrome.runtime.lastError) {
        showLogin();
        return;
      }
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
  // UI STATES
  // ===========================================

  function showLogin() {
    loginSection.style.display = 'block';
    docSection.style.display = 'none';
    statusSection.style.display = 'none';
  }

  function showDocInput() {
    loginSection.style.display = 'none';
    docSection.style.display = 'block';
    statusSection.style.display = 'none';
  }

  function showStatus(data) {
    loginSection.style.display = 'none';
    docSection.style.display = 'none';
    statusSection.style.display = 'block';

    var statusText = document.getElementById('statusText');
    if (statusText) {
      statusText.textContent = 'Connected to doc: ' + (data.docId || '').substring(0, 20) + '...';
    }

    // Load tasks from doc
    loadTasks();
  }

  // ===========================================
  // ACTIONS
  // ===========================================

  loginBtn.addEventListener('click', function() {
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'login' }, function(resp) {
      if (resp && resp.success) {
        showDocInput();
      } else {
        loginBtn.textContent = 'Sign in with Google';
        loginBtn.disabled = false;
        var errEl = document.getElementById('loginError');
        if (errEl) errEl.textContent = resp ? resp.error : 'Login failed';
      }
    });
  });

  connectDocBtn.addEventListener('click', function() {
    var docUrl = document.getElementById('docUrl').value.trim();
    // Extract doc ID from URL
    var match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    var docId = match ? match[1] : docUrl;

    if (!docId) {
      alert('Please enter a valid Google Doc URL');
      return;
    }

    chrome.runtime.sendMessage({ action: 'setDocId', docId: docId }, function(resp) {
      if (resp && resp.success) {
        // Notify content script that we're connected
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'connected', docId: docId });
          }
        });
        showStatus({ docId: docId });
      }
    });
  });

  disconnectBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'logout' }, function() {
      // Also notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'disconnected' });
        }
      });
      showLogin();
    });
  });

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

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('== TODO ==') !== -1) { inTodo = true; inDone = false; continue; }
          if (line.indexOf('== DONE ==') !== -1) { inDone = true; inTodo = false; continue; }
          if (line.indexOf('== ') === 0 && line.indexOf(' ==') !== -1) { inTodo = false; inDone = false; continue; }

          if (inTodo && line.indexOf('[ ]') === 0) {
            var taskText = line.substring(3).trim();
            var li = document.createElement('li');
            li.textContent = taskText;
            li.style.cursor = 'pointer';
            li.title = 'Click to mark done';
            li.addEventListener('click', (function(t) {
              return function() {
                chrome.runtime.sendMessage({ action: 'taskDone', taskText: t });
                this.style.textDecoration = 'line-through';
                this.style.opacity = '0.5';
              };
            })(taskText));
            todoList.appendChild(li);
          }

          if (inDone && line.indexOf('[') === 0) {
            var doneText = line;
            var li2 = document.createElement('li');
            li2.textContent = doneText;
            li2.style.opacity = '0.6';
            doneList.appendChild(li2);
          }
        }
      }
    });
  }

  // Start
  checkStatus();
});
