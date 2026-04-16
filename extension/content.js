// AgentOS Bridge - Content Script v4.3.0
// FIXES: All message contracts aligned with background.js
// - resp.data -> resp.context
// - send() spreads data onto message (no wrapper)
// - All tag payloads match background.js expectations
// - Added tabClick/tabType/tabWait handlers

(function() {
  'use strict';

  var processedNodes = new WeakSet();
  var processedTasks = {};
  var DEDUP_WINDOW = 60000;

  var statusBadge = null;
  var loopBtn = null;
  var sessionBtn = null;

  var isConnected = false;
  var autoLoopEnabled = false;
  var loopTimer = null;
  var sessionActive = false;
  var loopCount = 0;
  var tagCount = 0;
  var currentSessionId = null;

  // =======================================
  // UI INJECTION
  // =======================================
  function injectUI() {
    if (document.getElementById('agentos-badge')) return;
    var container = document.createElement('div');
    container.id = 'agentos-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;';

    statusBadge = document.createElement('div');
    statusBadge.id = 'agentos-badge';
    statusBadge.style.cssText = 'background:#1a1a2e;color:#00d4ff;padding:8px 16px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 4px 20px rgba(0,212,255,0.3);border:1px solid #00d4ff33;display:flex;align-items:center;gap:8px;transition:all 0.3s;';
    statusBadge.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#666;display:inline-block;" id="agentos-dot"></span><span id="agentos-status">AgentOS</span>';

    var panel = document.createElement('div');
    panel.id = 'agentos-panel';
    panel.style.cssText = 'display:none;background:#1a1a2e;border:1px solid #00d4ff33;border-radius:12px;padding:12px;margin-bottom:8px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

    loopBtn = document.createElement('button');
    loopBtn.id = 'agentos-loop-btn';
    loopBtn.style.cssText = 'width:100%;padding:8px;border:1px solid #00d4ff55;background:transparent;color:#00d4ff;border-radius:8px;cursor:pointer;font-size:12px;margin-bottom:6px;transition:all 0.2s;';
    loopBtn.textContent = '\u25B6 Start Loop';
    loopBtn.onclick = toggleLoop;

    sessionBtn = document.createElement('button');
    sessionBtn.id = 'agentos-session-btn';
    sessionBtn.style.cssText = 'width:100%;padding:8px;border:1px solid #22c55e55;background:transparent;color:#22c55e;border-radius:8px;cursor:pointer;font-size:12px;margin-bottom:6px;transition:all 0.2s;';
    sessionBtn.textContent = '\u26A1 Start Session';
    sessionBtn.onclick = toggleSession;

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
    if (state === 'connected') dot.style.background = '#22c55e';
    else if (state === 'working') dot.style.background = '#f59e0b';
    else if (state === 'error') dot.style.background = '#ef4444';
    else dot.style.background = '#666';
  }

  function updateStats() {
    var stats = document.getElementById('agentos-stats');
    if (stats) stats.textContent = 'Loops: ' + loopCount + ' | Tags: ' + tagCount;
  }

  // =======================================
  // SESSION MANAGEMENT
  // =======================================
  function toggleSession() {
    if (sessionActive) endSession();
    else startSession();
  }

  function startSession() {
    currentSessionId = 'S-' + Date.now();
    sessionActive = true;
    _rateLimits = {};
    sessionBtn.textContent = '\u23F9 End Session';
    sessionBtn.style.borderColor = '#ef444455';
    sessionBtn.style.color = '#ef4444';
    updateUI('working', 'Loading context...');

    // FIX: buildContext returns {success, context} not {success, data}
    chrome.runtime.sendMessage({ type: 'buildContext' }, function(resp) {
      if (chrome.runtime.lastError || !resp || !resp.success) {
        var errMsg = (resp && resp.error) ? resp.error : 'Failed to load context';
        updateUI('error', 'Context error');
        injectMessage('[AgentOS] Error loading context: ' + errMsg + '. Please check your connection.');
        return;
      }

      // FIX: use resp.context (matches background.js sendResponse)
      var prompt = buildSessionPrompt(resp.context, currentSessionId);

      chrome.runtime.sendMessage({ type: 'startSession', sessionId: currentSessionId });
      updateUI('working', 'Session Active');
      injectMessage(prompt);
    });
  }

  function buildSessionPrompt(ctx, sessionId) {
    if (!ctx) ctx = {};
    var p = '';
    p += '=== AGENTOS SESSION START ===\n';
    p += 'Session ID: ' + sessionId + '\n';
    p += 'Time: ' + new Date().toLocaleString() + '\n\n';

    if (ctx.soul) {
      p += '--- YOUR MEMORY (from your SOUL Doc) ---\n';
      p += ctx.soul.substring(0, 4000);
      p += '\n\n';
    }

    if (ctx.tasks && ctx.tasks !== '(empty)') {
      p += '--- YOUR CURRENT TASKS ---\n' + ctx.tasks + '\n\n';
    } else {
      p += '--- YOUR CURRENT TASKS ---\n(No tasks yet. Add some with [ADD_TASK: description])\n\n';
    }

    if (ctx.sessions && ctx.sessions !== '(empty)') {
      p += '--- RECENT SESSIONS ---\n' + ctx.sessions + '\n\n';
    }

    if (ctx.skills && ctx.skills !== '(empty)') {
      p += '--- YOUR SKILLS ---\n' + ctx.skills + '\n\n';
    }

    if (ctx.agents && ctx.agents !== '(empty)') {
      p += '--- ACTIVE AGENTS ---\n' + ctx.agents + '\n\n';
    }

    p += '--- INSTRUCTIONS ---\n';
    p += 'You are an autonomous AI agent running on AgentOS. ';
    p += 'You have persistent memory (the SOUL doc above), a database (Google Sheets), ';
    p += 'and can take real actions using command tags.\n\n';
    p += 'AVAILABLE COMMAND TAGS:\n';
    p += 'Memory: [SAVE_NOTE: text] [SHEET_WRITE: tab|range|data] [SHEET_READ: tab|range] ';
    p += '[SHEET_APPEND: tab|data] [TASK_DONE: task] [ADD_TASK: task] [SKIP: reason]\n';
    p += 'Browser: [TAB_OPEN: url] [TAB_SCRAPE: url] [TAB_CLICK: selector] [TAB_TYPE: selector|text] ';
    p += '[TAB_READ] [TAB_LIST] [TAB_CLOSE: tabId] [TAB_WAIT: ms] [BROWSE: query]\n';
    p += 'Skills: [SKILL_CREATE: name|content] [SKILL_SEARCH: query] [SKILL_RECALL: name] [SKILL_LIST]\n';
    p += 'Schedule: [SCHEDULE_TASK: title|time|recurrence] [SCHEDULE_LIST] [SCHEDULE_CANCEL: query]\n';
    p += 'Agents: [SPAWN_AGENT: name|role] [AGENT_MSG: name|msg] [AGENT_LIST]\n';
    p += 'Email: [EMAIL_NOTIFY: to|subject|body] [EMAIL_CHECK]\n';
    p += 'Session: [SESSION_COMPLETE: summary]\n\n';
    p += 'RULES:\n';
    p += '1. Read your memory above. Continue where you left off.\n';
    p += '2. Work on your TODO tasks. Use command tags to take real actions.\n';
    p += '3. After each action, wait for the [RESULT] before continuing.\n';
    p += '4. Save important findings with [SAVE_NOTE: ...].\n';
    p += '5. Mark completed tasks with [TASK_DONE: task].\n';
    p += '6. When done, use [SESSION_COMPLETE: summary of what you did].\n\n';
    p += 'Begin autonomous work now. What is your first action?\n';
    p += '=== END CONTEXT ===';
    return p;
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

  // =======================================
  // AUTO-LOOP ENGINE
  // =======================================
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
    updateStats();
    scanAllNodes();
    loopTimer = setTimeout(runLoop, 3000);
  }

  // =======================================
  // TAG SCANNING ENGINE
  // FIX: All payloads now match background.js msg.* expectations
  // =======================================
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

    // -- MEMORY TAGS (FIX: field names match background.js) --
    handleTag(text, /\[SAVE_NOTE:\s*(.+?)\]/g, function(m) {
      send('saveNote', { text: m[1] });
    });
    handleTag(text, /\[SHEET_WRITE:\s*(.+?)\|(.+?)\|(.+?)\]/g, function(m) {
      send('sheetWrite', { range: m[1].trim() + '!' + m[2].trim(), values: [[m[3].trim()]] });
    });
    handleTag(text, /\[SHEET_READ:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('sheetRead', { range: m[1].trim() + '!' + m[2].trim() });
    });
    handleTag(text, /\[SHEET_APPEND:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('sheetAppend', { range: m[1].trim() + '!A:Z', values: [[m[2].trim()]] });
    });
    handleTag(text, /\[TASK_DONE:\s*(.+?)\]/g, function(m) {
      send('taskDone', { task: m[1] });
    });
    handleTag(text, /\[ADD_TASK:\s*(.+?)\]/g, function(m) {
      send('addTask', { task: m[1] });
    });
    handleTag(text, /\[SKIP:\s*(.+?)\]/g, function(m) {
      injectResult('skip', { success: true, data: 'Skipped: ' + m[1] });
    });

    // -- BROWSER TAGS --
    handleTag(text, /\[TAB_OPEN:\s*(.+?)\]/g, function(m) {
      var u = m[1].trim();
      if (!/^https?:\/\//i.test(u)) { injectResult('tabOpen',{error:'URL blocked (must be http/https): '+u}); return; }
      send('tabOpen', { url: u });
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
      send('tabClose', { tabId: parseInt(m[1].trim()) });
    });
    handleTag(text, /\[TAB_WAIT:\s*(\d+)\]/g, function(m) {
      send('tabWait', { ms: parseInt(m[1]) });
    });
    handleTag(text, /\[BROWSE:\s*(.+?)\]/g, function(m) {
      send('tabOpen', { url: 'https://www.google.com/search?q=' + encodeURIComponent(m[1]) });
    });

    // -- SKILL TAGS (FIX: content->code, improvement->code) --
    handleTag(text, /\[SKILL_CREATE:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('skillCreate', { name: m[1].trim(), code: m[2].trim() });
    });
    handleTag(text, /\[SKILL_SEARCH:\s*(.+?)\]/g, function(m) {
      send('skillSearch', { query: m[1].trim() });
    });
    handleTag(text, /\[SKILL_RECALL:\s*(.+?)\]/g, function(m) {
      send('skillRecall', { name: m[1].trim() });
    });
    handleTag(text, /\[SKILL_IMPROVE:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('skillImprove', { name: m[1].trim(), code: m[2].trim() });
    });
    handleTag(text, /\[SKILL_LIST\]/g, function(m) {
      send('skillList', {});
    });

    // -- SCHEDULER TAGS (FIX: name->title, when->time, action->recurrence) --
    handleTag(text, /\[SCHEDULE_TASK:\s*(.+?)\|(.+?)\|(.+?)\]/g, function(m) {
      send('scheduleTask', { title: m[1].trim(), time: m[2].trim(), recurrence: m[3].trim() });
    });
    handleTag(text, /\[SCHEDULE_LIST\]/g, function(m) {
      send('scheduleList', {});
    });
    handleTag(text, /\[SCHEDULE_CANCEL:\s*(.+?)\]/g, function(m) {
      send('scheduleCancel', { query: m[1].trim() });
    });

    // -- MULTI-AGENT TAGS (FIX: agent->name) --
    handleTag(text, /\[SPAWN_AGENT:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('spawnAgent', { name: m[1].trim(), soul: m[2].trim() });
    });
    handleTag(text, /\[AGENT_MSG:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('agentMsg', { name: m[1].trim(), message: m[2].trim() });
    });
    handleTag(text, /\[ASSIGN_TASK:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('assignTask', { name: m[1].trim(), task: m[2].trim() });
    });
    handleTag(text, /\[AGENT_LIST\]/g, function(m) {
      send('agentList', {});
    });
    handleTag(text, /\[AGENT_DONE:\s*(.+?)\]/g, function(m) {
      send('agentDone', { name: m[1].trim() });
    });

    // -- EMAIL TAGS --
    handleTag(text, /\[EMAIL_NOTIFY:\s*(.+?)\|(.+?)\|(.+?)\]/g, function(m) {
      send('emailNotify', { to: m[1].trim(), subject: m[2].trim(), body: m[3].trim() });
    });
    handleTag(text, /\[EMAIL_REPORT:\s*(.+?)\|(.+?)\]/g, function(m) {
      send('emailReport', { to: 'me', subject: m[1].trim(), body: m[2].trim() });
    });
    handleTag(text, /\[EMAIL_CHECK\]/g, function(m) {
      send('emailCheck', {});
    });

    // -- SESSION TAG --
    handleTag(text, /\[SESSION_COMPLETE:\s*(.+?)\]/g, function(m) {
      send('endSession', { summary: m[1] });
      endSession();
    });
  }

  // =======================================
  // HELPER FUNCTIONS
  // =======================================
  function handleTag(text, regex, callback) {
    var match;
    while ((match = regex.exec(text)) !== null) {
      var tagKey = match[0];
      var now = Date.now();
      if (processedTasks[tagKey] && (now - processedTasks[tagKey]) < DEDUP_WINDOW) continue;
      processedTasks[tagKey] = now;
      tagCount++;
      updateStats();
      try { callback(match); } catch (e) { console.error('[AgentOS] Tag handler error:', e); }
    }
  }

  // FIX: send() now spreads data onto the message object
  // Before: chrome.runtime.sendMessage({ type: type, data: data })
  // After:  chrome.runtime.sendMessage({ type: type, ...data })
  // This way background.js can read msg.range, msg.values, msg.task etc directly
  var _rateLimits = {};
  var _caps = { emailNotify: 5, emailReport: 5, spawnAgent: 3, tabOpen: 30, tabScrape: 30, scheduleTask: 10 };
  function send(type, data) {
    if (_caps[type] !== undefined) {
      _rateLimits[type] = (_rateLimits[type] || 0) + 1;
      if (_rateLimits[type] > _caps[type]) {
        injectResult(type, { error: 'Rate limit reached for ' + type + ' (max ' + _caps[type] + '/session)' });
        return;
      }
    }
    updateUI('working', 'Executing: ' + type);
    var message = { type: type };
    for (var key in data) {
      if (data.hasOwnProperty(key)) message[key] = data[key];
    }
    chrome.runtime.sendMessage(message, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[AgentOS] Send error:', chrome.runtime.lastError);
        injectResult(type, { error: chrome.runtime.lastError.message });
        updateUI('error', 'Error: ' + type);
        return;
      }
      if (response) injectResult(type, response);
      updateUI(sessionActive ? 'working' : 'connected', sessionActive ? 'Session Active' : 'AgentOS Ready');
    });
  }

  // =======================================
  // RESULT INJECTION
  // =======================================
  function injectResult(type, data) {
    var resultText = '[RESULT:' + type + '] ';
    if (data.error) {
      resultText += 'ERROR: ' + data.error;
    } else if (data.success !== undefined) {
      resultText += data.success ? 'OK' : 'FAILED';
      if (data.data) resultText += ' | ' + (typeof data.data === 'string' ? data.data : JSON.stringify(data.data).substring(0, 500));
      if (data.result) resultText += ' | ' + (typeof data.result === 'string' ? data.result : JSON.stringify(data.result).substring(0, 500));
      if (data.text) resultText += ' | ' + String(data.text).replace(/\[([A-Z_]+)(:[^\]]*)?\]/g,'($1)').substring(0, 500);
      if (data.tasks) resultText += ' | ' + data.tasks;
      if (data.skills) resultText += ' | ' + data.skills;
      if (data.agents) resultText += ' | ' + data.agents;
      if (data.inbox) resultText += ' | ' + data.inbox;
      if (data.results) resultText += ' | ' + data.results;
      if (data.code) resultText += ' | ' + data.code.substring(0, 500);
    } else {
      resultText += JSON.stringify(data).substring(0, 500);
    }
    injectMessage(resultText);
  }

  function injectMessage(text) {
    var selectors = [
      '#prompt-textarea',
      'textarea[placeholder*="message"]', 'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Send"]', 'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Type"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][class*="input"]',
      'div[contenteditable="true"][class*="ProseMirror"]',
      'textarea[data-id]', 'textarea'
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
    if (input.tagName === 'TEXTAREA') {
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.contentEditable === 'true') {
      input.focus();
      input.innerHTML = '';
      var p = document.createElement('p');
      p.textContent = text;
      input.appendChild(p);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (autoLoopEnabled) setTimeout(function() { autoSend(); }, 800);
  }

  function autoSend() {
    var sendSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]', 'button[aria-label*="send"]',
      'button[class*="send"]', 'button[class*="Send"]',
      'form button[type="submit"]'
    ];
    for (var i = 0; i < sendSelectors.length; i++) {
      var btn = document.querySelector(sendSelectors[i]);
      if (btn && !btn.disabled) { btn.click(); return; }
    }
    var input = document.querySelector('#prompt-textarea') || document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
  }

  function showFloatingResult(text) {
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#1a1a2e;color:#00d4ff;padding:12px 20px;border-radius:12px;font-size:12px;z-index:99999;max-width:500px;word-wrap:break-word;border:1px solid #00d4ff33;box-shadow:0 4px 20px rgba(0,0,0,0.4);white-space:pre-wrap;max-height:300px;overflow-y:auto;';
    toast.textContent = text.substring(0, 500);
    document.body.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; setTimeout(function() { toast.remove(); }, 500); }, 8000);
  }

  // =======================================
  // MUTATION OBSERVER
  // =======================================
  var observer = new MutationObserver(function(mutations) {
    if (!sessionActive) return;
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          var messages = node.querySelectorAll ? node.querySelectorAll(
            '[class*="message"], [class*="response"], [class*="markdown"], [class*="prose"]'
          ) : [];
          messages.forEach(function(msg) {
            if (!processedNodes.has(msg)) { processedNodes.add(msg); scanNode(msg); }
          });
          if (!processedNodes.has(node) && node.textContent && node.textContent.includes('[')) {
            processedNodes.add(node);
            scanNode(node);
          }
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // =======================================
  // MESSAGE LISTENER (FIX: injectPrompt reads msg.text)
  // =======================================
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'startSession') {
      if (msg.sessionId) currentSessionId = msg.sessionId;
      if (!sessionActive) startSession();
      sendResponse({ok: true});
    } else if (msg.type === 'endSession') {
      if (sessionActive) endSession();
      sendResponse({ok: true});
    } else if (msg.type === 'toggleLoop') {
      autoLoopEnabled = !autoLoopEnabled;
      sendResponse({loop: autoLoopEnabled});
    } else if (msg.type === 'injectPrompt') {
      injectMessage(msg.text);
      sendResponse({ok: true});
    } else if (msg.type === 'getContentState') {
      sendResponse({active: sessionActive, loop: autoLoopEnabled, session: currentSessionId});
    }
    return true;
  });

  // =======================================
  // INIT
  // =======================================
  function init() {
    injectUI();
    console.log('[AgentOS] Content script v4.3 loaded');
    console.log('[AgentOS] All message contracts aligned with background.js');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

