// AgentOS Bridge - Background Service Worker v2.0.0
// Tools Engine: Google Docs, Sheets, Browser, Notes, Search
// Handles OAuth, task management, and tool execution

const CLIENT_ID = '930312309217-9tgvu1i7o3hrogrmnooplbpgminq54m9.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets';

// ===========================================
// AUTH - Chrome Identity OAuth Flow
// ===========================================

function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['access_token', 'token_expiry'], (data) => {
      if (data.access_token && data.token_expiry && Date.now() < data.token_expiry) {
        resolve(data.access_token);
      } else {
        resolve(null);
      }
    });
  });
}

function storeToken(token, expiresIn) {
  const expiry = Date.now() + (expiresIn * 1000) - 60000;
  chrome.storage.local.set({ access_token: token, token_expiry: expiry });
}

async function launchOAuth() {
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + encodeURIComponent(CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent(redirectUrl)
    + '&response_type=token'
    + '&scope=' + encodeURIComponent(SCOPES)
    + '&prompt=consent';
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (!responseUrl) { reject(new Error('No response URL')); return; }
      const url = new URL(responseUrl.replace('#', '?'));
      const token = url.searchParams.get('access_token');
      const expiresIn = parseInt(url.searchParams.get('expires_in') || '3600');
      if (token) { storeToken(token, expiresIn); resolve(token); }
      else { reject(new Error('No token in response')); }
    });
  });
}

async function getAuthToken(interactive) {
  let token = await getStoredToken();
  if (token) return token;
  if (!interactive) throw new Error('Not signed in');
  return launchOAuth();
}

// ===========================================
// GOOGLE DOCS API
// ===========================================

async function readDoc(docId) {
  if (!docId) throw new Error('No doc connected - please connect a doc first');
  const token = await getAuthToken(false);
  const resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId, { headers: { 'Authorization': 'Bearer ' + token } });
  if (!resp.ok) throw new Error('Failed to read doc: ' + resp.status);
  const doc = await resp.json();
  let text = '';
  if (doc.body && doc.body.content) {
    for (const el of doc.body.content) {
      if (el.paragraph && el.paragraph.elements) {
        for (const pe of el.paragraph.elements) { if (pe.textRun) text += pe.textRun.content; }
      }
    }
  }
  return text;
}

async function readDocRaw(docId) {
  if (!docId) throw new Error('No doc connected');
  const token = await getAuthToken(false);
  const resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId, { headers: { 'Authorization': 'Bearer ' + token } });
  if (!resp.ok) throw new Error('Failed to read doc: ' + resp.status);
  return await resp.json();
}

async function batchUpdateDoc(docId, requests) {
  const token = await getAuthToken(false);
  const resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[AgentOS] batchUpdate failed:', resp.status, errText);
    throw new Error('batchUpdate failed: ' + resp.status);
  }
  return await resp.json();
}

// ===========================================
// GOOGLE SHEETS API
// ===========================================

async function sheetWrite(sheetId, range, values) {
  console.log('[AgentOS] sheetWrite:', sheetId, range);
  const token = await getAuthToken(false);
  const resp = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED',
    { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) }
  );
  if (!resp.ok) throw new Error('Sheet write failed: ' + resp.status);
  return await resp.json();
}

async function sheetRead(sheetId, range) {
  console.log('[AgentOS] sheetRead:', sheetId, range);
  const token = await getAuthToken(false);
  const resp = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range),
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!resp.ok) throw new Error('Sheet read failed: ' + resp.status);
  const result = await resp.json();
  return result.values || [];
}

async function sheetAppend(sheetId, range, values) {
  console.log('[AgentOS] sheetAppend:', sheetId, range);
  const token = await getAuthToken(false);
  const resp = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent(range) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
    { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) }
  );
  if (!resp.ok) throw new Error('Sheet append failed: ' + resp.status);
  return await resp.json();
}

// ===========================================
// BROWSER TOOL
// ===========================================

async function browseUrl(url) {
  console.log('[AgentOS] browseUrl:', url);
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'AgentOS/2.0 Browser Tool' } });
    if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
    const html = await resp.text();
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();
    if (text.length > 3000) text = text.substring(0, 3000) + '... [TRUNCATED]';
    return text;
  } catch (e) {
    return 'ERROR browsing ' + url + ': ' + e.message;
  }
}

// ===========================================
// DOC HELPERS
// ===========================================

function getFullText(doc) {
  let text = '';
  if (doc.body && doc.body.content) {
    for (const el of doc.body.content) {
      if (el.paragraph && el.paragraph.elements) {
        for (const pe of el.paragraph.elements) { if (pe.textRun) text += pe.textRun.content; }
      }
    }
  }
  return text;
}

function findSectionInsertPoint(doc, sectionHeader) {
  const fullText = getFullText(doc);
  const idx = fullText.indexOf(sectionHeader);
  if (idx === -1) return null;
  let lineEnd = idx + sectionHeader.length;
  while (lineEnd < fullText.length && fullText[lineEnd] !== '\n') lineEnd++;
  if (lineEnd < fullText.length) lineEnd++;
  return lineEnd + 1;
}

function countTasks(text) {
  const todo = (text.match(/\[ \] /g) || []).length;
  const done = (text.match(/\[x\] /g) || []).length;
  const skipped = (text.match(/\[SKIPPED\]/g) || []).length;
  return { todo, done, skipped };
}

// ===========================================
// TASK MANAGEMENT
// ===========================================

async function markTaskDone(docId, taskText) {
  console.log('[AgentOS] markTaskDone:', taskText);
  const ts = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const doneEntry = '[x] ' + taskText + ' (' + ts + ')';
  try { await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText + '\n', matchCase: false }, replaceText: '' } }]); }
  catch(e) { try { await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText, matchCase: false }, replaceText: '' } }]); } catch(e2) {} }
  try {
    const doc = await readDocRaw(docId);
    const ins = findSectionInsertPoint(doc, '== DONE ==');
    if (ins) await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: doneEntry + '\n' } }]);
  } catch(e) { console.error('[AgentOS] DONE insert error:', e.message); }
  await updateDocStatus(docId);
  return true;
}

async function markTaskSkipped(docId, taskText, reason) {
  console.log('[AgentOS] markTaskSkipped:', taskText);
  const ts = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const entry = '[SKIPPED] ' + taskText + ' | ' + reason + ' (' + ts + ')';
  try { await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText + '\n', matchCase: false }, replaceText: '' } }]); }
  catch(e) { try { await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText, matchCase: false }, replaceText: '' } }]); } catch(e2) {} }
  try {
    const doc = await readDocRaw(docId);
    const ins = findSectionInsertPoint(doc, '== DONE ==');
    if (ins) await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry + '\n' } }]);
  } catch(e) {}
  await updateDocStatus(docId);
  return true;
}

async function addTask(docId, taskText) {
  const doc = await readDocRaw(docId);
  const ins = findSectionInsertPoint(doc, '== TODO ==');
  if (ins) await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: '[ ] ' + taskText + '\n' } }]);
  return true;
}

async function saveNote(docId, noteText) {
  const ts = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const entry = '- ' + noteText + ' (' + ts + ')';
  const doc = await readDocRaw(docId);
  const ins = findSectionInsertPoint(doc, '== NOTES ==');
  if (ins) {
    await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry + '\n' } }]);
  } else {
    const fullText = getFullText(doc);
    const statusIdx = fullText.indexOf('== STATUS ==');
    if (statusIdx !== -1) {
      await batchUpdateDoc(docId, [{ insertText: { location: { index: statusIdx + 1 }, text: '== NOTES ==\n' + entry + '\n\n' } }]);
    }
  }
  return true;
}

async function writeBrowseResults(docId, url, text) {
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const entry = '[' + ts + '] ' + url + '\n' + text + '\n---\n';
  const doc = await readDocRaw(docId);
  const ins = findSectionInsertPoint(doc, '== BROWSER RESULTS ==');
  if (ins) {
    await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry } }]);
  } else {
    const fullText = getFullText(doc);
    const todoIdx = fullText.indexOf('== TODO ==');
    if (todoIdx !== -1) {
      await batchUpdateDoc(docId, [{ insertText: { location: { index: todoIdx + 1 }, text: '== BROWSER RESULTS ==\n' + entry + '\n' } }]);
    }
  }
}

async function writeSheetResults(docId, action, details) {
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const entry = '[' + ts + '] ' + action + ': ' + details + '\n';
  const doc = await readDocRaw(docId);
  const ins = findSectionInsertPoint(doc, '== SHEET RESULTS ==');
  if (ins) {
    await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry } }]);
  } else {
    const fullText = getFullText(doc);
    const todoIdx = fullText.indexOf('== TODO ==');
    if (todoIdx !== -1) {
      await batchUpdateDoc(docId, [{ insertText: { location: { index: todoIdx + 1 }, text: '== SHEET RESULTS ==\n' + entry + '\n' } }]);
    }
  }
}

async function updateDocStatus(docId) {
  try {
    const text = await readDoc(docId);
    const counts = countTasks(text);
    const total = counts.todo + counts.done + counts.skipped;
    let statusText = counts.todo === 0 && total > 0
      ? 'ALL TASKS COMPLETE | ' + counts.done + ' done, ' + counts.skipped + ' skipped'
      : counts.done + '/' + total + ' done, ' + counts.todo + ' remaining' + (counts.skipped > 0 ? ', ' + counts.skipped + ' skipped' : '');
    const doc = await readDocRaw(docId);
    const fullText = getFullText(doc);
    const si = fullText.indexOf('== STATUS ==');
    if (si !== -1) {
      let ah = si + '== STATUS =='.length;
      while (ah < fullText.length && fullText[ah] === '\n') ah++;
      let le = ah;
      while (le < fullText.length && fullText[le] !== '\n') le++;
      const old = fullText.substring(ah, le);
      if (old.trim()) await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: old.trim(), matchCase: false }, replaceText: statusText } }]);
    }
  } catch(e) { console.error('[AgentOS] status error:', e.message); }
}

async function getTaskCounts(docId) {
  const text = await readDoc(docId);
  return countTasks(text);
}

// ===========================================
// INSTALL
// ===========================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AgentOS v2.0] installed:', details.reason);
  if (details.reason === 'update') chrome.storage.local.remove(['access_token', 'token_expiry']);
});

// ===========================================
// MESSAGE HANDLER
// ===========================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'login': { const t = await launchOAuth(); sendResponse({ success: true, token: t }); break; }
        case 'checkAuth': { const s = await getStoredToken(); sendResponse({ loggedIn: !!s }); break; }
        case 'logout': { chrome.storage.local.remove(['access_token', 'token_expiry', 'docId', 'sheetId']); sendResponse({ success: true }); break; }
        case 'setDocId': { chrome.storage.local.set({ docId: msg.docId }); sendResponse({ success: true }); break; }
        case 'setSheetId': { chrome.storage.local.set({ sheetId: msg.sheetId }); sendResponse({ success: true }); break; }
        case 'getStatus': {
          const st = await getStoredToken();
          const sd = await new Promise(r => chrome.storage.local.get(['docId', 'sheetId'], r));
          sendResponse({ loggedIn: !!st, docId: sd.docId || null, sheetId: sd.sheetId || null });
          break;
        }
        case 'readDoc': {
          const dd = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const txt = await readDoc(dd.docId || msg.docId);
          sendResponse({ success: true, text: txt });
          break;
        }
        case 'taskDone': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await markTaskDone(d.docId, msg.taskText);
          const c = await getTaskCounts(d.docId);
          sendResponse({ success: true, counts: c });
          break;
        }
        case 'taskSkip': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await markTaskSkipped(d.docId, msg.taskText, msg.reason || 'no reason');
          const c = await getTaskCounts(d.docId);
          sendResponse({ success: true, counts: c });
          break;
        }
        case 'addTask': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await addTask(d.docId, msg.taskText);
          sendResponse({ success: true });
          break;
        }
        case 'browse': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const pageText = await browseUrl(msg.url);
          await writeBrowseResults(d.docId, msg.url, pageText);
          sendResponse({ success: true, text: pageText.substring(0, 200) });
          break;
        }
        case 'sheetWrite': {
          const d = await new Promise(r => chrome.storage.local.get(['docId', 'sheetId'], r));
          const sid = msg.sheetId || d.sheetId;
          if (!sid) throw new Error('No sheet connected');
          const res = await sheetWrite(sid, msg.range, msg.values);
          await writeSheetResults(d.docId, 'WRITE', 'Wrote to ' + (res.updatedRange || msg.range));
          sendResponse({ success: true, result: res });
          break;
        }
        case 'sheetRead': {
          const d = await new Promise(r => chrome.storage.local.get(['docId', 'sheetId'], r));
          const sid = msg.sheetId || d.sheetId;
          if (!sid) throw new Error('No sheet connected');
          const vals = await sheetRead(sid, msg.range);
          let summary = 'Read ' + vals.length + ' rows from ' + msg.range;
          await writeSheetResults(d.docId, 'READ', summary);
          sendResponse({ success: true, values: vals });
          break;
        }
        case 'sheetAppend': {
          const d = await new Promise(r => chrome.storage.local.get(['docId', 'sheetId'], r));
          const sid = msg.sheetId || d.sheetId;
          if (!sid) throw new Error('No sheet connected');
          await sheetAppend(sid, msg.range, msg.values);
          await writeSheetResults(d.docId, 'APPEND', 'Appended ' + msg.values.length + ' rows');
          sendResponse({ success: true });
          break;
        }
        case 'saveNote': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await saveNote(d.docId, msg.text);
          sendResponse({ success: true });
          break;
        }
        case 'appendToDoc': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const doc = await readDocRaw(d.docId);
          const ei = doc.body.content[doc.body.content.length - 1].endIndex - 1;
          await batchUpdateDoc(d.docId, [{ insertText: { location: { index: ei }, text: msg.text } }]);
          sendResponse({ success: true });
          break;
        }
        case 'getTaskCounts': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const c = await getTaskCounts(d.docId);
          sendResponse({ success: true, counts: c });
          break;
        }
        default: sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[AgentOS] Error:', err.message);
      sendResponse({ error: err.message });
    }
  })();
  return true;
});
