// AgentOS Bridge - Background Service Worker v4.3.0
// FIX: Uses launchWebAuthFlow instead of getAuthToken for reliable OAuth
// Uses Web Application client (not Chrome Extension client)
// This avoids extension ID mismatch issues entirely

try {
  importScripts('skills.js', 'scheduler.js', 'multiagent.js', 'gateway.js', 'templates.js');
} catch (e) {
  console.warn('[AgentOS] Module import warning:', e.message);
}

// ====================================
// CONFIG
// ====================================
var WEB_CLIENT_ID = '930312309217-9tgvu1i7o3hrogrmnooplbpgminq54m9.apps.googleusercontent.com';
var SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify'
].join(' ');

// ====================================
// STATE
// ====================================
var state = {
  connected: false,
  token: null,
  tokenExpiry: 0,
  docId: null,
  sheetId: null,
  sessionActive: false,
  currentSessionId: null,
  sessionCount: 0
};

chrome.storage.local.get(['agentosState'], function(result) {
  if (result.agentosState) {
    Object.assign(state, result.agentosState);
    state.token = null; state.tokenExpiry = 0; clearPersistedToken();
    console.log('[AgentOS] State restored:', state.connected ? 'Connected (token will refresh on first API call)' : 'Disconnected');
  }
  // Rehydrate access token from session storage (in-memory, survives SW sleep, never touches disk)
  if (chrome.storage.session && chrome.storage.session.get) {
    chrome.storage.session.get(['agentosToken'], function(r) {
      if (r && r.agentosToken && r.agentosToken.expiry > Date.now()) {
        state.token = r.agentosToken.token;
        state.tokenExpiry = r.agentosToken.expiry;
        console.log('[AgentOS] Token rehydrated from session storage');
      }
    });
  }
});

// ====================================
// GOOGLE API FETCH WRAPPER
// Checks r.ok, parses {error}, retries 429/5xx with exponential backoff.
// On 401, clears in-memory token so next call re-auths. Returns parsed JSON.
// ====================================
function gfetch(url, options, attempt) {
  options = options || {};
  attempt = attempt || 0;
  return fetch(url, options).then(function(r) {
    if (r.ok) {
      return r.text().then(function(t) { return t ? JSON.parse(t) : {}; });
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      var delay = Math.pow(2, attempt) * 500 + Math.random() * 250;
      console.warn('[AgentOS] gfetch retry ' + (attempt+1) + '/3 for ' + r.status + ' after ' + Math.round(delay) + 'ms');
      return new Promise(function(resolve) { setTimeout(resolve, delay); })
        .then(function() { return gfetch(url, options, attempt + 1); });
    }
    if (r.status === 401) {
      state.token = null; state.tokenExpiry = 0; clearPersistedToken();
    }
    return r.text().then(function(t) {
      var body; try { body = JSON.parse(t); } catch(e) { body = { error: { message: t || r.statusText } }; }
      var msg = (body.error && body.error.message) ? body.error.message : (body.error || r.statusText || ('HTTP ' + r.status));
      var err = new Error('[' + r.status + '] ' + msg);
      err.status = r.status;
      err.body = body;
      throw err;
    });
  });
}

function saveState() {
  // Persist only durable metadata. Token is ephemeral and stays in memory.
  var persisted = {
    connected: state.connected,
    docId: state.docId,
    sheetId: state.sheetId,
    sessionActive: state.sessionActive,
    currentSessionId: state.currentSessionId,
    sessionCount: state.sessionCount
  };
  chrome.storage.local.set({ agentosState: persisted });
}

// ====================================
// --- Session-storage token persistence (in-memory only, never disk) ---
function persistToken(token, expiry) {
  if (chrome.storage.session && chrome.storage.session.set) {
    chrome.storage.session.set({ agentosToken: { token: token, expiry: expiry } });
  }
}
function clearPersistedToken() {
  if (chrome.storage.session && chrome.storage.session.remove) {
    chrome.storage.session.remove('agentosToken');
  }
}

// AUTH via launchWebAuthFlow
// ====================================
function getToken(interactive) {
  return new Promise(function(resolve, reject) {
    // If we have a valid cached token, use it
    if (state.token && Date.now() < state.tokenExpiry) {
      resolve(state.token);
      return;
    }
    // Clear expired token
    state.token = null; state.tokenExpiry = 0; clearPersistedToken();

    if (!interactive) {
      reject(new Error('No valid token and interactive=false'));
      return;
    }

    // Use launchWebAuthFlow with implicit grant
    var redirectUrl = chrome.identity.getRedirectURL();
    console.log('[AgentOS] Redirect URL:', redirectUrl);

    var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=' + encodeURIComponent(WEB_CLIENT_ID)
      + '&redirect_uri=' + encodeURIComponent(redirectUrl)
      + '&response_type=token'
      + '&scope=' + encodeURIComponent(SCOPES)
      + '&prompt=consent';

    console.log('[AgentOS] Starting launchWebAuthFlow...');

    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, function(responseUrl) {
      if (chrome.runtime.lastError) {
        console.error('[AgentOS] Auth error:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!responseUrl) {
        reject(new Error('No response URL from auth flow'));
        return;
      }

      console.log('[AgentOS] Auth response received');

      // Parse access token from URL fragment
      var hashParams = new URLSearchParams(responseUrl.split('#')[1]);
      var accessToken = hashParams.get('access_token');
      var expiresIn = parseInt(hashParams.get('expires_in') || '3600');

      if (!accessToken) {
        reject(new Error('No access token in response'));
        return;
      }

      state.token = accessToken;
      state.tokenExpiry = Date.now() + (expiresIn * 1000) - 60000; // 1 min buffer
      state.connected = true;
      saveState();
      persistToken(accessToken, state.tokenExpiry);
      console.log('[AgentOS] Token obtained, expires in', expiresIn, 'seconds');
      resolve(accessToken);
    });
  });
}

// ====================================
// AUTO-PROVISIONING
// ====================================
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
  return gfetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'AgentOS - SOUL Memory' })
  }).then(function(doc) {
    state.docId = doc.documentId;
    saveState();
    var soulContent = '# AgentOS SOUL\n\n## Identity\nI am an AI agent powered by AgentOS.\n\n## Goals\n- Help the user with tasks\n- Learn and improve over time\n- Use tools efficiently\n\n## Notes\n(none yet)\n\n## TODO\n- Introduce myself to the user\n\n## DONE\n(none yet)\n';
    return gfetch('https://docs.googleapis.com/v1/documents/' + doc.documentId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: soulContent } }] })
    }).then(function() { return doc.documentId; });
  });
}

function createSheet(token) {
  if (state.sheetId) return Promise.resolve(state.sheetId);
  return gfetch('https://sheets.googleapis.com/v4/spreadsheets', {
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
  }).then(function(sheet) {
    state.sheetId = sheet.spreadsheetId;
    saveState();
    var headerRequests = [
      putSheet(token, sheet.spreadsheetId, 'Sessions!A1:F1', [['SessionID', 'Start', 'End', 'Status', 'Tags', 'Summary']]),
      putSheet(token, sheet.spreadsheetId, 'Skills!A1:D1', [['Name', 'DocID', 'Created', 'Uses']]),
      putSheet(token, sheet.spreadsheetId, 'Agents!A1:E1', [['Name', 'DocID', 'SheetID', 'Status', 'Created']]),
      putSheet(token, sheet.spreadsheetId, 'Messages!A1:E1', [['From', 'To', 'Message', 'Time', 'Read']]),
      putSheet(token, sheet.spreadsheetId, 'Tasks!A1:E1', [['Task', 'Status', 'Priority', 'Created', 'Done']]),
      putSheet(token, sheet.spreadsheetId, 'Data!A1:C1', [['Key', 'Value', 'Updated']])
    ];
    return Promise.all(headerRequests).then(function() { return sheet.spreadsheetId; });
  });
}

function putSheet(token, sheetId, range, values) {
  return gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range + '?valueInputOption=USER_ENTERED', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: values })
  });
}

// ====================================
// BUILD CONTEXT (v4.3 - launchWebAuthFlow + auto-provision)
// ====================================
function buildContext() {
  return getToken(false).then(function(token) {
    var provisionPromise = Promise.resolve();
    if (!state.docId || !state.sheetId) {
      provisionPromise = autoProvision();
    }
    return provisionPromise.then(function() {
      return Promise.all([
        readDocText(token, state.docId),
        readSheetSafe(token, state.sheetId, 'Sessions!A2:F20'),
        readSheetSafe(token, state.sheetId, 'Tasks!A2:E20'),
        readSheetSafe(token, state.sheetId, 'Skills!A2:D20'),
        readSheetSafe(token, state.sheetId, 'Agents!A2:E20')
      ]);
    });
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
  if (!docId) return Promise.resolve('No SOUL doc found.');
  return gfetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(doc) {
    var text = '';
    if (doc.body && doc.body.content) {
      doc.body.content.forEach(function(block) {
        if (block.paragraph && block.paragraph.elements) {
          block.paragraph.elements.forEach(function(el) {
            if (el.textRun) text += el.textRun.content;
          });
        }
      });
    }
    return text || '(empty document)';
  });
}

function readSheetSafe(token, sheetId, range) {
  if (!sheetId) return Promise.resolve('(no sheet)');
  return gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range, {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(data) {
    return data.values ? data.values.map(function(row) { return row.join(' | '); }).join('\n') : '(empty)';
  }).catch(function() { return '(error reading sheet)'; });
}

// ====================================
// GOOGLE DOCS API
// ====================================
function appendToDoc(token, docId, text) {
  return gfetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(doc) {
    var end = doc.body.content[doc.body.content.length-1].endIndex - 1;
    return gfetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: end }, text: '\n' + text } }] })
    });
  });
}

// ====================================
// GOOGLE SHEETS API
// ====================================
function writeSheet(token, sheetId, range, values) {
  return gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range + '?valueInputOption=USER_ENTERED', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: values })
  });
}

function readSheet(token, sheetId, range) {
  return gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
}

function appendSheet(token, sheetId, range, values) {
  return gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: values })
  });
}

function logSession(action, data) {
  return getToken(false).then(function(token) {
    var row = [state.currentSessionId || 'none', new Date().toISOString(), '', action, '', data || ''];
    return appendSheet(token, state.sheetId, 'Sessions!A:F', [row]);
  }).catch(function(e) { console.warn('[AgentOS] logSession error:', e.message); });
}

// ====================================
// SKILLS SYSTEM
// ====================================
function createSkillDoc(token, name, code) {
  return gfetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'AgentOS-Skill: ' + name })
  }).then(function(doc) {
    return gfetch('https://docs.googleapis.com/v1/documents/' + doc.documentId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: code } }] })
    }).then(function() {
      return appendSheet(token, state.sheetId, 'Skills!A:D', [[name, doc.documentId, new Date().toISOString(), '0']]).then(function() { return doc.documentId; });
    });
  });
}

function searchSkills(token, query) {
  return readSheet(token, state.sheetId, 'Skills!A:D').then(function(data) {
    if (!data.values) return 'No skills found';
    var matches = data.values.filter(function(row) { return row[0] && row[0].toLowerCase().includes(query.toLowerCase()); });
    return matches.length ? matches.map(function(r) { return r[0] + ' (uses: ' + (r[3]||0) + ')'; }).join(', ') : 'No matching skills';
  });
}

function recallSkill(token, name) {
  return readSheet(token, state.sheetId, 'Skills!A:D').then(function(data) {
    if (!data.values) return 'Skill not found: ' + name;
    var skill = data.values.find(function(r) { return r[0] === name; });
    if (!skill) return 'Skill not found: ' + name;
    return gfetch('https://docs.googleapis.com/v1/documents/' + skill[1], {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(doc) {
      var text = '';
      if (doc.body && doc.body.content) {
        doc.body.content.forEach(function(block) {
          if (block.paragraph && block.paragraph.elements) {
            block.paragraph.elements.forEach(function(el) { if (el.textRun) text += el.textRun.content; });
          }
        });
      }
      return text;
    });
  });
}

function improveSkill(token, name, newCode) {
  return readSheet(token, state.sheetId, 'Skills!A:D').then(function(data) {
    if (!data.values) return 'Skill not found';
    var skill = data.values.find(function(r) { return r[0] === name; });
    if (!skill) return 'Skill not found: ' + name;
    return appendToDoc(token, skill[1], '\n---IMPROVED---\n' + newCode);
  });
}

function listSkills(token) {
  return readSheet(token, state.sheetId, 'Skills!A:D').then(function(data) {
    if (!data.values || data.values.length < 2) return 'No skills registered';
    return data.values.slice(1).map(function(r) { return r[0] + ' (uses: ' + (r[3]||0) + ')'; }).join(', ');
  });
}

// ====================================
// SCHEDULER (Google Calendar)
// ====================================
function createCalendarEvent(token, title, time, recurrence) {
  var start = parseTime(time);
  var end = new Date(start.getTime() + 3600000);
  var event = {
    summary: '[AgentOS] ' + title,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    description: 'AgentOS scheduled task'
  };
  if (recurrence) event.recurrence = ['RRULE:FREQ=' + recurrence.toUpperCase()];
  return gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  }).then(function(e) { return 'Scheduled: ' + e.summary + ' at ' + e.start.dateTime; });
}

function parseTime(time) {
  if (time === 'now') return new Date();
  if (time.match(/^\+\d+[mhd]$/)) {
    var n = parseInt(time.slice(1));
    var u = time.slice(-1);
    var ms = u === 'm' ? n*60000 : u === 'h' ? n*3600000 : n*86400000;
    return new Date(Date.now() + ms);
  }
  return new Date(time);
}

function listScheduledTasks(token) {
  var now = new Date().toISOString();
  return gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + now + '&maxResults=20&q=AgentOS&orderBy=startTime&singleEvents=true', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(data) {
    if (!data.items || !data.items.length) return 'No scheduled tasks';
    return data.items.map(function(e) { return e.summary + ' @ ' + (e.start.dateTime || e.start.date); }).join('\n');
  });
}

function cancelScheduledTask(token, query) {
  return gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?q=' + encodeURIComponent(query) + '&maxResults=5', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(data) {
    if (!data.items || !data.items.length) return 'No matching events found';
    return gfetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + data.items[0].id, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    }).then(function() { return 'Cancelled: ' + data.items[0].summary; });
  });
}

// ====================================
// EMAIL (Gmail)
// ====================================
function sendEmail(token, to, subject, body) {
  var raw = btoa('To: ' + to + '\r\nSubject: ' + subject + '\r\nContent-Type: text/plain\r\n\r\n' + body).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: raw })
  }).then(function(m) { return 'Email sent (id: ' + m.id + ')'; });
}

function checkInbox(token) {
  return gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread', {
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(data) {
    if (!data.messages || !data.messages.length) return 'No unread emails';
    var promises = data.messages.slice(0, 3).map(function(msg) {
      return gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msg.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
    });
    return Promise.all(promises).then(function(msgs) {
      return msgs.map(function(m) {
        var subject = '', from = '';
        m.payload.headers.forEach(function(h) {
          if (h.name === 'Subject') subject = h.value;
          if (h.name === 'From') from = h.value;
        });
        return from + ': ' + subject;
      }).join('\n');
    });
  });
}

// ====================================
// MULTI-AGENT
// ====================================
function spawnSubAgent(token, name, soul) {
  return gfetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'AgentOS-Agent: ' + name })
  }).then(function(doc) {
    return gfetch('https://docs.googleapis.com/v1/documents/' + doc.documentId + ':batchUpdate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: soul || 'Sub-agent: ' + name } }] })
    }).then(function() {
      return appendSheet(token, state.sheetId, 'Agents!A:E', [[name, doc.documentId, '', 'active', new Date().toISOString()]]).then(function() {
        return 'Spawned agent: ' + name + ' (doc: ' + doc.documentId + ')';
      });
    });
  });
}

function messageAgent(name, msg) {
  return getToken(false).then(function(token) {
    return findAgentDoc(name).then(function(id) {
      return gfetch('https://docs.googleapis.com/v1/documents/' + id, {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(doc) {
        var end = doc.body.content[doc.body.content.length-1].endIndex - 1;
        return gfetch('https://docs.googleapis.com/v1/documents/' + id + ':batchUpdate', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ insertText: { location: { index: end }, text: '\n[MSG] ' + msg } }] })
        });
      });
    });
  });
}

function assignTaskToAgent(name, task) { return messageAgent(name, '[TASK] ' + task); }

function findAgentDoc(name) {
  return getToken(false).then(function(token) {
    return gfetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("name='AgentOS-Agent: " + name + "'") + '&fields=files(id,name)', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(d) {
      if (!d.files||!d.files.length) throw new Error('Agent not found: ' + name);
      return d.files[0].id;
    });
  });
}

function listAgents() {
  return getToken(false).then(function(token) {
    return gfetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("name contains 'AgentOS-Agent:'") + '&fields=files(id,name)', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(d) {
      var f = (d.files || []);
      return f.length ? f.map(function(x) { return x.name.replace('AgentOS-Agent: ',''); }).join(', ') : 'No agents';
    });
  });
}

function retireAgent(name) { return messageAgent(name, '[RETIRED] ' + new Date().toISOString()); }

// ====================================
// MESSAGE ROUTER
// ====================================
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  console.log('[AgentOS] Message:', msg.type);

  if (msg.type === 'connect') {
    autoProvision().then(function(r) { sendResponse(r); }).catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  if (msg.type === 'getState') {
    sendResponse({ connected: state.connected, docId: state.docId, sheetId: state.sheetId, sessionActive: state.sessionActive });
    return;
  }

  if (msg.type === 'buildContext') {
    buildContext().then(function(ctx) {
      sendResponse({ success: true, context: ctx });
    }).catch(function(e) {
      console.error('[AgentOS] buildContext error:', e.message);
      sendResponse({ error: e.message });
    });
    return true;
  }

  if (msg.type === 'startSession') {
    state.sessionActive = true;
    state.sessionCount++;
    state.currentSessionId = 'S' + state.sessionCount + '-' + Date.now();
    saveState();
    logSession('START', 'Session started');
    sendResponse({ sessionId: state.currentSessionId });
    return;
  }

  if (msg.type === 'endSession') {
    state.sessionActive = false;
    saveState();
    logSession('END', msg.summary || 'Session ended');
    sendResponse({ success: true });
    return;
  }

  // Doc operations
  if (msg.type === 'saveNote') {
    getToken(false).then(function(t) { return appendToDoc(t, state.docId, msg.text); })
    .then(function() { sendResponse({ success: true }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Sheet operations
  if (msg.type === 'sheetWrite') {
    getToken(false).then(function(t) { return writeSheet(t, state.sheetId, msg.range, msg.values); })
    .then(function(r) { sendResponse({ success: true, result: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  if (msg.type === 'sheetRead') {
    getToken(false).then(function(t) { return readSheet(t, state.sheetId, msg.range); })
    .then(function(r) { sendResponse({ success: true, data: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  if (msg.type === 'sheetAppend') {
    getToken(false).then(function(t) { return appendSheet(t, state.sheetId, msg.range, msg.values); })
    .then(function(r) { sendResponse({ success: true, result: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Task operations
  if (msg.type === 'addTask') {
    getToken(false).then(function(t) {
      return appendSheet(t, state.sheetId, 'Tasks!A:E', [[msg.task, 'pending', msg.priority || 'normal', new Date().toISOString(), '']]);
    }).then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  if (msg.type === 'taskDone') {
    getToken(false).then(function(t) {
      return appendToDoc(t, state.docId, '\n- DONE: ' + msg.task + ' (' + new Date().toISOString() + ')');
    }).then(function() { sendResponse({ success: true }); }).catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Skills
  if (msg.type === 'skillCreate') {
    getToken(false).then(function(t) { return createSkillDoc(t, msg.name, msg.code); })
    .then(function(id) { sendResponse({ success: true, docId: id }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'skillSearch') {
    getToken(false).then(function(t) { return searchSkills(t, msg.query); })
    .then(function(r) { sendResponse({ success: true, results: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'skillRecall') {
    getToken(false).then(function(t) { return recallSkill(t, msg.name); })
    .then(function(r) { sendResponse({ success: true, code: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'skillImprove') {
    getToken(false).then(function(t) { return improveSkill(t, msg.name, msg.code); })
    .then(function() { sendResponse({ success: true }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'skillList') {
    getToken(false).then(function(t) { return listSkills(t); })
    .then(function(r) { sendResponse({ success: true, skills: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Scheduler
  if (msg.type === 'scheduleTask') {
    getToken(false).then(function(t) { return createCalendarEvent(t, msg.title, msg.time, msg.recurrence); })
    .then(function(r) { sendResponse({ success: true, result: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'scheduleList') {
    getToken(false).then(function(t) { return listScheduledTasks(t); })
    .then(function(r) { sendResponse({ success: true, tasks: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'scheduleCancel') {
    getToken(false).then(function(t) { return cancelScheduledTask(t, msg.query); })
    .then(function(r) { sendResponse({ success: true, result: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Email
  if (msg.type === 'emailNotify' || msg.type === 'emailReport') {
    getToken(false).then(function(t) { return sendEmail(t, msg.to, msg.subject, msg.body); })
    .then(function(r) { sendResponse({ success: true, result: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'emailCheck') {
    getToken(false).then(function(t) { return checkInbox(t); })
    .then(function(r) { sendResponse({ success: true, inbox: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Multi-agent
  if (msg.type === 'spawnAgent') {
    getToken(false).then(function(t) { return spawnSubAgent(t, msg.name, msg.soul); })
    .then(function(r) { sendResponse({ success: true, result: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'agentMsg') {
    messageAgent(msg.name, msg.message)
    .then(function() { sendResponse({ success: true }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'assignTask') {
    assignTaskToAgent(msg.name, msg.task)
    .then(function() { sendResponse({ success: true }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'agentList') {
    listAgents()
    .then(function(r) { sendResponse({ success: true, agents: r }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }
  if (msg.type === 'agentDone') {
    retireAgent(msg.name)
    .then(function() { sendResponse({ success: true }); })
    .catch(function(e) { sendResponse({ error: e.message }); });
    return true;
  }

  // Browser tab operations
  if (msg.type === 'tabOpen') {
    chrome.tabs.create({ url: msg.url }, function(tab) { sendResponse({ success: true, tabId: tab.id }); });
    return true;
  }
  if (msg.type === 'tabList') {
    chrome.tabs.query({}, function(tabs) {
      sendResponse({ success: true, tabs: tabs.map(function(t) { return { id: t.id, title: t.title, url: t.url }; }) });
    });
    return true;
  }
  if (msg.type === 'tabClose') {
    chrome.tabs.remove(msg.tabId, function() { sendResponse({ success: true }); });
    return true;
  }

  // Tab interaction handlers
  if (msg.type === 'tabClick') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) { sendResponse({ error: 'No active tab' }); return; }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: function(sel) {
          var el = document.querySelector(sel);
          if (el) { el.click(); return 'Clicked: ' + sel; }
          return 'Element not found: ' + sel;
        },
        args: [msg.selector]
      }, function(results) {
        sendResponse({ success: true, result: results && results[0] ? results[0].result : 'No result' });
      });
    });
    return true;
  }

  if (msg.type === 'tabType') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) { sendResponse({ error: 'No active tab' }); return; }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: function(sel, txt) {
          var el = document.querySelector(sel);
          if (el) { el.value = txt; el.dispatchEvent(new Event('input', {bubbles:true})); return 'Typed in: ' + sel; }
          return 'Element not found: ' + sel;
        },
        args: [msg.selector, msg.text]
      }, function(results) {
        sendResponse({ success: true, result: results && results[0] ? results[0].result : 'No result' });
      });
    });
    return true;
  }

  if (msg.type === 'tabWait') {
    setTimeout(function() {
      sendResponse({ success: true, result: 'Waited ' + msg.ms + 'ms' });
    }, Math.min(msg.ms || 1000, 10000));
    return true;
  }

  if (msg.type === 'tabRead') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) { sendResponse({ error: 'No active tab' }); return; }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: function() { return document.body.innerText.substring(0, 5000); }
      }, function(results) {
        sendResponse({ success: true, text: results && results[0] ? results[0].result : 'Could not read tab' });
      });
    });
    return true;
  }
  if (msg.type === 'tabScrape') {
    chrome.tabs.create({ url: msg.url, active: false }, function(newTab) {
      var done = false;
      function finish(result, error) {
        if (done) return; done = true;
        try { chrome.tabs.remove(newTab.id); } catch(e){}
        if (error) sendResponse({ error: error });
        else sendResponse({ success: true, text: result });
      }
      var listener = function(tabId, info) {
        if (tabId === newTab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(function() {
            chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              func: function() { return document.body.innerText.substring(0, 5000); }
            }, function(results) {
              finish(results && results[0] ? results[0].result : 'Could not read', null);
            });
          }, 1500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(function() { finish(null, 'Scrape timeout'); }, 15000);
    });
    return true;
  }
});

// ====================================
console.log('[AgentOS] Background v4.3 loaded - launchWebAuthFlow auth ready');



