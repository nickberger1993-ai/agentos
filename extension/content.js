// AgentOS Bridge - Content Script
// Injects into AI chat pages (Claude, ChatGPT, Gemini)
// Monitors AI output for AgentOS commands and executes them

(function() {
  'use strict';

  var processedNodes = new WeakSet();
  var statusBadge = null;
  var readDocBtn = null;
  var isConnected = false;

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
      readDocBtn.textContent = 'Reading...';
      readDocBtn.disabled = true;
      chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
        readDocBtn.textContent = 'Read Doc';
        readDocBtn.disabled = false;
        if (resp && resp.success && resp.text) {
          var input = findChatInput();
          if (input) {
            insertTextIntoChat(input, resp.text);
            showNotification('Doc pasted into chat!');
          } else {
            showNotification('Could not find chat input');
          }
        } else {
          showNotification(resp ? resp.error : 'Failed to read doc');
        }
      });
    });
    document.body.appendChild(readDocBtn);
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

  // =========================================
  // COMMAND SCANNER - only scans AI responses
  // =========================================

  function isInsideAssistantMessage(node) {
    // Walk up the DOM to check if this node is inside an AI response
    var el = node;
    while (el && el !== document.body) {
      // ChatGPT
      if (el.getAttribute && el.getAttribute('data-message-author-role') === 'assistant') return true;
      // Claude
      if (el.classList && el.classList.contains('font-claude-message')) return true;
      // Gemini
      if (el.getAttribute && el.getAttribute('data-content-type') === 'response') return true;
      // Generic: response containers often have these classes
      if (el.classList && (el.classList.contains('response-content') || el.classList.contains('bot-message') || el.classList.contains('assistant-message'))) return true;
      el = el.parentElement;
    }
    return false;
  }

  function scanNode(node) {
    if (processedNodes.has(node)) return;

    // CRITICAL: Only scan nodes inside AI/assistant responses
    if (!isInsideAssistantMessage(node)) return;

    var text = node.textContent || '';

    // Skip generic/template text
    if (text.indexOf('exact task text') !== -1) return;
    if (text.indexOf('new task description') !== -1) return;

    var taskDoneMatch = text.match(/\[TASK_DONE:\s*(.+?)\]/);
    if (taskDoneMatch) {
      processedNodes.add(node);
      var taskText = taskDoneMatch[1].trim();
      showNotification('Done: ' + taskText.substring(0, 40) + '...');
      chrome.runtime.sendMessage({ action: 'taskDone', taskText: taskText }, function(resp) {
        if (resp && resp.success) {
          showNotification('Task marked done in doc!');
        }
      });
    }

    var addTaskMatch = text.match(/\[ADD_TASK:\s*(.+?)\]/);
    if (addTaskMatch) {
      processedNodes.add(node);
      var newTask = addTaskMatch[1].trim();
      showNotification('Adding: ' + newTask.substring(0, 40) + '...');
      chrome.runtime.sendMessage({ action: 'addTask', taskText: newTask }, function(resp) {
        if (resp && resp.success) {
          showNotification('Task added to doc!');
        }
      });
    }

    var skipMatch = text.match(/\[SKIP:\s*(.+?)\]/);
    if (skipMatch) {
      processedNodes.add(node);
      var skipInfo = skipMatch[1].trim();
      showNotification('Skipped: ' + skipInfo.substring(0, 40) + '...');
      chrome.runtime.sendMessage({ action: 'appendToDoc', text: '\n[SKIPPED] ' + skipInfo });
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
