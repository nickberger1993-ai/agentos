// AgentOS Bridge - Popup Script

document.addEventListener('DOMContentLoaded', function() {

  var loginSection = document.getElementById('loginSection');
  var docSection = document.getElementById('docSection');
  var statusSection = document.getElementById('statusSection');
  var loginBtn = document.getElementById('loginBtn');
  var connectDocBtn = document.getElementById('connectDocBtn');
  var disconnectBtn = document.getElementById('disconnectBtn');

  // ============================================
  // CHECK CURRENT STATE
  // ============================================

  function checkStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
      if (chrome.runtime.lastError) {
        showLogin();
        return;
      }

      if (resp && resp.connected) {
        showStatus(resp);
      } else {
        // Check if logged in
        chrome.identity.getAuthToken({ interactive: false }, function(token) {
          if (chrome.runtime.lastError || !token) {
            showLogin();
          } else {
            showDocInput();
          }
        });
      }
    });
  }

  // ============================================
  // UI STATES
  // ============================================

  function showLogin() {
    loginSection.classList.remove('hidden');
    docSection.classList.add('hidden');
    statusSection.classList.add('hidden');
  }

  function showDocInput() {
    loginSection.classList.add('hidden');
    docSection.classList.remove('hidden');
    statusSection.classList.add('hidden');
  }

  function showStatus(data) {
    loginSection.classList.add('hidden');
    docSection.classList.add('hidden');
    statusSection.classList.remove('hidden');

    // Update status card
    var titleEl = document.getElementById('docTitle');
    titleEl.textContent = data.title || 'AgentOS Doc';
    if (data.docUrl) {
      titleEl.href = data.docUrl.includes('docs.google.com') ? data.docUrl : 'https://docs.google.com/document/d/' + data.docId + '/edit';
    }

    document.getElementById('nextPriority').textContent = data.whatsNext || 'None set';

    if (data.error) {
      document.getElementById('connStatus').textContent = 'Error';
      document.getElementById('connStatus').style.color = '#ef4444';
    }

    // Render TODO list
    var taskList = document.getElementById('taskList');
    var todoCount = document.getElementById('todoCount');
    if (data.todos && data.todos.length > 0) {
      todoCount.textContent = data.todos.length;
      taskList.innerHTML = '';
      data.todos.forEach(function(task) {
        var li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = '<div class="task-checkbox" data-task="' + escapeHtml(task) + '"></div><span class="task-text">' + escapeHtml(task) + '</span>';
        taskList.appendChild(li);
      });

      // Add click handlers for checkboxes
      taskList.querySelectorAll('.task-checkbox').forEach(function(cb) {
        cb.addEventListener('click', function() {
          var taskText = this.dataset.task;
          this.classList.add('done');
          this.innerHTML = '&#10003;';
          chrome.runtime.sendMessage({ action: 'markDone', task: taskText }, function(resp) {
            if (resp && resp.success) {
              setTimeout(checkStatus, 500);
            }
          });
        });
      });
    } else {
      todoCount.textContent = '0';
      taskList.innerHTML = '<li class="empty">No tasks in TODO</li>';
    }

    // Render DONE list
    var doneList = document.getElementById('doneList');
    if (data.dones && data.dones.length > 0) {
      doneList.innerHTML = '';
      // Show last 5
      data.dones.slice(-5).reverse().forEach(function(done) {
        var li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = '<div class="task-checkbox done">&#10003;</div><span class="task-text" style="color:#666">' + escapeHtml(done) + '</span>';
        doneList.appendChild(li);
      });
    } else {
      doneList.innerHTML = '<li class="empty">No completed tasks yet</li>';
    }
  }

  // ============================================
  // ACTIONS
  // ============================================

  loginBtn.addEventListener('click', function() {
    loginBtn.textContent = 'Signing in...';
    loginBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'login' }, function(resp) {
      if (resp && resp.success) {
        showDocInput();
      } else {
        loginBtn.textContent = 'Sign in with Google';
        loginBtn.disabled = false;
        alert('Login failed: ' + (resp ? resp.error : 'Unknown error'));
      }
    });
  });

  connectDocBtn.addEventListener('click', function() {
    var url = document.getElementById('docInput').value.trim();
    if (!url) {
      document.getElementById('docError').textContent = 'Please enter a Google Doc URL';
      document.getElementById('docError').classList.remove('hidden');
      return;
    }
    if (!url.includes('docs.google.com') && !url.match(/^[a-zA-Z0-9_-]{20,}/)) {
      document.getElementById('docError').textContent = 'Please enter a valid Google Doc URL';
      document.getElementById('docError').classList.remove('hidden');
      return;
    }

    connectDocBtn.textContent = 'Connecting...';
    connectDocBtn.disabled = true;

    chrome.runtime.sendMessage({ action: 'setDoc', docId: url }, function(resp) {
      if (resp && resp.success) {
        checkStatus();
      } else {
        connectDocBtn.textContent = 'Connect';
        connectDocBtn.disabled = false;
        document.getElementById('docError').textContent = resp ? resp.error : 'Connection failed';
        document.getElementById('docError').classList.remove('hidden');
      }
    });
  });

  disconnectBtn.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.storage.local.remove(['docId', 'docUrl'], function() {
      showDocInput();
    });
  });

  // ============================================
  // HELPERS
  // ============================================

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Init
  checkStatus();
});
