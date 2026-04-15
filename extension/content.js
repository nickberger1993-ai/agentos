// AgentOS Bridge - Content Script v1.5.1
// Monitors AI output for commands, manages auto-loop agent cycle
// Fixes: dedup TASK_DONE detection, improved scanning

(function() {
  'use strict';

  var processedNodes = new WeakSet();
  var processedTasks = {};  // track task text -> timestamp to prevent duplicates
  var DEDUP_WINDOW = 30000; // 30 second window for dedup
  var statusBadge = null;
  var readDocBtn = null;
  var loopBtn = null;
  var isConnected = false;
  var autoLoopEnabled = false;
  var loopTimer = null;
  var loopCount = 0;
  var MAX_LOOPS = 50;
  var LOOP_DELAY = 5000;
  var waitingForResponse = false;

  // =========================================
  // DEDUP HELPER
  // =========================================

  function isDuplicate(type, taskText) {
    var key = type + ':' + taskText.trim().toLowerCase();
    var now = Date.now();
    if (processedTasks[key] && (now - processedTasks[key]) < DEDUP_WINDOW) {
      return true; // already processed recently
    }
    processedTasks[key] = now;
    return false;
  }

  // =========================================
  // UI ELEMENTS
  // =========================================

  function createBadge() {
    statusBadge = document.createElement('div');
    statusBadge.id = 'agentos-badge';
    statusBadge.innerHTML = '<span class="agentos-dot"></span> AgentOS';
    document.body.appendChild(statusBadge);

    readDocBtn = document.createElement('button');
    readDocBtn.id = 'agentos-read-btn';
    readDocBtn.textContent = 'Read Doc';
    readDocBtn.addEventListener('click', function() {
      doReadAndPaste();
    });
    document.body.appendChild(readDocBtn);

    loopBtn = document.createElement('button');
    loopBtn.id = 'agentos-loop-btn';
    loopBtn.textContent = 'Auto Loop: OFF';
    loopBtn.style.cssText = 'position:fixed;bottom:100px;right:20px;z-index:99999;padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#333;color:#888;transition:all 0.2s;';
    loopBtn.addEventListener('click', function() {
      toggleAutoLoop();
    });
    document.body.appendChild(loopBtn);
  }

  function updateLoopButton() {
    if (!loopBtn) return;
    if (autoLoopEnabled) {
      loopBtn.textContent = 'Auto Loop: ON (' + loopCount + ')';
      loopBtn.style.background = '#00ff88';
      loopBtn.style.color = '#000';
    } else {
      loopBtn.textContent = 'Auto Loop: OFF';
      loopBtn.style.background = '#333';
      loopBtn.style.color = '#888';
    }
  }

  function toggleAutoLoop() {
    autoLoopEnabled = !autoLoopEnabled;
    loopCount = 0;
    if (!autoLoopEnabled && loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
      waitingForResponse = false;
    }
    updateLoopButton();
    showNotification(autoLoopEnabled ? 'Auto-loop ENABLED' : 'Auto-loop DISABLED');
  }

  function updateBadgeStatus(connected) {
    isConnected = connected;
    if (statusBadge) {
      var dot = statusBadge.querySelector('.agentos-dot');
      if (dot) {
        dot.style.background = connected ? '#00ff88' : '#ff4444';
      }
    }
  }

  function showNotification(msg) {
    var notif = document.createElement('div');
    notif.className = 'agentos-notification';
    notif.textContent = msg;
    document.body.appendChild(notif);
    setTimeout(function() { notif.remove(); }, 3000);
  }

  // =========================================
  // CHAT INPUT HELPERS
  // =========================================

  function findChatInput() {
    return document.querySelector('#prompt-textarea') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector('textarea[data-id]') ||
      document.querySelector('textarea');
  }

  function insertTextIntoChat(input, text) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.focus();
      var p = input.querySelector('p');
      if (p) {
        p.textContent = text;
      } else {
        input.textContent = text;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function clickSendButton() {
    var sendBtn = document.querySelector('[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send prompt"]') ||
      document.querySelector('button[aria-label="Send"]') ||
      document.querySelector('form button[type="submit"]');

    if (!sendBtn) {
      var buttons = document.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (btn.querySelector('svg') && btn.closest('form')) {
          var rect = btn.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 200) {
            sendBtn = btn;
            break;
          }
        }
      }
    }

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return true;
    }

    var input = findChatInput();
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
      }));
      return true;
    }
    return false;
  }

  // =========================================
  // READ DOC AND PASTE
  // =========================================

  function doReadAndPaste(autoSend) {
    if (readDocBtn) {
      readDocBtn.textContent = 'Reading...';
      readDocBtn.disabled = true;
    }
    chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
      if (readDocBtn) {
        readDocBtn.textContent = 'Read Doc';
        readDocBtn.disabled = false;
      }
      if (resp && resp.success && resp.text) {
        var input = findChatInput();
        if (input) {
          insertTextIntoChat(input, resp.text);
          showNotification('Doc pasted into chat!');
          if (autoSend) {
            setTimeout(function() {
              var sent = clickSendButton();
              if (sent) {
                showNotification('Auto-sent! Waiting for response...');
                waitingForResponse = true;
              } else {
                showNotification('Could not auto-send. Please send manually.');
                waitingForResponse = false;
              }
            }, 1000);
          }
        } else {
          showNotification('Could not find chat input');
        }
      } else {
        showNotification(resp ? resp.error : 'Failed to read doc');
        if (autoLoopEnabled) {
          autoLoopEnabled = false;
          updateLoopButton();
          showNotification('Auto-loop stopped due to error');
        }
      }
    });
  }

  // =========================================
  // AUTO-LOOP ENGINE
  // =========================================

  function scheduleNextLoop() {
    if (!autoLoopEnabled) return;
    if (loopCount >= MAX_LOOPS) {
      autoLoopEnabled = false;
      updateLoopButton();
      showNotification('Auto-loop reached max (' + MAX_LOOPS + '). Stopped.');
      return;
    }

    showNotification('Next loop in ' + (LOOP_DELAY / 1000) + 's...');
    loopTimer = setTimeout(function() {
      loopCount++;
      updateLoopButton();
      // Clear dedup cache between loops
      processedTasks = {};
      doReadAndPaste(true);
    }, LOOP_DELAY);
  }

  function onAllTasksDone() {
    autoLoopEnabled = false;
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
    waitingForResponse = false;
    updateLoopButton();
    showNotification('ALL TASKS COMPLETE! Agent stopped.');
  }

  // =========================================
  // COMMAND SCANNER - only scans AI responses
  // =========================================

  function isInsideAssistantMessage(node) {
    var el = node;
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute('data-message-author-role') === 'assistant') return true;
      if (el.classList && el.classList.contains('font-claude-message')) return true;
      if (el.getAttribute && el.getAttribute('data-content-type') === 'response') return true;
      if (el.classList && (el.classList.contains('response-content') ||
        el.classList.contains('bot-message') ||
        el.classList.contains('assistant-message'))) return true;
      el = el.parentElement;
    }
    return false;
  }

  var pendingTaskActions = 0;

  function scanNode(node) {
    if (processedNodes.has(node)) return;
    if (!isInsideAssistantMessage(node)) return;

    var text = node.textContent || '';

    // Skip template text
    if (text.indexOf('exact task text') !== -1) return;
    if (text.indexOf('new task description') !== -1) return;
    if (text.indexOf('task name | reason') !== -1) return;
    if (text.indexOf('task text from the TODO') !== -1) return;

    // TASK_DONE
    var taskDoneRe = /\[TASK_DONE:\s*(.+?)\]/g;
    var match;
    while ((match = taskDoneRe.exec(text)) !== null) {
      processedNodes.add(node);
      var taskText = match[1].trim();

      // DEDUP: skip if we already processed this exact task recently
      if (isDuplicate('done', taskText)) {
        continue;
      }

      pendingTaskActions++;
      showNotification('Done: ' + taskText.substring(0, 40) + '...');
      (function(tt) {
        chrome.runtime.sendMessage({ action: 'taskDone', taskText: tt }, function(resp) {
          pendingTaskActions--;
          if (resp && resp.success) {
            showNotification('Moved to DONE: ' + tt.substring(0, 30));
            if (resp.counts && resp.counts.todo === 0) {
              onAllTasksDone();
            } else if (autoLoopEnabled && pendingTaskActions === 0) {
              scheduleNextLoop();
            }
          }
        });
      })(taskText);
    }

    // ADD_TASK
    var addTaskRe = /\[ADD_TASK:\s*(.+?)\]/g;
    while ((match = addTaskRe.exec(text)) !== null) {
      processedNodes.add(node);
      var newTask = match[1].trim();
      if (isDuplicate('add', newTask)) continue;
      showNotification('Adding: ' + newTask.substring(0, 40) + '...');
      chrome.runtime.sendMessage({ action: 'addTask', taskText: newTask }, function(resp) {
        if (resp && resp.success) {
          showNotification('Task added to doc!');
        }
      });
    }

    // SKIP
    var skipRe = /\[SKIP:\s*(.+?)\]/g;
    while ((match = skipRe.exec(text)) !== null) {
      processedNodes.add(node);
      var skipInfo = match[1].trim();
      var parts = skipInfo.split('|');
      var skipTask = parts[0].trim();
      var skipReason = parts.length > 1 ? parts[1].trim() : 'no reason given';
      if (isDuplicate('skip', skipTask)) continue;
      pendingTaskActions++;
      showNotification('Skipped: ' + skipTask.substring(0, 40));
      (function(st, sr) {
        chrome.runtime.sendMessage({ action: 'taskSkip', taskText: st, reason: sr }, function(resp) {
          pendingTaskActions--;
          if (resp && resp.success) {
            showNotification('Moved to SKIPPED: ' + st.substring(0, 30));
            if (resp.counts && resp.counts.todo === 0) {
              onAllTasksDone();
            } else if (autoLoopEnabled && pendingTaskActions === 0) {
              scheduleNextLoop();
            }
          }
        });
      })(skipTask, skipReason);
    }
  }

  // =========================================
  // MUTATION OBSERVER
  // =========================================

  var observer = new MutationObserver(function(mutations) {
    if (!isConnected) return;
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      for (var j = 0; j < mutation.addedNodes.length; j++) {
        var node = mutation.addedNodes[j];
        if (node.nodeType === 1) {
          scanNode(node);
          var children = node.querySelectorAll('p, span, div, li, code, pre');
          for (var k = 0; k < children.length; k++) {
            scanNode(children[k]);
          }
        }
      }
    }
  });

  // =========================================
  // MESSAGE HANDLER
  // =========================================

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'connected') {
      updateBadgeStatus(true);
      showNotification('AgentOS connected!');
    } else if (msg.action === 'disconnected') {
      updateBadgeStatus(false);
      showNotification('AgentOS disconnected');
    } else if (msg.action === 'pasteText') {
      var input = findChatInput();
      if (input) {
        insertTextIntoChat(input, msg.text);
        showNotification('Doc pasted into chat!');
      } else {
        showNotification('Could not find chat input');
      }
    }
  });

  // =========================================
  // INIT
  // =========================================

  function init() {
    createBadge();
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
      if (resp && resp.loggedIn && resp.docId) {
        updateBadgeStatus(true);
      } else {
        updateBadgeStatus(false);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
