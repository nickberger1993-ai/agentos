// AgentOS Bridge - Content Script v4.0.0
// Full autonomous agent loop with Skills, Scheduler, Multi-Agent, Email Gateway
// Tags: TASK_DONE, ADD_TASK, SKIP, BROWSE, SAVE_NOTE, SHEET_*, TAB_*,
// SKILL_*, SCHEDULE_*, SPAWN_AGENT, AGENT_MSG, ASSIGN_TASK, AGENT_LIST, AGENT_DONE,
// EMAIL_NOTIFY, EMAIL_REPORT, EMAIL_CHECK, SESSION_COMPLETE

(function() {
  'use strict';

  var processedNodes = new WeakSet();
  var processedTasks = {};
  var DEDUP_WINDOW = 60000;

  // UI elements
  var statusBadge = null;
  var loopBtn = null;
  var sessionBtn = null;

  // State
  var isConnected = false;
  var autoLoopEnabled = false;
  var loopTimer = null;
  var sessionActive = false;
  var loopCount = 0;
  var currentSessionId = null;

  // ═══════════════════════════════════════════
  // UI INJECTION
  // ═══════════════════════════════════════════
  function injectUI() {
    if (document.getElementById('agentos-badge')) return;

    var container = document.createElement('div');
    container.id = 'agentos-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;';

    // Status badge
    statusBadge = document.createElement('div');
    statusBadge.id = 'agentos-badge';
    statusBadge.style.cssText = 'background:#1a1a2e;color:#00d4ff;padding:8px 16px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 4px 20px rgba(0,212,255,0.3);border:1px solid #00d4ff33;display:flex;align-items:center;gap:8px;transition:all 0.3s;';
    statusBadge.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#666;display:inline-block;" id="agentos-dot"></span><span id="agentos-status">AgentOS</span>';

    // Controls panel (hidden by default)
    var panel = document.createElement('div');
    panel.id = 'agentos-panel';
    panel.style.cssText = 'display:none;background:#1a1a2e;border:1px solid #00d4ff33;border-radius:12px;padding:12px;margin-bottom:8px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

    // Loop toggle button
    loopBtn = document.createElement('button');
    loopBtn.id = 'agentos-loop-btn';
    loopBtn.style.cssText = 'width:100%;padding:8px;border:1px solid #00d4ff55;background:transparent;color:#00d4ff;border-radius:8px;cursor:pointer;font-size:12px;margin-bottom:6px;transition:all 0.2s;';
    loopBtn.textContent = '\u25B6 Start Loop';
    loopBtn.onclick = toggleLoop;

    // Session button
    sessionBtn = document.createElement('button');
    sessionBtn.id = 'agentos-session-btn';
    sessionBtn.style.cssText = 'width:100%;padding:8px;border:1px solid #22c55e55;background:transparent;color:#22c55e;border-radius:8px;cursor:pointer;font-size:12px;margin-bottom:6px;transition:all 0.2s;';
    sessionBtn.textContent = '\u26A1 Start Session';
    sessionBtn.onclick = toggleSession;

    // Stats display
    var stats = document.createElement('div');
    stats.id = 'agentos-stats';
    stats.style.cssText = 'color:#888;font-size:11px;text-align:center;padding-top:6px;border-top:1px solid #333;';
    stats.textContent = 'Loops: 0 | Tags: 0';

    panel.appendChild(loopBtn);
    panel.appendChild(sessionBtn);
    panel.appendChild(stats);
    container.appendChild(panel);
    container.appendChild(statusBadge);
    document.body.appendChild(container);

    statusBadge.onclick = function() {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    // Check connection
    chrome.runtime.sendMessage({ type: 'getState' }, function(resp) {
      if (resp && resp.connected) {
        isConnected = true;
        updateUI('connected', 'AgentOS Ready');
      } else {
        updateUI('disconnected', 'Not Connected');
      }
    });
  }

  function updateUI(state, text) {
    var dot = document.getElementById('agentos-dot');
    var status = document.getElementById('agentos-status');
    if (!dot || !status) return;
    status.textContent = text;
    if (state === 'connected') { dot.style.background = '#22c55e'; }
    else if (state === 'working') { dot.style.background = '#f59e0b'; dot.style.animation = 'pulse 1s infinite'; }
    else if (state === 'error') { dot.style.background = '#ef4444'; }
    else { dot.style.background = '#666'; }
  }

  function updateStats(loops, tags) {
    var stats = document.getElementById('agentos-stats');
    if (stats) stats.textContent = 'Loops: ' + loops + ' | Tags: ' + tags;
  }

  // ═══════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════
  function toggleSession() {
    if (sessionActive) {
      endSession();
    } else {
      startSession();
    }
  }

  function startSession() {
    currentSessionId = 'S-' + Date.now();
    sessionActive = true;
    sessionBtn.textContent = '\u23F9 End Session';
    sessionBtn.style.borderColor = '#ef444455';
    sessionBtn.style.color = '#ef4444';
    chrome.runtime.sendMessage({ type: 'startSession', sessionId: currentSessionId });
    updateUI('working', 'Session Active');

    // Inject session start prompt
    injectMessage('[SESSION START] ID: ' + currentSessionId + ' | Read your SOUL doc and current tasks. Begin autonomous work. Use command tags to take actions.');
  }

  function endSession() {
    sessionActive = false;
    sessionBtn.textContent = '\u26A1 Start Session';
    sessionBtn.style.borderColor = '#22c55e55';
    sessionBtn.style.color = '#22c55e';
    if (autoLoopEnabled) toggleLoop();
    chrome.runtime.sendMessage({ type: 'endSession', sessionId: currentSessionId });
    updateUI('connected', 'Session Ended');
    currentSessionId = null;
  }

  // ═══════════════════════════════════════════
  // AUTO-LOOP ENGINE
  // ═══════════════════════════════════════════
  function toggleLoop() {
    autoLoopEnabled = !autoLoopEnabled;
    if (autoLoopEnabled) {
      loopBtn.textContent = '\u23F8 Pause Loop';
      loopBtn.style.background = '#00d4ff22';
      runLoop();
    } else {
      loopBtn.textContent = '\u25B6 Start Loop';
      loopBtn.style.background = 'transparent';
      if (loopTimer) clearTimeout(loopTimer);
    }
  }

  function runLoop() {
    if (!autoLoopEnabled || !sessionActive) return;
    loopCount++;
    updateStats(loopCount, Object.keys(processedTasks).length);
    scanAllNodes();
    loopTimer = setTimeout(runLoop, 3000);
  }

  // ═══════════════════════════════════════════
  // TAG SCANNING ENGINE
  // ═══════════════════════════════════════════
  function scanAllNodes() {
    var messages = document.querySelectorAll(
      '[class*="message"], [class*="response"], [class*="answer"], ' +
      '[class*="markdown"], [class*="prose"], [class*="assistant"], ' +
      '[data-message-author-role="assistant"], [class*="bot"], [class*="reply"]'
    );
    messages.forEach(function(node) {
      if (!processedNodes.has(node)) {
        processedNodes.add(node);
        scanNode(node);
      }
    });
  }

  function scanNode(node) {
    var text = node.textContent || '';
    if (!text.includes('[')) return;

    // ── MEMORY TAGS ──
    handleTag(text, /\[SAVE_NOTE:\s*(.+?)\]/g, function(m) {
      send('saveNote', { note: m[1] });
    });
    handleTag(text, /\[SHEET_WRITE:\s*(.+?)\|(.+?)\|(.+?)\]/g, function(m) {
      send('sheetWrite', { sheet: m[1].trim(), range: m[2].trim(), data: m[3].trim() });
    });
    handleTag(text, /\[SHEET_READ:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('sheetRead', { sheet: m[1].trim(), range: m[2].trim() });
    });
    handleTag(text, /\[SHEET_APPEND:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('sheetAppend', { sheet: m[1].trim(), data: m[2].trim() });
    });
    handleTag(text, /\[TASK_DONE:\s*(.+?)\]/g, function(m) {
      send('taskDone', { task: m[1] });
    });
    handleTag(text, /\[ADD_TASK:\s*(.+?)\]/g, function(m) {
      send('addTask', { task: m[1] });
    });
    handleTag(text, /\[SKIP:\s*(.+?)\]/g, function(m) {
      send('skip', { reason: m[1] });
    });

    // ── BROWSER TAGS ──
    handleTag(text, /\[TAB_OPEN:\s*(.+?)\]/g, function(m) {
      send('tabOpen', { url: m[1].trim() });
    });
    handleTag(text, /\[TAB_SCRAPE:\s*(.+?)\]/g, function(m) {
      send('tabScrape', { url: m[1].trim() });
    });
    handleTag(text, /\[TAB_CLICK:\s*(.+?)\]/g, function(m) {
      send('tabClick', { selector: m[1].trim() });
    });
    handleTag(text, /\[TAB_TYPE:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('tabType', { selector: m[1].trim(), text: m[2].trim() });
    });
    handleTag(text, /\[TAB_READ\]/g, function(m) {
      send('tabRead', {});
    });
    handleTag(text, /\[TAB_LIST\]/g, function(m) {
      send('tabList', {});
    });
    handleTag(text, /\[TAB_CLOSE:\s*(.+?)\]/g, function(m) {
      send('tabClose', { tabId: m[1].trim() });
    });
    handleTag(text, /\[TAB_WAIT:\s*(\d+)\]/g, function(m) {
      send('tabWait', { ms: parseInt(m[1]) });
    });
    handleTag(text, /\[BROWSE:\s*(.+?)\]/g, function(m) {
      send('browse', { query: m[1] });
    });

    // ── SKILL TAGS ──
    handleTag(text, /\[SKILL_CREATE:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('skillCreate', { name: m[1].trim(), content: m[2].trim() });
    });
    handleTag(text, /\[SKILL_SEARCH:\s*(.+?)\]/g, function(m) {
      send('skillSearch', { query: m[1].trim() });
    });
    handleTag(text, /\[SKILL_RECALL:\s*(.+?)\]/g, function(m) {
      send('skillRecall', { name: m[1].trim() });
    });
    handleTag(text, /\[SKILL_IMPROVE:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('skillImprove', { name: m[1].trim(), improvement: m[2].trim() });
    });
    handleTag(text, /\[SKILL_LIST\]/g, function(m) {
      send('skillList', {});
    });

    // ── SCHEDULER TAGS ──
    handleTag(text, /\[SCHEDULE_TASK:\s*(.+?)\|(.+?)\|(.+?)\]/g, function(m) {
      send('scheduleTask', { name: m[1].trim(), when: m[2].trim(), action: m[3].trim() });
    });
    handleTag(text, /\[SCHEDULE_LIST\]/g, function(m) {
      send('scheduleList', {});
    });
    handleTag(text, /\[SCHEDULE_CANCEL:\s*(.+?)\]/g, function(m) {
      send('scheduleCancel', { name: m[1].trim() });
    });

    // ── MULTI-AGENT TAGS ──
    handleTag(text, /\[SPAWN_AGENT:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('spawnAgent', { name: m[1].trim(), role: m[2].trim() });
    });
    handleTag(text, /\[AGENT_MSG:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('agentMsg', { agent: m[1].trim(), message: m[2].trim() });
    });
    handleTag(text, /\[ASSIGN_TASK:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('assignTask', { agent: m[1].trim(), task: m[2].trim() });
    });
    handleTag(text, /\[AGENT_LIST\]/g, function(m) {
      send('agentList', {});
    });
    handleTag(text, /\[AGENT_DONE:\s*(.+?)\]/g, function(m) {
      send('agentDone', { agent: m[1].trim() });
    });

    // ── EMAIL GATEWAY TAGS ──
    handleTag(text, /\[EMAIL_NOTIFY:\s*(.+?)\|(.+?)\|(.+?)\]/g, function(m) {
      send('emailNotify', { to: m[1].trim(), subject: m[2].trim(), body: m[3].trim() });
    });
    handleTag(text, /\[EMAIL_REPORT:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('emailReport', { subject: m[1].trim(), body: m[2].trim() });
    });
    handleTag(text, /\[EMAIL_CHECK\]/g, function(m) {
      send('emailCheck', {});
    });

    // ── SESSION TAG ──
    handleTag(text, /\[SESSION_COMPLETE:\s*(.+?)\]/g, function(m) {
      send('sessionComplete', { summary: m[1] });
      endSession();
    });
  }

  // ═══════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════
  function handleTag(text, regex, callback) {
    var match;
    while ((match = regex.exec(text)) !== null) {
      var tagKey = match[0];
      var now = Date.now();
      if (processedTasks[tagKey] && (now - processedTasks[tagKey]) < DEDUP_WINDOW) continue;
      processedTasks[tagKey] = now;
      try {
        callback(match);
      } catch (e) {
        console.error('[AgentOS] Tag handler error:', e);
      }
    }
  }

  function send(type, data) {
    updateUI('working', 'Executing: ' + type);
    chrome.runtime.sendMessage({ type: type, data: data }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[AgentOS] Send error:', chrome.runtime.lastError);
        injectResult(type, { error: chrome.runtime.lastError.message });
        updateUI('error', 'Error: ' + type);
        return;
      }
      if (response) {
        injectResult(type, response);
      }
      updateUI(sessionActive ? 'working' : 'connected', sessionActive ? 'Session Active' : 'AgentOS Ready');
    });
  }

  // ═══════════════════════════════════════════
  // RESULT INJECTION
  // ═══════════════════════════════════════════
  function injectResult(type, data) {
    var resultText = '[RESULT:' + type + '] ';
    if (data.error) {
      resultText += 'ERROR: ' + data.error;
    } else if (data.success !== undefined) {
      resultText += data.success ? 'OK' : 'FAILED';
      if (data.data) resultText += ' | ' + (typeof data.data === 'string' ? data.data : JSON.stringify(data.data).substring(0, 500));
      if (data.message) resultText += ' | ' + data.message;
    } else {
      resultText += JSON.stringify(data).substring(0, 500);
    }
    injectMessage(resultText);
  }

  function injectMessage(text) {
    // Find the chat input and inject
    var selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Send"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Type"]',
      '#prompt-textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][class*="input"]',
      'textarea[data-id]',
      'textarea'
    ];

    var input = null;
    for (var i = 0; i < selectors.length; i++) {
      input = document.querySelector(selectors[i]);
      if (input) break;
    }

    if (!input) {
      console.warn('[AgentOS] No chat input found');
      showFloatingResult(text);
      return;
    }

    // Handle textarea
    if (input.tagName === 'TEXTAREA') {
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Handle contenteditable
    else if (input.contentEditable === 'true') {
      input.focus();
      input.textContent = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Auto-send if loop is active
    if (autoLoopEnabled) {
      setTimeout(function() {
        autoSend();
      }, 500);
    }
  }

  function autoSend() {
    // Try clicking send button
    var sendSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send"]',
      'button[aria-label="Send message"]',
      'button[class*="send"]',
      'button[type="submit"]',
      'form button:last-of-type'
    ];

    for (var i = 0; i < sendSelectors.length; i++) {
      var btn = document.querySelector(sendSelectors[i]);
      if (btn && !btn.disabled) {
        btn.click();
        return;
      }
    }

    // Fallback: try Enter key
    var input = document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    }
  }

  function showFloatingResult(text) {
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#1a1a2e;color:#00d4ff;padding:12px 20px;border-radius:12px;font-size:12px;z-index:99999;max-width:400px;word-wrap:break-word;border:1px solid #00d4ff33;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
    toast.textContent = text.substring(0, 300);
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s';
      setTimeout(function() { toast.remove(); }, 500);
    }, 5000);
  }

  // ═══════════════════════════════════════════
  // MUTATION OBSERVER - Real-time tag detection
  // ═══════════════════════════════════════════
  var observer = new MutationObserver(function(mutations) {
    if (!sessionActive) return;
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          // Check if this is a message container
          var messages = node.querySelectorAll ? node.querySelectorAll(
            '[class*="message"], [class*="response"], [class*="markdown"], [class*="prose"]'
          ) : [];
          messages.forEach(function(msg) {
            if (!processedNodes.has(msg)) {
              processedNodes.add(msg);
              scanNode(msg);
            }
          });
          // Also check the node itself
          if (!processedNodes.has(node) && node.textContent && node.textContent.includes('[')) {
            processedNodes.add(node);
            scanNode(node);
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ═══════════════════════════════════════════
  // MESSAGE LISTENER - Commands from popup/background
  // ═══════════════════════════════════════════
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'startSession') {
      startSession();
      sendResponse({ ok: true });
    } else if (msg.type === 'endSession') {
      endSession();
      sendResponse({ ok: true });
    } else if (msg.type === 'toggleLoop') {
      toggleLoop();
      sendResponse({ ok: true });
    } else if (msg.type === 'injectPrompt') {
      injectMessage(msg.text);
      sendResponse({ ok: true });
    } else if (msg.type === 'getContentState') {
      sendResponse({
        sessionActive: sessionActive,
        autoLoop: autoLoopEnabled,
        loopCount: loopCount,
        sessionId: currentSessionId
      });
    }
    return true;
  });

  // ═══════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════
  function init() {
    injectUI();
    console.log('[AgentOS] Content script v4.0 loaded - Full autonomous agent loop ready');
    console.log('[AgentOS] Tags: Memory(7) + Browser(10) + Skills(5) + Scheduler(3) + Multi-Agent(5) + Email(3) + Session(1) = 34 total');
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
