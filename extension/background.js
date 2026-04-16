// ============================================================
// AgentOS v4.0 - BACKGROUND SERVICE WORKER
// Auto-provisioning + Session engine + All module wiring
// One click: OAuth -> Doc + Sheet + Calendar + Gmail -> Ready
// ============================================================

const DEFAULT_SOUL = [
  '== SOUL ==',
  'You are an AgentOS v4.0 autonomous AI agent.',
  'You persist across sessions. You remember everything. You learn skills.',
  'You schedule your own work. You manage sub-agents. You communicate via email.',
  '',
  'Your memory is this Google Doc. Your database is Google Sheets.',
  'Your scheduler is Google Calendar. Your inbox is Gmail.',
  'Your hands are the Chrome Extension.',
  '',
  'You are NOT a chatbot. You are an OPERATING SYSTEM for intelligence.',
  '',
  '== CORE IDENTITY ==',
  '- I read my TODO list and work through tasks autonomously',
  '- I use command tags to take real actions (browse, write, schedule, email)',
  '- I learn from experience and create reusable skills',
  '- I schedule recurring tasks on Google Calendar',
  '- I can spawn sub-agents and delegate work',
  '- I communicate results via Gmail',
  '- When all tasks are done, I output [SESSION_COMPLETE]',
  '- I NEVER ask for permission - I act, report results, move to next task',
  '',
  '== AVAILABLE TAGS ==',
  '',
  'Memory: [SAVE_NOTE|text] [SHEET_WRITE|range|data] [SHEET_READ|range]',
  '[SHEET_APPEND|data] [TASK_DONE] [ADD_TASK|task] [SKIP|reason]',
  '',
  'Browser: [TAB_OPEN|url] [TAB_SCRAPE|selector] [TAB_CLICK|selector]',
  '[TAB_TYPE|selector|text] [TAB_READ] [TAB_LIST] [TAB_CLOSE|tabId]',
  '[TAB_WAIT|seconds] [BROWSE|url]',
  '',
  'Skills: [SKILL_CREATE|name|category|desc|steps|tags] [SKILL_SEARCH|query]',
  '[SKILL_RECALL|docId] [SKILL_IMPROVE|docId|note] [SKILL_LIST]',
  '',
  'Scheduler: [SCHEDULE_TASK|title|time|recurrence] [SCHEDULE_LIST]',
  '[SCHEDULE_CANCEL|eventId]',
  '',
  'Multi-Agent: [SPAWN_AGENT|name|role] [AGENT_MSG|name|msg]',
  '[ASSIGN_TASK|name|task] [AGENT_LIST] [AGENT_DONE|summary]',
  '',
  'Email: [EMAIL_NOTIFY|to|subject|body] [EMAIL_REPORT|to] [EMAIL_CHECK]',
  '',
  'Session: [SESSION_COMPLETE]',
  '',
  '== RULES ==',
  '1. ALWAYS start by reading TODO section',
  '2. Work through tasks ONE AT A TIME',
  '3. After each task, output [TASK_DONE] then move to next',
  '4. Use skills when available - check with [SKILL_SEARCH] first',
  '5. Create skills after completing complex multi-step tasks',
  '6. Schedule recurring tasks instead of doing them manually',
  '7. Delegate to sub-agents when tasks are parallelizable',
  '8. Log everything to the database for future reference',
  '9. Send email notifications for important completions',
  '10. When all tasks are done, output [SESSION_COMPLETE]',
  '',
  '== TODO ==',
  '[ ] Review available skills',
  '[ ] Check scheduled tasks for today',
  '[ ] Check email inbox for new assignments',
  '',
  '== DONE ==',
  '',
  '== NOTES ==',
  '',
  '== SESSION LOG =='
].join('\n');

// ---- AUTO-PROVISIONING ENGINE ----
async function autoProvision(token) {
  const status = { doc: null, sheet: null, calendar: null, gmail: null };
  try {
    // 1. Create SOUL Google Doc
    const docRes = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '[AgentOS] My Agent' })
    });
    const doc = await docRes.json();
    status.doc = { id: doc.documentId, url: `https://docs.google.com/document/d/${doc.documentId}/edit` };
    await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: DEFAULT_SOUL } }] })
    });

    // 2. Create Database Google Sheet with all tabs
    const sheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: '[AgentOS] My Agent DB' },
        sheets: [
          { properties: { title: 'Sessions' } }, { properties: { title: 'Skills' } },
          { properties: { title: 'Agents' } }, { properties: { title: 'Messages' } },
          { properties: { title: 'Templates' } }, { properties: { title: 'Data' } }
        ]
      })
    });
    const sheet = await sheetRes.json();
    status.sheet = { id: sheet.spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit` };
    const headers = {
      Sessions: [['Timestamp','Session ID','Action','Input','Output','Status']],
      Skills: [['Skill Name','Category','Doc ID','Created','Last Used','Use Count','Rating','Tags']],
      Agents: [['Agent Name','Role','Doc ID','Sheet ID','Status','Created','Last Active','Task Count','Parent']],
      Messages: [['Timestamp','From','To','Type','Message','Status','Response']],
      Data: [['Timestamp','Key','Value','Source','Notes']]
    };
    for (const [tab, vals] of Object.entries(headers)) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${tab}!A1:I1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: vals })
      });
    }

    // 3. Create Google Calendar
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'AgentOS Tasks', description: 'Scheduled tasks for AgentOS agent' })
      });
      const cal = await calRes.json();
      status.calendar = { id: cal.id };
    } catch (e) { console.warn('[Provision] Calendar skipped:', e); }

    // 4. Create Gmail Label
    try {
      const labelRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'AgentOS', labelListVisibility: 'labelShow', messageListVisibility: 'show' })
      });
      const label = await labelRes.json();
      status.gmail = { labelId: label.id };
    } catch (e) { console.warn('[Provision] Gmail skipped:', e); }

    // 5. Save to storage
    await chrome.storage.local.set({
      docId: doc.documentId, docUrl: status.doc.url,
      sheetId: sheet.spreadsheetId, sheetUrl: status.sheet.url,
      calendarId: status.calendar?.id || null, gmailLabelId: status.gmail?.labelId || null,
      provisioned: true, provisionedAt: new Date().toISOString(), token
    });
    console.log('[Provision] COMPLETE:', status);
    return { success: true, ...status };
  } catch (err) {
    console.error('[Provision] FAILED:', err);
    return { success: false, error: err.message };
  }
                  }

// ---- GOOGLE API HELPERS ----
async function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(token);
    });
  });
}

async function readDoc(docId, token) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const doc = await res.json();
  let text = '';
  if (doc.body?.content) {
    for (const elem of doc.body.content) {
      if (elem.paragraph) {
        for (const el of elem.paragraph.elements) { if (el.textRun) text += el.textRun.content; }
      }
    }
  }
  return text;
}

async function appendToDoc(docId, text, token) {
  const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const doc = await docRes.json();
  const endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
  await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: '\n' + text } }] })
  });
}

async function readSheet(sheetId, range, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json();
  return data.values || [];
}

async function writeSheet(sheetId, range, values, token) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
}

async function appendSheet(sheetId, tab, values, token) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}!A:Z:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
}

// ---- SESSION ENGINE ----
async function buildSessionPrompt(token) {
  const data = await chrome.storage.local.get(['docId', 'sheetId']);
  if (!data.docId) return null;
  const docText = await readDoc(data.docId, token);
  let recentMemory = '';
  if (data.sheetId) {
    const sessions = await readSheet(data.sheetId, 'Sessions!A:F', token);
    if (sessions.length > 1) {
      const recent = sessions.slice(-6);
      recentMemory = '\n== RECENT MEMORY ==\n';
      for (const row of recent.slice(1)) { recentMemory += `[${row[0]}] ${row[2]}: ${row[4] || ''}\n`; }
    }
  }
  return [
    '=== AGENTOS SESSION START ===',
    'You are resuming an AgentOS session. Read your memory and continue working.',
    '', docText, recentMemory, '',
    'NOW: Read your TODO list and begin working. Output command tags to take action.',
    '=== BEGIN ==='
  ].join('\n');
}

async function logSession(action, input, output, status, token) {
  const data = await chrome.storage.local.get(['sheetId']);
  if (!data.sheetId) return;
  await appendSheet(data.sheetId, 'Sessions', [[new Date().toISOString(), `s-${Date.now()}`, action, input, output || '', status || 'ok']], token);
}

// ---- MESSAGE HANDLER ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getToken') {
    getToken().then(t => sendResponse({ token: t })).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'connectGoogle') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['provisioned']);
      if (data.provisioned) { sendResponse({ success: true, alreadyProvisioned: true, token }); return; }
      const result = await autoProvision(token);
      sendResponse({ ...result, token });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'getStatus') {
    chrome.storage.local.get(['provisioned','docId','docUrl','sheetId','sheetUrl','calendarId','gmailLabelId','provisionedAt'], d => sendResponse(d));
    return true;
  }
  if (msg.type === 'startSession') {
    getToken().then(async token => {
      const prompt = await buildSessionPrompt(token);
      await logSession('session_start', 'User initiated', '', 'started', token);
      sendResponse({ success: true, prompt, token });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'endSession') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['docId']);
      if (data.docId) await appendToDoc(data.docId, `\n[${new Date().toISOString()}] SESSION END: ${msg.summary || 'Ended by user'}`, token);
      await logSession('session_end', msg.summary || '', '', 'completed', token);
      sendResponse({ success: true });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'readDoc') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['docId']);
      sendResponse({ text: await readDoc(data.docId, token) });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'appendDoc') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['docId']);
      await appendToDoc(data.docId, msg.text, token);
      sendResponse({ success: true });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'readSheet') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['sheetId']);
      sendResponse({ values: await readSheet(data.sheetId, msg.range, token) });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'writeSheet') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['sheetId']);
      await writeSheet(data.sheetId, msg.range, msg.values, token);
      sendResponse({ success: true });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'appendSheet') {
    getToken().then(async token => {
      const data = await chrome.storage.local.get(['sheetId']);
      await appendSheet(data.sheetId, msg.tab || 'Data', msg.values, token);
      sendResponse({ success: true });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'logSession') {
    getToken().then(async token => {
      await logSession(msg.action, msg.input, msg.output, msg.status, token);
      sendResponse({ success: true });
    }).catch(e => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'tabOpen') {
    chrome.tabs.create({ url: msg.url }, tab => sendResponse({ tabId: tab.id }));
    return true;
  }
  if (msg.type === 'tabClose') {
    chrome.tabs.remove(parseInt(msg.tabId), () => sendResponse({ success: true }));
    return true;
  }
  if (msg.type === 'tabList') {
    chrome.tabs.query({}, tabs => sendResponse({ tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url })) }));
    return true;
  }
  if (msg.type === 'tabScrape' || msg.type === 'tabClick' || msg.type === 'tabType' || msg.type === 'tabRead') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) { sendResponse({ error: 'No active tab' }); return; }
      chrome.tabs.sendMessage(tabs[0].id, msg, r => sendResponse(r || { error: 'No response' }));
    });
    return true;
  }
  if (msg.type === 'resetAgent') {
    chrome.storage.local.clear(() => sendResponse({ success: true }));
    return true;
  }
});

// ---- STARTUP ----
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AgentOS] v4.0 installed. Connect Google to get started.');
});

console.log('[AgentOS] Background service worker loaded v4.0');
