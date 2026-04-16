// AgentOS Bridge - Background Service Worker v4.1.0
// KEY CHANGE: Added buildContext handler that reads SOUL Doc + Sheet
// and returns full context for session start prompt

try {
  importScripts('skills.js', 'scheduler.js', 'multiagent.js', 'gateway.js', 'templates.js');
} catch (e) {
  console.warn('[AgentOS] Module import warning:', e.message);
}

// ═══════════════════════════════════════════
// STATE
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
// AUTH
// ═══════════════════════════════════════════
function getToken(interactive) {
  return new Promise(function(resolve, reject) {
    if (state.token) { resolve(state.token); return; }
    chrome.identity.getAuthToken({ interactive: interactive }, function(token) {
      if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
      state.token = token;
      state.connected = true;
      saveState();
      resolve(token);
    });
  });
}

// ═══════════════════════════════════════════
// AUTO-PROVISIONING
// ═══════════════════════════════════════════
function autoProvision() {
  return getToken(true).then(function(token) {
    return Promise.all([createDoc(token), createSheet(token)]);
  }).then(function(results) {
    state.docId = results[0];
    state.sheetId = results[1];
    state.connected = true;
    saveState();
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
    var soul = '# AgentOS SOUL v4.1\n\n';
    soul += '## IDENTITY\nYou are an autonomous AI agent running on AgentOS.\n';
    soul += 'You have persistent memory, skills, scheduling, email, and multi-agent abilities.\n\n';
    soul += '## TODO\n- Introduce yourself and explore your capabilities\n- Create your first skill\n\n';
    soul += '## DONE\n\n## NOTES\n\n## SESSION LOG\n';
    return fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: soul } }] })
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
    var sid = sheet.spreadsheetId;
    // Add headers
    var headerPromises = [
      putSheet(token, sid, 'Sessions!A1:F1', [['Session ID','Start','End','Loops','Tags','Summary']]),
      putSheet(token, sid, 'Skills!A1:D1', [['Name','Doc ID','Created','Status']]),
      putSheet(token, sid, 'Agents!A1:E1', [['Name','Role','Doc ID','Created','Status']]),
      putSheet(token, sid, 'Tasks!A1:E1', [['Task','When','Action','Event ID','Status']]),
      putSheet(token, sid, 'Data!A1:E1', [['Key','Value','Type','Updated','Notes']])
    ];
    return Promise.all(headerPromises).then(function() { return sid; });
  });
}

function putSheet(token, sheetId, range, values) {
  return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range + '?valueInputOption=RAW', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: values })
  });
}

// ═══════════════════════════════════════════
// BUILD CONTEXT — THE KEY NEW FEATURE
// Reads SOUL Doc + all Sheet tabs, returns full context
// ═══════════════════════════════════════════
function buildContext() {
  return getToken(false).then(function(token) {
    // Read everything in parallel
    return Promise.all([
      readDocText(token, state.docId),
      readSheetSafe(token, state.sheetId, 'Sessions!A2:F20'),
      readSheetSafe(token, state.sheetId, 'Tasks!A2:E20'),
      readSheetSafe(token, state.sheetId, 'Skills!A2:D20'),
      readSheetSafe(token, state.sheetId, 'Agents!A2:E20')
    ]);
  }).then(function(results) {
    return {
      soul: results[0],
      sessions: results[1],
      tasks: results[2],
      skills: results[3],
      agents: results[4]
    };
  });
}

function readDocText(token, docId) {
  if (!docId) return Promise.resolve('No SOUL doc found. Connect your Google account first.');
  return fetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(r) { return r.json(); })
  .then(function(doc) {
    var text = '';
    if (doc.body && doc.body.content) {
      doc.body.content.forEach(function(el) {
        if (el.paragraph) {
          el.paragraph.elements.forEach(function(e) {
            if (e.textRun) text += e.textRun.content;
          });
        }
      });
    }
    return text;
  }).catch(function(e) {
    return 'Error reading SOUL doc: ' + e.message;
  });
}

function readSheetSafe(token, sheetId, range) {
  if (!sheetId) return Promise.resolve([]);
  return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range, {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(r) { return r.json(); })
  .then(function(data) { return data.values || []; })
  .catch(function() { return []; });
}

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
        body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: '\n' + text } }] })
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
    return putSheet(token, state.sheetId, sheet + '!' + range, [values]);
  });
}

function readSheet(sheet, range) {
  return getToken(false).then(function(token) {
    return readSheetSafe(token, state.sheetId, sheet + '!' + range);
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
    appendSheet('Sessions', state.currentSessionId + ',' + new Date().toISOString() + ',,,,');
  }
}

// ═══════════════════════════════════════════
// MESSAGE ROUTER
// ═══════════════════════════════════════════
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  var type = msg.type;
  var data = msg.data || {};

  // ── CONNECTION & STATE ──
  if (type === 'getState') {
    sendResponse({ connected: state.connected, docId: state.docId, sheetId: state.sheetId, sessionActive: state.sessionActive });
    return false;
  }
  if (type === 'connect') {
    autoProvision().then(function(r) { sendResponse(r); }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'disconnect') {
    state.connected = false; state.token = null; saveState();
    sendResponse({ success: true });
    return false;
  }

  // ── BUILD CONTEXT (THE KEY NEW HANDLER) ──
  if (type === 'buildContext') {
    buildContext().then(function(ctx) {
      sendResponse({ success: true, data: ctx });
    }).catch(function(e) {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  // ── SESSION ──
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
    state.sessionActive = false; state.currentSessionId = null; saveState();
    sendResponse({ success: true });
    return false;
  }

  // ── MEMORY TAGS ──
  if (type === 'saveNote') {
    appendToDoc(data.note).then(function() { sendResponse({ success: true, message: 'Note saved' }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'sheetWrite') {
    writeSheet(data.sheet, data.range, data.data).then(function() { sendResponse({ success: true, message: 'Written to ' + data.sheet }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'sheetRead') {
    readSheet(data.sheet, data.range).then(function(v) { sendResponse({ success: true, data: JSON.stringify(v) }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'sheetAppend') {
    appendSheet(data.sheet, data.data).then(function() { sendResponse({ success: true, message: 'Appended to ' + data.sheet }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'taskDone') {
    appendToDoc('[DONE] ' + data.task + ' (' + new Date().toISOString() + ')').then(function() { sendResponse({ success: true, message: 'Task done' }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'addTask') {
    appendToDoc('[TODO] ' + data.task).then(function() { sendResponse({ success: true, message: 'Task added' }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'skip') {
    appendToDoc('[SKIP] ' + data.reason).then(function() { sendResponse({ success: true }); })
    .catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }

  // ── BROWSER TAGS ──
  if (type === 'tabOpen') {
    chrome.tabs.create({ url: data.url }, function(tab) { sendResponse({ success: true, data: 'Opened tab ' + tab.id }); });
    return true;
  }
  if (type === 'tabScrape') {
    chrome.tabs.create({ url: data.url, active: false }, function(tab) {
      setTimeout(function() {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: function() { return document.body.innerText.substring(0, 3000); } },
        function(results) {
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
      if (!tabs[0]) { sendResponse({ success: false, error: 'No active tab' }); return; }
      chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: function() { return document.body.innerText.substring(0, 3000); } },
      function(results) { sendResponse({ success: true, data: results && results[0] ? results[0].result : 'Error' }); });
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
  if (type === 'tabClose') { chrome.tabs.remove(parseInt(data.tabId), function() { sendResponse({ success: true }); }); return true; }
  if (type === 'tabClick') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) return;
      chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: function(sel) { var el = document.querySelector(sel); if(el){el.click();return 'Clicked';}return 'Not found'; }, args: [data.selector] },
      function(r) { sendResponse({ success: true, data: r&&r[0]?r[0].result:'Error' }); });
    });
    return true;
  }
  if (type === 'tabType') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) return;
      chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: function(sel,txt) { var el = document.querySelector(sel); if(el){el.value=txt;el.dispatchEvent(new Event('input',{bubbles:true}));return 'Typed';}return 'Not found'; }, args: [data.selector,data.text] },
      function(r) { sendResponse({ success: true, data: r&&r[0]?r[0].result:'Error' }); });
    });
    return true;
  }
  if (type === 'tabWait') { setTimeout(function() { sendResponse({ success: true }); }, Math.min(data.ms,30000)); return true; }
  if (type === 'browse') {
    chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(data.query) }, function() { sendResponse({ success: true, data: 'Searching: ' + data.query }); });
    return true;
  }

  // ── SKILL TAGS ──
  if (type === 'skillCreate') { createSkillDoc(data.name, data.content).then(function(id) { sendResponse({ success: true, data: 'Skill created: ' + data.name }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'skillSearch') { searchSkills(data.query).then(function(r) { sendResponse({ success: true, data: r }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'skillRecall') { recallSkill(data.name).then(function(c) { sendResponse({ success: true, data: c }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'skillImprove') { improveSkill(data.name, data.improvement).then(function() { sendResponse({ success: true, message: 'Skill improved' }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'skillList') { listSkills().then(function(l) { sendResponse({ success: true, data: l }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }

  // ── SCHEDULER TAGS ──
  if (type === 'scheduleTask') { createCalendarEvent(data.name, data.when, data.action).then(function(id) { sendResponse({ success: true, data: 'Scheduled: ' + data.name }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'scheduleList') { listScheduledTasks().then(function(t) { sendResponse({ success: true, data: t }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'scheduleCancel') { cancelScheduledTask(data.name).then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }

  // ── MULTI-AGENT TAGS ──
  if (type === 'spawnAgent') { spawnSubAgent(data.name, data.role).then(function() { sendResponse({ success: true, data: 'Agent spawned: ' + data.name }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'agentMsg') { messageAgent(data.agent, data.message).then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'assignTask') { assignTaskToAgent(data.agent, data.task).then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'agentList') { listAgents().then(function(a) { sendResponse({ success: true, data: a }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'agentDone') { retireAgent(data.agent).then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }

  // ── EMAIL TAGS ──
  if (type === 'emailNotify') { sendEmail(data.to, data.subject, data.body).then(function() { sendResponse({ success: true, message: 'Email sent' }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }
  if (type === 'emailReport') {
    getToken(false).then(function(t) { return fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', { headers: { 'Authorization': 'Bearer ' + t } }).then(function(r){return r.json();}); })
    .then(function(u) { return sendEmail(u.email, data.subject, data.body); })
    .then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); });
    return true;
  }
  if (type === 'emailCheck') { checkInbox().then(function(m) { sendResponse({ success: true, data: m }); }).catch(function(e) { sendResponse({ success: false, error: e.message }); }); return true; }

  // ── SESSION COMPLETE ──
  if (type === 'sessionComplete') {
    appendToDoc('[SESSION COMPLETE] ' + data.summary + ' (' + new Date().toISOString() + ')');
    state.sessionActive = false; saveState();
    sendResponse({ success: true });
    return false;
  }

  sendResponse({ success: false, error: 'Unknown: ' + type });
  return false;
});

// ═══════════════════════════════════════════
// SKILLS (Google Docs)
// ═══════════════════════════════════════════
function createSkillDoc(name, content) {
  return getToken(false).then(function(token) {
    return fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'AgentOS-Skill: ' + name })
    }).then(function(r) { return r.json(); }).then(function(doc) {
      var id = doc.documentId;
      return fetch('https://docs.googleapis.com/v1/documents/' + id + ':batchUpdate', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: '# Skill: ' + name + '\n\n' + content } }] })
      }).then(function() { appendSheet('Skills', name + ',' + id + ',' + new Date().toISOString() + ',active'); return id; });
    });
  });
}

function searchSkills(query) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill'&fields=files(id,name)", { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      var files = (d.files||[]).filter(function(f) { return f.name.toLowerCase().includes(query.toLowerCase()); });
      return files.map(function(f) { return f.name.replace('AgentOS-Skill: ',''); }).join(', ') || 'No skills found';
    });
  });
}

function recallSkill(name) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill:+" + encodeURIComponent(name) + "'&fields=files(id)", { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.files||!d.files.length) return 'Skill not found: ' + name;
      return readDocText(token, d.files[0].id);
    });
  });
}

function improveSkill(name, improvement) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill:+" + encodeURIComponent(name) + "'&fields=files(id)", { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.files||!d.files.length) throw new Error('Skill not found');
      var id = d.files[0].id;
      return fetch('https://docs.googleapis.com/v1/documents/' + id, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function(r) { return r.json(); }).then(function(doc) {
        var end = doc.body.content[doc.body.content.length-1].endIndex - 1;
        return fetch('https://docs.googleapis.com/v1/documents/' + id + ':batchUpdate', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ insertText: { location: { index: end }, text: '\n\n## Update ' + new Date().toISOString() + '\n' + improvement } }] })
        });
      });
    });
  });
}

function listSkills() {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Skill'&fields=files(name,modifiedTime)", { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      var f = d.files||[];
      return f.length ? f.map(function(x) { return x.name.replace('AgentOS-Skill: ',''); }).join(', ') : 'No skills yet';
    });
  });
}

// ═══════════════════════════════════════════
// CALENDAR (Scheduler)
// ═══════════════════════════════════════════
function createCalendarEvent(name, when, action) {
  return getToken(false).then(function(token) {
    var start = parseTime(when);
    var end = new Date(start.getTime() + 1800000);
    return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'AgentOS: ' + name, description: 'Action: ' + action, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } })
    }).then(function(r) { return r.json(); }).then(function(e) {
      appendSheet('Tasks', name + ',' + when + ',' + action + ',' + e.id + ',scheduled');
      return e.id;
    });
  });
}

function parseTime(when) {
  var now = new Date();
  var w = when.toLowerCase();
  if (w.includes('minute')) return new Date(now.getTime() + (parseInt(w)||30)*60000);
  if (w.includes('hour')) return new Date(now.getTime() + (parseInt(w)||1)*3600000);
  if (w === 'tomorrow') { var t = new Date(now); t.setDate(t.getDate()+1); t.setHours(9,0,0,0); return t; }
  var p = new Date(when);
  return isNaN(p.getTime()) ? new Date(now.getTime()+3600000) : p;
}

function listScheduledTasks() {
  return getToken(false).then(function(token) {
    return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + new Date().toISOString() + '&q=AgentOS&maxResults=10&orderBy=startTime&singleEvents=true', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      var e = d.items||[];
      return e.length ? e.map(function(x) { return x.summary.replace('AgentOS: ','') + ' at ' + (x.start.dateTime||x.start.date); }).join(', ') : 'No scheduled tasks';
    });
  });
}

function cancelScheduledTask(name) {
  return getToken(false).then(function(token) {
    return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?q=AgentOS:+' + encodeURIComponent(name) + '&maxResults=1&singleEvents=true&timeMin=' + new Date().toISOString(), { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.items||!d.items.length) throw new Error('Not found');
      return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + d.items[0].id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    });
  });
}

// ═══════════════════════════════════════════
// EMAIL (Gmail)
// ═══════════════════════════════════════════
function sendEmail(to, subject, body) {
  return getToken(false).then(function(token) {
    var raw = 'To: ' + to + '\r\nSubject: ' + subject + '\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + body;
    var encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded })
    });
  });
}

function checkInbox() {
  return getToken(false).then(function(token) {
    return fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.messages||!d.messages.length) return 'No unread emails';
      return d.messages.length + ' unread emails';
    });
  });
}

// ═══════════════════════════════════════════
// MULTI-AGENT (Google Drive)
// ═══════════════════════════════════════════
function spawnSubAgent(name, role) {
  return getToken(false).then(function(token) {
    return fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'AgentOS-Agent: ' + name })
    }).then(function(r) { return r.json(); }).then(function(doc) {
      var id = doc.documentId;
      var soul = '# Agent: ' + name + '\nRole: ' + role + '\nStatus: active\n\n## Inbox\n\n## Tasks\n\n## Output\n';
      return fetch('https://docs.googleapis.com/v1/documents/' + id + ':batchUpdate', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: soul } }] })
      }).then(function() { appendSheet('Agents', name + ',' + role + ',' + id + ',' + new Date().toISOString() + ',active'); });
    });
  });
}

function messageAgent(name, msg) {
  return findAgentDoc(name).then(function(id) {
    return getToken(false).then(function(token) {
      return fetch('https://docs.googleapis.com/v1/documents/' + id, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function(r) { return r.json(); }).then(function(doc) {
        var end = doc.body.content[doc.body.content.length-1].endIndex - 1;
        return fetch('https://docs.googleapis.com/v1/documents/' + id + ':batchUpdate', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ insertText: { location: { index: end }, text: '\n[MSG] ' + msg } }] })
        });
      });
    });
  });
}

function assignTaskToAgent(name, task) { return messageAgent(name, '[TASK] ' + task); }

function findAgentDoc(name) {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Agent:+" + encodeURIComponent(name) + "'&fields=files(id)", { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      if (!d.files||!d.files.length) throw new Error('Agent not found: ' + name);
      return d.files[0].id;
    });
  });
}

function listAgents() {
  return getToken(false).then(function(token) {
    return fetch("https://www.googleapis.com/drive/v3/files?q=name+contains+'AgentOS-Agent'&fields=files(name)", { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function(r) { return r.json(); }).then(function(d) {
      var f = d.files||[];
      return f.length ? f.map(function(x) { return x.name.replace('AgentOS-Agent: ',''); }).join(', ') : 'No agents';
    });
  });
}

function retireAgent(name) { return messageAgent(name, '[RETIRED] ' + new Date().toISOString()); }

// ═══════════════════════════════════════════
console.log('[AgentOS] Background v4.1 loaded - buildContext ready');

