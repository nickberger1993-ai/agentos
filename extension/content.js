// AgentOS Bridge - Content Script
// Injects into AI chat pages (Claude, ChatGPT, Gemini)
// Monitors AI output for AgentOS commands and executes them

(function() {
  'use strict';

  // Command pattern: [AGENTOS:action:param1:param2...]
  var CMD_PATTERN = /\[AGENTOS:(\w+):([^\]]+)\]/g;

  // Alternative patterns the AI might use
  var ALT_PATTERNS = [
    /\[UPDATE_DOC:\s*(.+?)\]/g,
    /\[TASK_DONE:\s*(.+?)\]/g,
    /\[ADD_TASK:\s*(.+?)\]/g,
    /\[ADD_LINK:\s*(.+?)\]/g,
    /\[NEXT:\s*(.+?)\]/g
  ];

  var processedNodes = new WeakSet();
  var statusBadge = null;

  // ============================================
  // STATUS BADGE (floating indicator)
  // ============================================

  function createStatusBadge() {
    if (statusBadge) return;
    statusBadge = document.createElement('div');
    statusBadge.id = 'agentos-badge';
    statusBadge.innerHTML = '<span class="agentos-dot"></span> AgentOS';
    document.body.appendChild(statusBadge);

    // Check connection status
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
      if (resp && resp.connected) {
        statusBadge.classList.add('connected');
        statusBadge.title = 'Connected to: ' + (resp.title || resp.docId);
      } else {
        statusBadge.classList.add('disconnected');
        statusBadge.title = 'No doc connected. Click the AgentOS extension icon to connect.';
      }
    });
  }

  function flashBadge(message, type) {
    if (!statusBadge) return;
    var oldText = statusBadge.innerHTML;
    statusBadge.innerHTML = '<span class="agentos-dot ' + (type || 'info') + '"></span> ' + message;
    statusBadge.classList.add('flash');
    setTimeout(function() {
      statusBadge.innerHTML = oldText;
      statusBadge.classList.remove('flash');
    }, 3000);
  }

  // ============================================
  // COMMAND PARSER
  // ============================================

  function parseCommands(text) {
    var commands = [];

    // Standard format: [AGENTOS:action:params]
    var match;
    CMD_PATTERN.lastIndex = 0;
    while ((match = CMD_PATTERN.exec(text)) !== null) {
      commands.push({ action: match[1].toLowerCase(), params: match[2] });
    }

    // Alternative formats
    ALT_PATTERNS.forEach(function(pattern, idx) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        var actions = ['update', 'markDone', 'addTask', 'addLink', 'updateNext'];
        commands.push({ action: actions[idx], params: match[1].trim() });
      }
    });

    return commands;
  }

  // ============================================
  // COMMAND EXECUTOR
  // ============================================

  function executeCommand(cmd) {
    switch (cmd.action) {
      case 'markdone':
      case 'taskdone':
      case 'done':
        chrome.runtime.sendMessage({ action: 'markDone', task: cmd.params }, function(resp) {
          if (resp && resp.success) {
            flashBadge('Task done: ' + cmd.params.substring(0, 30), 'success');
          } else {
            flashBadge('Error: ' + (resp ? resp.error : 'unknown'), 'error');
          }
        });
        break;

      case 'addtask':
      case 'newtask':
      case 'todo':
        chrome.runtime.sendMessage({ action: 'addTask', task: cmd.params }, function(resp) {
          if (resp && resp.success) {
            flashBadge('Task added: ' + cmd.params.substring(0, 30), 'success');
          } else {
            flashBadge('Error: ' + (resp ? resp.error : 'unknown'), 'error');
          }
        });
        break;

      case 'addlink':
      case 'link':
        var parts = cmd.params.split('|');
        chrome.runtime.sendMessage({ action: 'addLink', url: parts[0].trim(), label: parts[1] ? parts[1].trim() : '' }, function(resp) {
          if (resp && resp.success) {
            flashBadge('Link added', 'success');
          }
        });
        break;

      case 'updatenext':
      case 'next':
      case 'priority':
        chrome.runtime.sendMessage({ action: 'updateNext', priority: cmd.params }, function(resp) {
          if (resp && resp.success) {
            flashBadge('Priority updated', 'success');
          }
        });
        break;

      case 'update':
        // Generic update - append to doc
        chrome.runtime.sendMessage({ action: 'appendText', text: '\n' + cmd.params + '\n' }, function(resp) {
          if (resp && resp.success) {
            flashBadge('Doc updated', 'success');
          }
        });
        break;

      default:
        console.log('[AgentOS] Unknown command:', cmd.action, cmd.params);
    }
  }

  // ============================================
  // DOM OBSERVER - watches for new AI messages
  // ============================================

  function scanNode(node) {
    if (processedNodes.has(node)) return;

    var text = node.textContent || '';
    if (text.indexOf('[AGENTOS:') > -1 || text.indexOf('[UPDATE_DOC:') > -1 ||
        text.indexOf('[TASK_DONE:') > -1 || text.indexOf('[ADD_TASK:') > -1 ||
        text.indexOf('[ADD_LINK:') > -1 || text.indexOf('[NEXT:') > -1) {

      processedNodes.add(node);
      var commands = parseCommands(text);
      if (commands.length > 0) {
        console.log('[AgentOS] Found', commands.length, 'command(s)');
        commands.forEach(executeCommand);
      }
    }
  }

  function observeChat() {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            // Check the node and its children
            scanNode(node);
            node.querySelectorAll && node.querySelectorAll('*').forEach(scanNode);
          }
        });
        // Also check modified nodes
        if (mutation.type === 'characterData' && mutation.target.parentElement) {
          scanNode(mutation.target.parentElement);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log('[AgentOS] Chat observer started');
  }

  // ============================================
  // INJECT "READ DOC" BUTTON
  // ============================================

  function injectReadButton() {
    // Add a small floating button to read the current doc state
    var btn = document.createElement('button');
    btn.id = 'agentos-read-btn';
    btn.textContent = '📄 Read Doc';
    btn.title = 'Copy current AgentOS doc state to clipboard';
    btn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'readDoc' }, function(resp) {
        if (resp && resp.success) {
          navigator.clipboard.writeText(resp.text).then(function() {
            flashBadge('Doc copied to clipboard!', 'success');
            btn.textContent = '✓ Copied!';
            setTimeout(function() { btn.textContent = '📄 Read Doc'; }, 2000);
          });
        } else {
          flashBadge('Error reading doc', 'error');
        }
      });
    });
    document.body.appendChild(btn);
  }

  // ============================================
  // INIT
  // ============================================

  function init() {
    createStatusBadge();
    observeChat();
    injectReadButton();
    console.log('[AgentOS Bridge] Loaded on', window.location.hostname);
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
