// AgentOS Bridge - Content Script v3.0.0
// Session Loop Engine: autonomous agent feedback loop
// Tags: TASK_DONE, ADD_TASK, SKIP, BROWSE, SHEET_*, SAVE_NOTE
// TAB_OPEN, TAB_SCRAPE, TAB_CLICK, TAB_TYPE, TAB_READ, TAB_LIST, TAB_CLOSE, TAB_WAIT
// NEW v3.0: SESSION_COMPLETE, startSession/endSession, always-on result injection

(function() {
  'use strict';

  var processedNodes = new WeakSet();
  var processedTasks = {};
  var DEDUP_WINDOW = 60000;

  // UI elements
  var statusBadge = null;
  var readDocBtn = null;
  var loopBtn = null;
  var sessionBtn = null;

  // State
  var isConnected = false;
  var autoLoopEnabled = false;
  var loopTimer = null;
  var loopCount = 0;
  var MAX_LOOPS = 50;
  var LOOP_DELAY = 5000;
  var waitingForResponse = false;
  var pendingToolActions = 0;
  var actionResults = [];

  // Session state
  var sessionActive = false;
  var currentSessionId = null;
  var sessionActionCount = 0;
  var sessionStartTime = null;

  function isDuplicate(type, text) {
    var key = type + ':' + text.trim().toLowerCase().replace(/\s+/g, ' ');
    var now = Date.now();
    if (processedTasks[key] && (now - processedTasks[key]) < DEDUP_WINDOW) return true;
    processedTasks[key] = now;
    return false;
  }

  // ========= UI =========
  function createBadge() {
    statusBadge = document.createElement('div');
    statusBadge.id = 'agentos-badge';
    statusBadge.innerHTML = '<span class="agentos-dot"></span> AgentOS';
    document.body.appendChild(statusBadge);

    readDocBtn = document.createElement('button');
    readDocBtn.id = 'agentos-read-btn';
    readDocBtn.textContent = 'Read Doc';
    readDocBtn.addEventListener('click', function() { doReadAndPaste(); });
    document.body.appendChild(readDocBtn);

    // Auto-loop toggle button
    loopBtn = document.createElement('button');
    loopBtn.id = 'agentos-loop-btn';
    loopBtn.textContent = 'Auto Loop: OFF';
    loopBtn.style.cssText = 'position:fixed;bottom:100px;right:20px;z-index:99999;padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#333;color:#888;transition:all 0.2s;';
    loopBtn.addEventListener('click', function() { toggleAutoLoop(); });
    document.body.appendChild(loopBtn);

    // Session start/end button
    sessionBtn = document.createElement('button');
    sessionBtn.id = 'agentos-session-btn';
    sessionBtn.textContent = 'Start Session';
    sessionBtn.style.cssText = 'position:fixed;bottom:140px;right:20px;z-index:99999;padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:#0066ff;color:#fff;transition:all 0.2s;';
    sessionBtn.addEventListener('click', function() {
      if (sessionActive) endSession();
      else startSession();
    });
    document.body.appendChild(sessionBtn);
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

  function updateSessionButton() {
    if (!sessionBtn) return;
    if (sessionActive) {
      sessionBtn.textContent = 'End Session (' + sessionActionCount + ')';
      sessionBtn.style.background = '#ff4444';
      sessionBtn.style.color = '#fff';
    } else {
      sessionBtn.textContent = 'Start Session';
      sessionBtn.style.background = '#0066ff';
      sessionBtn.style.color = '#fff';
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
      if (dot) dot.style.background = connected ? '#00ff88' : '#ff4444';
    }
  }

  function showNotification(msg) {
    var notif = document.createElement('div');
    notif.className = 'agentos-notification';
    notif.textContent = msg;
    document.body.appendChild(notif);
    setTimeout(function() { notif.remove(); }, 3000);
                                          }

  // ========= CHAT INPUT =========
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
      if (p) p.textContent = text;
      else input.textContent = text;
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

  // ========= RESULT INJECTION v3.0 =========
  // CRITICAL FIX: Results are ALWAYS injected back into chat
  // This is the core of the feedback loop - AI must always see tool results
  function injectResultIntoChat(resultText) {
    var input = findChatInput();
    if (!input) return false;
    var msg = '[RESULT]\n' + resultText + '\n[/RESULT]';
    insertTextIntoChat(input, msg);
    setTimeout(function() {
      clickSendButton();
      showNotification('Result injected into chat');
      if (sessionActive) sessionActionCount++;
      updateSessionButton();
    }, 500);
    return true;
  }

  // Queue results and send them batched after all pending actions complete
  function queueResult(text) {
    actionResults.push(text);
  }

  // v3.0 FIX: REMOVED the autoLoopEnabled gate
  // Results are ALWAYS flushed back to the AI so it can see what happened
  function flushResults() {
    if (actionResults.length === 0) return;
    var combined = actionResults.join('\n---\n');
    actionResults = [];
    // ALWAYS inject results - this is the feedback loop!
    setTimeout(function() {
      injectResultIntoChat(combined);
      waitingForResponse = true;
    }, 1000);
  }

  // ========= SESSION MANAGEMENT v3.0 =========
  function startSession() {
    showNotification('Starting session...');
    sessionActive = true;
    sessionActionCount = 0;
    sessionStartTime = Date.now();
    updateSessionButton();

    // Ask background to build the session prompt from Doc + Sheet memory
    chrome.runtime.sendMessage({ action: 'startSession' }, function(resp) {
      if (resp && resp.success && resp.prompt) {
        currentSessionId = resp.sessionId;
        showNotification('Session ' + resp.sessionId + ' started!');

        // Inject the session prompt into chat and auto-send
        var input = findChatInput();
        if (input) {
          insertTextIntoChat(input, resp.prompt);
          setTimeout(function() {
            var sent = clickSendButton();
            if (sent) {
              showNotification('Session prompt sent! Agent is working...');
              waitingForResponse = true;
              // Also enable auto-loop so the agent keeps going
              autoLoopEnabled = true;
              updateLoopButton();
            } else {
              showNotification('Could not auto-send prompt');
            }
          }, 1000);
        }
      } else {
        showNotification('Session start failed: ' + (resp ? resp.error : 'unknown'));
        sessionActive = false;
        updateSessionButton();
      }
    });
  }

  function endSession() {
    if (!sessionActive) return;
    showNotification('Ending session...');

    // Stop auto-loop
    autoLoopEnabled = false;
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
    waitingForResponse = false;
    updateLoopButton();

    // Tell background to write session summary to Doc + Sheet
    chrome.runtime.sendMessage({
      action: 'endSession',
      sessionId: currentSessionId,
      actionCount: sessionActionCount,
      duration: Math.round((Date.now() - (sessionStartTime || Date.now())) / 1000)
    }, function(resp) {
      if (resp && resp.success) {
        showNotification('Session ended. Summary saved!');
      } else {
        showNotification('Session end: ' + (resp ? resp.error : 'could not save summary'));
      }
    });

    sessionActive = false;
    currentSessionId = null;
    sessionActionCount = 0;
    sessionStartTime = null;
    updateSessionButton();
}

  // ========= READ DOC AND PASTE =========
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
                showNotification('Auto-sent! Waiting...');
                waitingForResponse = true;
              } else {
                showNotification('Could not auto-send');
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
        }
      }
    });
  }

  // ========= AUTO-LOOP ENGINE =========
  function scheduleNextLoop() {
    if (!autoLoopEnabled) return;
    if (loopCount >= MAX_LOOPS) {
      autoLoopEnabled = false;
      updateLoopButton();
      showNotification('Auto-loop max reached. Stopped.');
      return;
    }
    showNotification('Next loop in ' + (LOOP_DELAY / 1000) + 's...');
    loopTimer = setTimeout(function() {
      loopCount++;
      updateLoopButton();
      doReadAndPaste(true);
    }, LOOP_DELAY);
  }

  function onAllTasksDone() {
    showNotification('ALL TASKS COMPLETE!');
    // v3.0: End session when all tasks are done
    if (sessionActive) {
      endSession();
    }
    autoLoopEnabled = false;
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
    waitingForResponse = false;
    updateLoopButton();
  }

  function checkAndSchedule() {
    if (pendingToolActions === 0) {
      // Flush any queued results first - this is the feedback loop
      if (actionResults.length > 0) {
        flushResults();
      } else if (autoLoopEnabled) {
        scheduleNextLoop();
      }
    }
  }

  // ========= ASSISTANT MESSAGE CHECK =========
  function isInsideAssistantMessage(node) {
    var el = node;
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute('data-message-author-role') === 'assistant') return true;
      if (el.classList && el.classList.contains('font-claude-message')) return true;
      if (el.getAttribute && el.getAttribute('data-content-type') === 'response') return true;
      if (el.classList && (
        el.classList.contains('response-content') ||
        el.classList.contains('bot-message') ||
        el.classList.contains('assistant-message')
      )) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ========= COMMAND SCANNER =========
  function scanNode(node) {
    if (processedNodes.has(node)) return;
    if (!isInsideAssistantMessage(node)) return;
    var text = node.textContent || '';
    if (text.length < 10) return;

    // Skip template/instruction text
    if (text.indexOf('task text from the TODO') !== -1) return;
    if (text.indexOf('new task description') !== -1) return;
    if (text.indexOf('task text | reason') !== -1) return;
    if (text.indexOf('url to browse') !== -1) return;
    if (text.indexOf('exact task text from TODO') !== -1) return;
    if (text.indexOf('important finding here') !== -1) return;
    if (text.indexOf('css selector') !== -1 && text.indexOf('[TAB_') !== -1) return;

    var match;

    // ===== SESSION_COMPLETE v3.0 =====
    // AI outputs this when it decides the session goal is achieved
    var sessionCompleteRe = /\[SESSION_COMPLETE(?::\s*(.+?))?\]/g;
    while ((match = sessionCompleteRe.exec(text)) !== null) {
      processedNodes.add(node);
      var summary = match[1] ? match[1].trim() : 'Session completed by AI';
      if (isDuplicate('sessioncomplete', summary)) continue;
      showNotification('AI ended session: ' + summary.substring(0, 50));
      if (sessionActive) endSession();
    }

    // ===== TASK_DONE =====
    var taskDoneRe = /\[TASK_DONE:\s*(.+?)\]/g;
    while ((match = taskDoneRe.exec(text)) !== null) {
      processedNodes.add(node);
      var taskText = match[1].trim();
      if (isDuplicate('done', taskText)) continue;
      pendingToolActions++;
      showNotification('Done: ' + taskText.substring(0, 40) + '...');
      (function(tt) {
        chrome.runtime.sendMessage({ action: 'taskDone', taskText: tt }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Moved to DONE: ' + tt.substring(0, 30));
            queueResult('TASK_DONE ' + tt + ': SUCCESS. Remaining TODO: ' + (resp.counts ? resp.counts.todo : '?'));
            if (resp.counts && resp.counts.todo === 0) onAllTasksDone();
            else checkAndSchedule();
          } else {
            queueResult('TASK_DONE ' + tt + ': ERROR ' + (resp ? resp.error : 'unknown'));
            checkAndSchedule();
          }
        });
      })(taskText);
    }

    // ===== ADD_TASK =====
    var addTaskRe = /\[ADD_TASK:\s*(.+?)\]/g;
    while ((match = addTaskRe.exec(text)) !== null) {
      processedNodes.add(node);
      var newTask = match[1].trim();
      if (isDuplicate('add', newTask)) continue;
      showNotification('Adding task: ' + newTask.substring(0, 40));
      chrome.runtime.sendMessage({ action: 'addTask', taskText: newTask }, function(resp) {
        if (resp && resp.success) {
          queueResult('ADD_TASK ' + newTask + ': SUCCESS');
        }
      });
    }

    // ===== SKIP =====
    var skipRe = /\[SKIP:\s*(.+?)\]/g;
    while ((match = skipRe.exec(text)) !== null) {
      processedNodes.add(node);
      var skipInfo = match[1].trim();
      var parts = skipInfo.split('|');
      var skipTask = parts[0].trim();
      var skipReason = parts.length > 1 ? parts[1].trim() : 'no reason';
      if (isDuplicate('skip', skipTask)) continue;
      pendingToolActions++;
      showNotification('Skipped: ' + skipTask.substring(0, 40));
      (function(st, sr) {
        chrome.runtime.sendMessage({ action: 'taskSkip', taskText: st, reason: sr }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            queueResult('SKIP ' + st + ': SUCCESS');
            if (resp.counts && resp.counts.todo === 0) onAllTasksDone();
            else checkAndSchedule();
          } else {
            checkAndSchedule();
          }
        });
      })(skipTask, skipReason);
    }

    // ===== BROWSE =====
    var browseRe = /\[BROWSE:\s*(.+?)\]/g;
    while ((match = browseRe.exec(text)) !== null) {
      processedNodes.add(node);
      var url = match[1].trim();
      if (isDuplicate('browse', url)) continue;
      pendingToolActions++;
      showNotification('Browsing: ' + url.substring(0, 40) + '...');
      (function(u) {
        chrome.runtime.sendMessage({ action: 'browse', url: u }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Browsed: ' + u.substring(0, 30));
            queueResult('BROWSE ' + u + ': ' + (resp.text || '').substring(0, 1500));
          } else {
            queueResult('BROWSE ' + u + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(url);
                        }

    // ===== SHEET_WRITE =====
    var sheetWriteRe = /\[SHEET_WRITE:\s*(.+?)\]/g;
    while ((match = sheetWriteRe.exec(text)) !== null) {
      processedNodes.add(node);
      var swData = match[1].trim();
      if (isDuplicate('sheetwrite', swData)) continue;
      var swParts = swData.split('|').map(function(s) { return s.trim(); });
      if (swParts.length < 2) continue;
      var swRange = swParts[0];
      var swValues = [];
      for (var si = 1; si < swParts.length; si++) {
        swValues.push(swParts[si].split(',').map(function(s) { return s.trim(); }));
      }
      pendingToolActions++;
      showNotification('Writing to sheet: ' + swRange);
      (function(r, v) {
        chrome.runtime.sendMessage({ action: 'sheetWrite', range: r, values: v }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Sheet updated: ' + r);
            queueResult('SHEET_WRITE ' + r + ': SUCCESS');
          } else {
            showNotification('Sheet write failed');
            queueResult('SHEET_WRITE ' + r + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(swRange, swValues);
    }

    // ===== SHEET_READ =====
    var sheetReadRe = /\[SHEET_READ:\s*(.+?)\]/g;
    while ((match = sheetReadRe.exec(text)) !== null) {
      processedNodes.add(node);
      var srRange = match[1].trim();
      if (isDuplicate('sheetread', srRange)) continue;
      pendingToolActions++;
      showNotification('Reading sheet: ' + srRange);
      (function(r) {
        chrome.runtime.sendMessage({ action: 'sheetRead', range: r }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Sheet read: ' + resp.values.length + ' rows');
            queueResult('SHEET_READ ' + r + ': ' + JSON.stringify(resp.values).substring(0, 1000));
          } else {
            queueResult('SHEET_READ ' + r + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(srRange);
    }

    // ===== SHEET_APPEND =====
    var sheetAppendRe = /\[SHEET_APPEND:\s*(.+?)\]/g;
    while ((match = sheetAppendRe.exec(text)) !== null) {
      processedNodes.add(node);
      var saData = match[1].trim();
      if (isDuplicate('sheetappend', saData)) continue;
      var saParts = saData.split('|').map(function(s) { return s.trim(); });
      if (saParts.length < 2) continue;
      var saRange = saParts[0];
      var saValues = [];
      for (var ai = 1; ai < saParts.length; ai++) {
        saValues.push(saParts[ai].split(',').map(function(s) { return s.trim(); }));
      }
      pendingToolActions++;
      showNotification('Appending to sheet: ' + saRange);
      (function(r, v) {
        chrome.runtime.sendMessage({ action: 'sheetAppend', range: r, values: v }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Sheet appended!');
            queueResult('SHEET_APPEND ' + r + ': SUCCESS');
          } else {
            queueResult('SHEET_APPEND ' + r + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(saRange, saValues);
    }

    // ===== SAVE_NOTE =====
    var saveNoteRe = /\[SAVE_NOTE:\s*(.+?)\]/g;
    while ((match = saveNoteRe.exec(text)) !== null) {
      processedNodes.add(node);
      var noteText = match[1].trim();
      if (isDuplicate('note', noteText)) continue;
      showNotification('Saving note...');
      chrome.runtime.sendMessage({ action: 'saveNote', text: noteText }, function(resp) {
        if (resp && resp.success) {
          showNotification('Note saved to doc!');
          queueResult('SAVE_NOTE: SUCCESS');
        }
      });
           }

    // =================================================
    // BROWSER CONTROL TAGS v2.1 (preserved)
    // =================================================

    // ===== TAB_OPEN =====
    var tabOpenRe = /\[TAB_OPEN:\s*(.+?)\]/g;
    while ((match = tabOpenRe.exec(text)) !== null) {
      processedNodes.add(node);
      var openUrl = match[1].trim();
      if (isDuplicate('tabopen', openUrl)) continue;
      pendingToolActions++;
      showNotification('Opening: ' + openUrl.substring(0, 40) + '...');
      (function(u) {
        chrome.runtime.sendMessage({ action: 'tabNavigate', url: u }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Opened tab ' + resp.tabId);
            queueResult('TAB_OPEN ' + u + ': tabId=' + resp.tabId + ' title="' + (resp.title || '') + '"');
          } else {
            queueResult('TAB_OPEN ' + u + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(openUrl);
    }

    // ===== TAB_SCRAPE =====
    var tabScrapeRe = /\[TAB_SCRAPE:\s*(.+?)\]/g;
    while ((match = tabScrapeRe.exec(text)) !== null) {
      processedNodes.add(node);
      var scrapeData = match[1].trim();
      if (isDuplicate('tabscrape', scrapeData)) continue;
      var scrapeParts = scrapeData.split('|').map(function(s) { return s.trim(); });
      var scrapeTabId = parseInt(scrapeParts[0]) || null;
      var scrapeSel = scrapeParts.length > 1 ? scrapeParts[1] : null;
      pendingToolActions++;
      showNotification('Scraping tab ' + (scrapeTabId || 'active') + '...');
      (function(tid, sel) {
        chrome.runtime.sendMessage({ action: 'tabScrape', tabId: tid, selector: sel }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Scraped ' + resp.text.length + ' chars');
            queueResult('TAB_SCRAPE tab:' + resp.tabId + (sel ? ' sel:' + sel : '') + ':\n' + resp.text.substring(0, 2000));
          } else {
            queueResult('TAB_SCRAPE: ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(scrapeTabId, scrapeSel);
    }

    // ===== TAB_CLICK =====
    var tabClickRe = /\[TAB_CLICK:\s*(.+?)\]/g;
    while ((match = tabClickRe.exec(text)) !== null) {
      processedNodes.add(node);
      var clickData = match[1].trim();
      if (isDuplicate('tabclick', clickData)) continue;
      var clickParts = clickData.split('|').map(function(s) { return s.trim(); });
      var clickTabId = parseInt(clickParts[0]) || null;
      var clickSel = clickParts.length > 1 ? clickParts[1] : clickParts[0];
      if (clickParts.length === 1) clickTabId = null;
      pendingToolActions++;
      showNotification('Clicking: ' + clickSel.substring(0, 30));
      (function(tid, sel) {
        chrome.runtime.sendMessage({ action: 'tabClick', tabId: tid, selector: sel }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Clicked: ' + (resp.tagName || sel));
            queueResult('TAB_CLICK ' + sel + ': SUCCESS clicked ' + (resp.tagName || '') + ' "' + (resp.text || '').substring(0, 50) + '"');
          } else {
            queueResult('TAB_CLICK ' + sel + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(clickTabId, clickSel);
    }

    // ===== TAB_TYPE =====
    var tabTypeRe = /\[TAB_TYPE:\s*(.+?)\]/g;
    while ((match = tabTypeRe.exec(text)) !== null) {
      processedNodes.add(node);
      var typeData = match[1].trim();
      if (isDuplicate('tabtype', typeData)) continue;
      var typeParts = typeData.split('|').map(function(s) { return s.trim(); });
      var typeTabId, typeSel, typeText;
      if (typeParts.length >= 3) {
        typeTabId = parseInt(typeParts[0]) || null;
        typeSel = typeParts[1];
        typeText = typeParts.slice(2).join('|');
      } else if (typeParts.length === 2) {
        typeTabId = null;
        typeSel = typeParts[0];
        typeText = typeParts[1];
      } else { continue; }
      pendingToolActions++;
      showNotification('Typing into: ' + typeSel.substring(0, 30));
      (function(tid, sel, txt) {
        chrome.runtime.sendMessage({ action: 'tabType', tabId: tid, selector: sel, text: txt }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            queueResult('TAB_TYPE ' + sel + ': SUCCESS typed "' + txt.substring(0, 50) + '"');
          } else {
            queueResult('TAB_TYPE ' + sel + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(typeTabId, typeSel, typeText);
    }

    // ===== TAB_READ =====
    var tabReadRe = /\[TAB_READ:\s*(.+?)\]/g;
    while ((match = tabReadRe.exec(text)) !== null) {
      processedNodes.add(node);
      var readData = match[1].trim();
      if (isDuplicate('tabread', readData)) continue;
      var readParts = readData.split('|').map(function(s) { return s.trim(); });
      var readTabId = parseInt(readParts[0]) || null;
      var readSel = readParts.length > 1 ? readParts[1] : null;
      pendingToolActions++;
      showNotification('Reading elements on tab ' + (readTabId || 'active') + '...');
      (function(tid, sel) {
        chrome.runtime.sendMessage({ action: 'tabRead', tabId: tid, selector: sel }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            showNotification('Found ' + resp.count + ' elements');
            queueResult('TAB_READ tab:' + (tid || 'active') + ' found ' + resp.count + ' elements:\n' + JSON.stringify(resp.items).substring(0, 2000));
          } else {
            queueResult('TAB_READ: ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(readTabId, readSel);
    }

    // ===== TAB_LIST =====
    var tabListRe = /\[TAB_LIST\]/g;
    while ((match = tabListRe.exec(text)) !== null) {
      processedNodes.add(node);
      if (isDuplicate('tablist', 'list')) continue;
      pendingToolActions++;
      showNotification('Listing tabs...');
      chrome.runtime.sendMessage({ action: 'tabList' }, function(resp) {
        pendingToolActions--;
        if (resp && resp.success) {
          showNotification('Found ' + resp.tabs.length + ' tabs');
          var tabInfo = resp.tabs.map(function(t) {
            return 'id:' + t.id + ' ' + (t.active ? '[ACTIVE] ' : '') + t.title + ' (' + t.url + ')';
          }).join('\n');
          queueResult('TAB_LIST:\n' + tabInfo);
        } else {
          queueResult('TAB_LIST: ERROR ' + (resp ? resp.error : 'unknown'));
        }
        checkAndSchedule();
      });
    }

    // ===== TAB_CLOSE =====
    var tabCloseRe = /\[TAB_CLOSE:\s*(.+?)\]/g;
    while ((match = tabCloseRe.exec(text)) !== null) {
      processedNodes.add(node);
      var closeTabId = parseInt(match[1].trim());
      if (isDuplicate('tabclose', '' + closeTabId)) continue;
      if (!closeTabId) continue;
      pendingToolActions++;
      showNotification('Closing tab ' + closeTabId);
      (function(tid) {
        chrome.runtime.sendMessage({ action: 'tabClose', tabId: tid }, function(resp) {
          pendingToolActions--;
          if (resp && resp.success) {
            queueResult('TAB_CLOSE ' + tid + ': SUCCESS');
          } else {
            queueResult('TAB_CLOSE ' + tid + ': ERROR ' + (resp ? resp.error : 'unknown'));
          }
          checkAndSchedule();
        });
      })(closeTabId);
    }

    // ===== TAB_WAIT =====
    var tabWaitRe = /\[TAB_WAIT:\s*(.+?)\]/g;
    while ((match = tabWaitRe.exec(text)) !== null) {
      processedNodes.add(node);
      var waitMs = parseInt(match[1].trim()) || 2000;
      if (isDuplicate('tabwait', '' + waitMs)) continue;
      pendingToolActions++;
      showNotification('Waiting ' + waitMs + 'ms...');
      (function(ms) {
        chrome.runtime.sendMessage({ action: 'tabWait', ms: ms }, function(resp) {
          pendingToolActions--;
          showNotification('Wait complete');
          queueResult('TAB_WAIT: waited ' + ms + 'ms');
          checkAndSchedule();
        });
      })(waitMs);
    }
  } // end scanNode

  // ========= MUTATION OBSERVER =========
  var observer = new MutationObserver(function(mutations) {
    if (!isConnected) return;
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      for (var j = 0; j < mutation.addedNodes.length; j++) {
        var node = mutation.addedNodes[j];
        if (node.nodeType === 1) {
          scanNode(node);
          var children = node.querySelectorAll('p, span, div, li, code, pre');
          for (var k = 0; k < children.length; k++) scanNode(children[k]);
        }
      }
    }
  });

  // ========= MESSAGE HANDLER v3.0 =========
  chrome.runtime.onMessage.addListener(function(msg) {
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
        showNotification('Doc pasted!');
      }
    } else if (msg.action === 'startSessionFromPopup') {
      // Popup can trigger session start
      startSession();
    } else if (msg.action === 'endSessionFromPopup') {
      // Popup can trigger session end
      endSession();
    } else if (msg.action === 'injectPrompt') {
      // Direct prompt injection from background/popup
      var input = findChatInput();
      if (input) {
        insertTextIntoChat(input, msg.text);
        if (msg.autoSend) {
          setTimeout(function() {
            clickSendButton();
            showNotification('Prompt sent!');
          }, 500);
        }
      }
    }
  });

  // ========= INIT =========
  function init() {
    createBadge();
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(resp) {
      if (resp && resp.loggedIn && resp.docId) updateBadgeStatus(true);
      else updateBadgeStatus(false);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[AgentOS v3.0.0] Content script loaded - Session Loop Engine active');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
