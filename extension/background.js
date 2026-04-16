// AgentOS Bridge - Background Service Worker v4.0.0
// Auto-provisioning + Full message routing to all modules
// Modules: Skills, Scheduler, Multi-Agent, Email Gateway

// Import module scripts
try {
  importScripts('skills.js', 'scheduler.js', 'multiagent.js', 'gateway.js', 'templates.js');
} catch (e) {
  console.warn('[AgentOS] Module import warning:', e.message);
}

// ═══════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════
var state = {
  connected: false,
  token: null,
  docId: null,
  sheetId: null,
  sessionActive: false,
  currentSessionId: null,
  sessionCount: 0
};

// Load saved state
chrome.storage.local.get(['agentosState'], function(result) {
  if (result.agentosState) {
    Object.assign(state, result.agentosState);
    console.log('[AgentOS] State restored:', state.connected ? 'Connected' : 'Disconnected');
  }
});

function saveState() {
  chrome.storage.local.set({ agentosState: state });
}

// ═══════════════════════════════════════════
// AUTH & TOKEN MANAGEMENT
// ═══════════════════════════════════════════
function getToken(interactive) {
  return new Promise(function(resolve, reject) {
    if (state.token) {
      resolve(state.token);
      return;
    }
    chrome.identity.getAuthToken({ interactive: interactive }, function(token) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      state.token = token;
      state.connected = true;
      saveState();
      resolve(token);
    });
  });
}

function apiCall(url, options) {
  return getToken(false).then(function(token) {
    var opts = options || {};
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function(r) {
      if (r.status === 401) {
        // Token expired, refresh
        state.token = null;
        return getToken(false).then(function(newToken) {
          opts.headers['Authorization'] = 'Bearer ' + newToken;
          return fetch(url, opts);
        });
      }
      return r;
    });
  });
}

// ═══════════════════════════════════════════
// AUTO-PROVISIONING ENGINE
// ═══════════════════════════════════════════
function autoProvision() {
  return getToken(true).then(function(token) {
    console.log('[AgentOS] Starting auto-provision...');
    return Promise.all([
      createDoc(token),
      createSheet(token)
    ]);
  }).then(function(results) {
    state.docId = results[0];
    state.sheetId = results[1];
    state.connected = true;
    saveState();
    console.log('[AgentOS] Provisioned - Doc:', state.docId, 'Sheet:', state.sheetId);
    return { success: true, docId: state.docId, sheetId: state.sheetId };
  });
}

function createDoc(token) {
  if (state.docId) return Promise.resolve(state.docId);
  return fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'AgentOS - SOUL Memory' })
  }).then(function(r) { return r.json(); })
  .then(function(doc) {
    var docId = doc.documentId;
    // Write initial SOUL prompt
    var soulContent = '# AgentOS SOUL v4.0\n\n';
    soulContent += '## IDENTITY\nYou are an autonomous AI agent running on AgentOS.\n';
    soulContent += 'You have persistent memory (this doc), a database (Google Sheet),\n';
    soulContent += 'skills (Google Docs), a scheduler (Calendar), email (Gmail),\n';
    soulContent += 'and can spawn sub-agents (Drive).\n\n';
    soulContent += '## COMMAND TAGS\n';
    soulContent += 'Memory: [SAVE_NOTE: text] [SHEET_WRITE: tab|range|data] [SHEET_READ: tab|range]\n';
    soulContent += '[SHEET_APPEND: tab|data] [TASK_DONE: task] [ADD_TASK: task]\n';
    soulContent += 'Browser: [TAB_OPEN: url] [TAB_SCRAPE: url] [BROWSE: query]\n';
    soulContent += 'Skills: [SKILL_CREATE: name|content] [SKILL_SEARCH: query] [SKILL_RECALL: name]\n';
    soulContent += 'Schedule: [SCHEDULE_TASK: name|when|action] [SCHEDULE_LIST] [SCHEDULE_CANCEL: name]\n';
    soulContent += 'Agents: [SPAWN_AGENT: name|role] [AGENT_MSG: name|msg] [AGENT_LIST]\n';
    soulContent += 'Email: [EMAIL_NOTIFY: to|subject|body] [EMAIL_CHECK]\n';
    soulContent += 'Session: [SESSION_COMPLETE: summary]\n\n';
    soulContent += '## TODO\n- Set up initial tasks\n\n';
    soulContent += '## DONE\n\n## NOTES\n\n## SESSION LOG\n';
    return fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: 1 }, text: soulContent } }]
      })
    }).then(function() { return docId; });
  });
}

function createSheet(token) {
  if (state.sheetId) return Promise.resolve(state.sheetId);
  return fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: 'AgentOS - Database' },
      sheets: [
        { properties: { title: 'Sessions' } },
        { properties: { title: 'Skills' } },
        { properties: { title: 'Agents' } },
        { properties: { title: 'Messages' } },
        { properties: { title: 'Tasks' } },
        { properties: { title: 'Data' } }
      ]
    })
  }).then(function(r) { return r.json(); })
  .then(function(sheet) {
    var sheetId = sheet.spreadsheetId;
    // Add headers to Sessions tab
    return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/Sessions!A1:F1?valueInputOption=RAW', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Session ID', 'Start Time', 'End Time', 'Loops', 'Tags Executed', 'Summary']] })
    }).then(function() { return sheetId; });
  });
}

// ═══════════════════════════════════════════
// MESSAGE ROUTER - Routes content.js tags to modules
// ═══════════════════════════════════════════
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  var type = msg.type;
  var data = msg.data || {};

  // ── STATE & CONNECTION ──
  if (type === 'getState') {
    sendResponse({ connected: state.connected, docId: state.docId, sheetId: state.sheetId, sessionActive: state.sessionActive });
    return false;
  }
  if (type === 'connect') {
    autoProvision().then(function(result) {
      sendResponse(result);
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  if (type === 'disconnect') {
    state.connected = false;
    state.token = null;
    saveState();
    sendResponse({ success: true });
    return false;
  }

  // ── SESSION MANAGEMENT ──
  if (type === 'startSession') {
    state.sessionActive = true;
    state.currentSessionId = msg.sessionId || 'S-' + Date.now();
    state.sessionCount++;
    saveState();
    logSession('start');
    sendResponse({ success: true, sessionId: state.currentSessionId });
    return false;
  }
  if (type === 'endSession') {
    logSession('end');
    state.sessionActive = false;
    state.currentSessionId = null;
    saveState();
    sendResponse({ success: true });
    return false;
  }

  // ── MEMORY TAGS ──
  if (type === 'saveNote') {
    appendToDoc(data.note).then(function() {
      sendResponse({ success: true, message: 'Note saved' });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'sheetWrite') {
    writeSheet(data.sheet, data.range, data.data).then(function() {
      sendResponse({ success: true, message: 'Written to ' + data.sheet + '!' + data.range });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'sheetRead') {
    readSheet(data.sheet, data.range).then(function(values) {
      sendResponse({ success: true, data: JSON.stringify(values) });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'sheetAppend') {
    appendSheet(data.sheet, data.data).then(function() {
      sendResponse({ success: true, message: 'Appended to ' + data.sheet });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'taskDone') {
    appendToDoc('\n[DONE] ' + data.task + ' (' + new Date().toISOString() + ')').then(function() {
      sendResponse({ success: true, message: 'Task marked done' });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'addTask') {
    appendToDoc('\n[TODO] ' + data.task).then(function() {
      sendResponse({ success: true, message: 'Task added' });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'skip') {
    appendToDoc('\n[SKIP] ' + data.reason + ' (' + new Date().toISOString() + ')').then(function() {
      sendResponse({ success: true, message: 'Skipped: ' + data.reason });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }

  // ── BROWSER TAGS ──
  if (type === 'tabOpen') {
    chrome.tabs.create({ url: data.url }, function(tab) {
      sendResponse({ success: true, data: 'Opened tab ' + tab.id });
    });
    return true;
  }
  if (type === 'tabScrape') {
    chrome.tabs.create({ url: data.url, active: false }, function(tab) {
      setTimeout(function() {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function() { return document.body.innerText.substring(0, 3000); }
        }, function(results) {
          var text = results && results[0] ? results[0].result : 'Could not scrape';
          sendResponse({ success: true, data: text });
          chrome.tabs.remove(tab.id);
        });
      }, 3000);
    });
    return true;
  }
  if (type === 'tabRead') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() { return document.body.innerText.substring(0, 3000); }
        }, function(results) {
          var text = results && results[0] ? results[0].result : 'Could not read';
          sendResponse({ success: true, data: text });
        });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }
  if (type === 'tabList') {
    chrome.tabs.query({}, function(tabs) {
      var list = tabs.map(function(t) { return t.id + ': ' + t.title.substring(0, 50); }).join('\n');
      sendResponse({ success: true, data: list });
    });
    return true;
  }
  if (type === 'tabClose') {
    chrome.tabs.remove(parseInt(data.tabId), function() {
      sendResponse({ success: true, message: 'Tab closed' });
    });
    return true;
  }
  if (type === 'tabClick') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function(sel) { var el = document.querySelector(sel); if (el) { el.click(); return 'Clicked'; } return 'Not found'; },
          args: [data.selector]
        }, function(results) {
          sendResponse({ success: true, data: results && results[0] ? results[0].result : 'Error' });
        });
      }
    });
    return true;
  }
  if (type === 'tabType') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function(sel, txt) { var el = document.querySelector(sel); if (el) { el.value = txt; el.dispatchEvent(new Event('input', {bubbles:true})); return 'Typed'; } return 'Not found'; },
          args: [data.selector, data.text]
        }, function(results) {
          sendResponse({ success: true, data: results && results[0] ? results[0].result : 'Error' });
        });
      }
    });
    return true;
  }
  if (type === 'tabWait') {
    setTimeout(function() {
      sendResponse({ success: true, message: 'Waited ' + data.ms + 'ms' });
    }, Math.min(data.ms, 30000));
    return true;
  }
  if (type === 'browse') {
    chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(data.query) }, function(tab) {
      sendResponse({ success: true, data: 'Searching: ' + data.query });
    });
    return true;
  }

  // ── SKILL TAGS ──
  if (type === 'skillCreate') {
    createSkillDoc(data.name, data.content).then(function(id) {
      sendResponse({ success: true, data: 'Skill created: ' + data.name + ' (doc: ' + id + ')' });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'skillSearch') {
    searchSkills(data.query).then(function(results) {
      sendResponse({ success: true, data: results });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'skillRecall') {
    recallSkill(data.name).then(function(content) {
      sendResponse({ success: true, data: content });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'skillImprove') {
    improveSkill(data.name, data.improvement).then(function() {
      sendResponse({ success: true, message: 'Skill improved: ' + data.name });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'skillList') {
    listSkills().then(function(list) {
      sendResponse({ success: true, data: list });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }

  // ── SCHEDULER TAGS ──
  if (type === 'scheduleTask') {
    createCalendarEvent(data.name, data.when, data.action).then(function(id) {
      sendResponse({ success: true, data: 'Scheduled: ' + data.name + ' at ' + data.when });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'scheduleList') {
    listScheduledTasks().then(function(tasks) {
      sendResponse({ success: true, data: tasks });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'scheduleCancel') {
    cancelScheduledTask(data.name).then(function() {
      sendResponse({ success: true, message: 'Cancelled: ' + data.name });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }

  // ── MULTI-AGENT TAGS ──
  if (type === 'spawnAgent') {
    spawnSubAgent(data.name, data.role).then(function(info) {
      sendResponse({ success: true, data: 'Agent spawned: ' + data.name + ' (' + data.role + ')' });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'agentMsg') {
    messageAgent(data.agent, data.message).then(function() {
      sendResponse({ success: true, message: 'Message sent to ' + data.agent });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'assignTask') {
    assignTaskToAgent(data.agent, data.task).then(function() {
      sendResponse({ success: true, message: 'Task assigned to ' + data.agent });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'agentList') {
    listAgents().then(function(agents) {
      sendResponse({ success: true, data: agents });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'agentDone') {
    retireAgent(data.agent).then(function() {
      sendResponse({ success: true, message: 'Agent retired: ' + data.agent });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }

  // ── EMAIL GATEWAY TAGS ──
  if (type === 'emailNotify') {
    sendEmail(data.to, data.subject, data.body).then(function() {
      sendResponse({ success: true, message: 'Email sent to ' + data.to });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'emailReport') {
    getToken(false).then(function(token) {
      return fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(r) { return r.json(); });
    }).then(function(user) {
      return sendEmail(user.email, data.subject, data.body);
    }).then(function() {
      sendResponse({ success: true, message: 'Report sent to self' });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'emailCheck') {
    checkInbox().then(function(messages) {
      sendResponse({ success: true, data: messages });
    }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }

  // ── SESSION COMPLETE ──
  if (type === 'sessionComplete') {
    appendToDoc('\n[SESSION COMPLETE] ' + data.summary + ' (' + new Date().toISOString() + ')');
    state.sessionActive = false;
    saveState();
    sendResponse({ success: true, message: 'Session completed' });
    return false;
  }

  // Unknown message type
  console.warn('[AgentOS] Unknown message type:', type);
  sendResponse({ success: false, error: 'Unknown type: ' + type });
  return false;
});

// ═══════════════════════════════════════════
// GOOGLE DOCS OPERATIONS
// ═══════════════════════════════════════════
function appendToDoc(text) {
  return getToken(false).then(function(token) {
    return fetch('https://docs.googleapis.com/v1/documents/' + state.docId, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(doc) {
      var endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
      return fetch('https://docs.googleapis.com/v1/documents/' + state.docId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: endIndex }, text: '\n' + text } }]
        })
      });
    });
  });
}

// ═══════════════════════════════════════════
// GOOGLE SHEETS OPERATIONS
// ═══════════════════════════════════════════
function writeSheet(sheet, range, data) {
  return getToken(false).then(function(token) {
    var values = data.split(',').map(function(v) { return v.trim(); });
    return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values/' + sheet + '!' + range + '?valueInputOption=RAW', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] })
    });
  });
}

function readSheet(sheet, range) {
  return getToken(false).then(function(token) {
    return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values/' + sheet + '!' + range, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) { return data.values || []; });
  });
}

function appendSheet(sheet, data) {
  return getToken(false).then(function(token) {
    var values = data.split(',').map(function(v) { return v.trim(); });
    return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + state.sheetId + '/values/' + sheet + '!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] })
    });
  });
}

function logSession(action) {
  if (action === 'start') {
    appendSheet('Sessions', state.currentSessionId + ',' + new Date().toISOString() + ',,,,' );
  }
}

// ═══════════════════════════════════════════
// SKILLS OPERATIONS (Google Docs as skills)
// ═══════════════════════════════════════════
function createSkillDoc(name, content) {
  return getToken(false).then(function(token) {
    return fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'AgentOS-Skill: ' + name })
    }).then(function(r) { return r.json(); })
    .then(function(doc) {
      var docId = doc.documentId;
      // Write skill content
      return fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: 1 }, text: '# Skill: ' + name + '\n\n' + content } }]
        })
      }).then(function() {
        // Log to Skills sheet
        appendSheet('Skills', name + ',' + docId + ',' + new Date().toISOString() + ',active');
        return docId;
      });
    });
  });
}

function searchSkills(query) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill'&fields=files(id,name)", {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      var files = data.files || [];
      var matching = files.filter(function(f) {
        return f.name.toLowerCase().includes(query.toLowerCase());
      });
      return matching.map(function(f) { return f.name.replace('AgentOS-Skill: ', '') + ' (id:' + f.id + ')'; }).join('\n') || 'No skills found';
    });
  });
}

function recallSkill(name) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill:+" + encodeURIComponent(name) + "'&fields=files(id,name)", {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.files || data.files.length === 0) return 'Skill not found: ' + name;
      var fileId = data.files[0].id;
      return fetch('https://docs.googleapis.com/v1/documents/' + fileId, {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(r) { return r.json(); })
      .then(function(doc) {
        var text = '';
        doc.body.content.forEach(function(el) {
          if (el.paragraph) {
            el.paragraph.elements.forEach(function(e) {
              if (e.textRun) text += e.textRun.content;
            });
          }
        });
        return text.substring(0, 2000);
      });
    });
  });
}

function improveSkill(name, improvement) {
  return recallSkill(name).then(function(content) {
    return getToken(false).then(function(token) {
      return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill:+" + encodeURIComponent(name) + "'&fields=files(id)", {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.files || data.files.length === 0) throw new Error('Skill not found');
        var docId = data.files[0].id;
        return fetch('https://docs.googleapis.com/v1/documents/' + docId, {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(function(r) { return r.json(); })
        .then(function(doc) {
          var endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
          return fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{ insertText: { location: { index: endIndex }, text: '\n\n## Improvement (' + new Date().toISOString() + ')\n' + improvement } }]
            })
          });
        });
      });
    });
  });
}

function listSkills() {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill'&fields=files(id,name,modifiedTime)", {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      var files = data.files || [];
      if (files.length === 0) return 'No skills yet. Create one with [SKILL_CREATE: name|content]';
      return files.map(function(f) { return '- ' + f.name.replace('AgentOS-Skill: ', '') + ' (modified: ' + f.modifiedTime + ')'; }).join('\n');
    });
  });
}

// ═══════════════════════════════════════════
// CALENDAR OPERATIONS (Scheduler)
// ═══════════════════════════════════════════
function createCalendarEvent(name, when, action) {
  return getToken(false).then(function(token) {
    var startTime = parseScheduleTime(when);
    var endTime = new Date(startTime.getTime() + 30 * 60000);
    return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: 'AgentOS: ' + name,
        description: 'AgentOS scheduled task\nAction: ' + action,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }
      })
    }).then(function(r) { return r.json(); })
    .then(function(event) {
      appendSheet('Tasks', name + ',' + when + ',' + action + ',' + event.id + ',scheduled');
      return event.id;
    });
  });
}

function parseScheduleTime(when) {
  var now = new Date();
  var lower = when.toLowerCase().trim();
  if (lower.includes('minute')) {
    var mins = parseInt(lower) || 30;
    return new Date(now.getTime() + mins * 60000);
  }
  if (lower.includes('hour')) {
    var hrs = parseInt(lower) || 1;
    return new Date(now.getTime() + hrs * 3600000);
  }
  if (lower === 'tomorrow') {
    var tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  if (lower === 'next week') {
    var nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }
  // Try direct date parse
  var parsed = new Date(when);
  if (!isNaN(parsed.getTime())) return parsed;
  // Default: 1 hour from now
  return new Date(now.getTime() + 3600000);
}

function listScheduledTasks() {
  return getToken(false).then(function(token) {
    var now = new Date().toISOString();
    return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + now + "&q=AgentOS&maxResults=20&orderBy=startTime&singleEvents=true", {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      var events = data.items || [];
      if (events.length === 0) return 'No scheduled tasks';
      return events.map(function(e) {
        var start = e.start.dateTime || e.start.date;
        return '- ' + e.summary.replace('AgentOS: ', '') + ' at ' + start + (e.description ? ' | ' + e.description.substring(0, 100) : '');
      }).join('\n');
    });
  });
}

function cancelScheduledTask(name) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?q=AgentOS:+" + encodeURIComponent(name) + "&maxResults=5&singleEvents=true&orderBy=startTime&timeMin=" + new Date().toISOString(), {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      var events = data.items || [];
      if (events.length === 0) throw new Error('No scheduled task found: ' + name);
      return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + events[0].id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    });
  });
}

// ═══════════════════════════════════════════
// EMAIL OPERATIONS (Gmail Gateway)
// ═══════════════════════════════════════════
function sendEmail(to, subject, body) {
  return getToken(false).then(function(token) {
    var email = 'To: ' + to + '\r\n' +
                'Subject: ' + subject + '\r\n' +
                'Content-Type: text/plain; charset=utf-8\r\n\r\n' +
                body;
    var encoded = btoa(unescape(encodeURIComponent(email))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded })
    });
  });
}

function checkInbox() {
  return getToken(false).then(function(token) {
    return fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread+label:AgentOS', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.messages || data.messages.length === 0) return 'No unread AgentOS emails';
      var promises = data.messages.slice(0, 3).map(function(m) {
        return fetch('https://www.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).then(function(r) { return r.json(); });
      });
      return Promise.all(promises).then(function(msgs) {
        return msgs.map(function(m) {
          var subject = '', from = '';
          (m.payload.headers || []).forEach(function(h) {
            if (h.name === 'Subject') subject = h.value;
            if (h.name === 'From') from = h.value;
          });
          return '- From: ' + from + ' | Subject: ' + subject;
        }).join('\n');
      });
    });
  });
}

// ═══════════════════════════════════════════
// MULTI-AGENT OPERATIONS (Google Drive)
// ═══════════════════════════════════════════
function spawnSubAgent(name, role) {
  return getToken(false).then(function(token) {
    // Create a Doc for the sub-agent
    return fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'AgentOS-Agent: ' + name })
    }).then(function(r) { return r.json(); })
    .then(function(doc) {
      var docId = doc.documentId;
      var agentSoul = '# Agent: ' + name + '\nRole: ' + role + '\nStatus: active\nCreated: ' + new Date().toISOString() + '\n\n## Inbox\n\n## Tasks\n\n## Output\n';
      return fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: 1 }, text: agentSoul } }]
        })
      }).then(function() {
        appendSheet('Agents', name + ',' + role + ',' + docId + ',' + new Date().toISOString() + ',active');
        return { name: name, docId: docId };
      });
    });
  });
}

function messageAgent(agentName, message) {
  return findAgentDoc(agentName).then(function(docId) {
    return getToken(false).then(function(token) {
      return fetch('https://docs.googleapis.com/v1/documents/' + docId, {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(r) { return r.json(); })
      .then(function(doc) {
        var endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
        return fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: endIndex }, text: '\n[MSG ' + new Date().toISOString() + '] ' + message } }]
          })
        });
      });
    });
  });
}

function assignTaskToAgent(agentName, task) {
  return messageAgent(agentName, '[TASK] ' + task);
}

function findAgentDoc(name) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Agent:+" + encodeURIComponent(name) + "'&fields=files(id)", {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.files || data.files.length === 0) throw new Error('Agent not found: ' + name);
      return data.files[0].id;
    });
  });
}

function listAgents() {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Agent'&fields=files(id,name,modifiedTime)", {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
    .then(function(data) {
      var files = data.files || [];
      if (files.length === 0) return 'No sub-agents. Spawn one with [SPAWN_AGENT: name|role]';
      return files.map(function(f) { return '- ' + f.name.replace('AgentOS-Agent: ', '') + ' (last active: ' + f.modifiedTime + ')'; }).join('\n');
    });
  });
}

function retireAgent(name) {
  return findAgentDoc(name).then(function(docId) {
    return messageAgent(name, '[RETIRED] Agent deactivated at ' + new Date().toISOString());
  });
}

// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════
console.log('[AgentOS] Background service worker v4.0 loaded');
console.log('[AgentOS] Modules: Skills + Scheduler + Multi-Agent + Email Gateway');
console.log('[AgentOS] 34 command tags ready for routing');

