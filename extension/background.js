// AgentOS Bridge - Background Service Worker v2.1.0
// Browser Control Engine: Navigate, Click, Type, Scrape + all v2.0 tools
// Gives AI hands to control the browser

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
  const resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!resp.ok) throw new Error('Failed to read doc: ' + resp.status);
  const doc = await resp.json();
  let text = '';
  if (doc.body && doc.body.content) {
    for (const el of doc.body.content) {
      if (el.paragraph && el.paragraph.elements) {
        for (const pe of el.paragraph.elements) {
          if (pe.textRun) text += pe.textRun.content;
        }
      }
    }
  }
  return text;
}

async function readDocRaw(docId) {
  if (!docId) throw new Error('No doc connected');
  const token = await getAuthToken(false);
  const resp = await fetch('https://docs.googleapis.com/v1/documents/' + docId, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
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
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error('Sheet write failed: ' + resp.status + ' ' + errBody.substring(0, 200));
  }
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
// BROWSER TOOL (fetch-based scrape)
// ===========================================
async function browseUrl(url) {
  console.log('[AgentOS] browseUrl:', url);
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'AgentOS/2.1 Browser Tool' } });
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
// BROWSER CONTROL ENGINE v2.1
// ===========================================

// Navigate: open URL in a new tab and return tab info
async function tabNavigate(url) {
  console.log('[AgentOS] tabNavigate:', url);
  try {
    const tab = await chrome.tabs.create({ url: url, active: false });
    // Wait for tab to finish loading
    await new Promise((resolve) => {
      function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
      // Timeout after 15 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
    });
    return { success: true, tabId: tab.id, url: tab.url || url, title: tab.title || '' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Scrape: extract text content from a tab's DOM
async function tabScrape(tabId, selector) {
  console.log('[AgentOS] tabScrape:', tabId, selector);
  try {
    // If no tabId provided, get the last active non-extension tab
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0) tabId = tabs[0].id;
      else throw new Error('No active tab found');
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (sel) => {
        try {
          if (sel) {
            const el = document.querySelector(sel);
            return el ? el.innerText || el.textContent || '' : 'SELECTOR_NOT_FOUND: ' + sel;
          }
          // Default: get page text content, stripped
          const body = document.body.cloneNode(true);
          body.querySelectorAll('script, style, nav, footer, header, iframe').forEach(el => el.remove());
          let text = body.innerText || body.textContent || '';
          text = text.replace(/\s+/g, ' ').trim();
          return text;
        } catch(e) {
          return 'SCRAPE_ERROR: ' + e.message;
        }
      },
      args: [selector || null]
    });
    let text = results && results[0] ? results[0].result : '';
    if (text.length > 5000) text = text.substring(0, 5000) + '... [TRUNCATED]';
    return { success: true, text: text, tabId: tabId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Click: click an element on a tab by CSS selector
async function tabClick(tabId, selector) {
  console.log('[AgentOS] tabClick:', tabId, selector);
  try {
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0) tabId = tabs[0].id;
      else throw new Error('No active tab found');
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (sel) => {
        try {
          const el = document.querySelector(sel);
          if (!el) return { success: false, error: 'Element not found: ' + sel };
          el.click();
          return { success: true, clicked: sel, tagName: el.tagName, text: (el.innerText || '').substring(0, 100) };
        } catch(e) {
          return { success: false, error: e.message };
        }
      },
      args: [selector]
    });
    return results && results[0] ? results[0].result : { success: false, error: 'No result' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Type: type text into an input element on a tab
async function tabType(tabId, selector, text) {
  console.log('[AgentOS] tabType:', tabId, selector);
  try {
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0) tabId = tabs[0].id;
      else throw new Error('No active tab found');
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (sel, val) => {
        try {
          const el = document.querySelector(sel);
          if (!el) return { success: false, error: 'Element not found: ' + sel };
          el.focus();
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.isContentEditable) {
            el.textContent = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            return { success: false, error: 'Element is not an input: ' + el.tagName };
          }
          return { success: true, typed: val.substring(0, 50), selector: sel };
        } catch(e) {
          return { success: false, error: e.message };
        }
      },
      args: [selector, text]
    });
    return results && results[0] ? results[0].result : { success: false, error: 'No result' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Read: list elements matching a selector (for AI to discover page structure)
async function tabRead(tabId, selector) {
  console.log('[AgentOS] tabRead:', tabId, selector);
  try {
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0) tabId = tabs[0].id;
      else throw new Error('No active tab found');
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (sel) => {
        try {
          const elements = document.querySelectorAll(sel);
          const items = [];
          for (let i = 0; i < Math.min(elements.length, 50); i++) {
            const el = elements[i];
            const item = {
              index: i,
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              classes: el.className ? el.className.substring(0, 100) : null,
              text: (el.innerText || '').substring(0, 150),
              href: el.href || null,
              type: el.type || null,
              name: el.name || null,
              value: el.value ? el.value.substring(0, 100) : null
            };
            // Build a unique selector for this element
            if (el.id) item.selector = '#' + el.id;
            else if (el.name) item.selector = el.tagName.toLowerCase() + '[name="' + el.name + '"]';
            items.push(item);
          }
          return { success: true, count: elements.length, items: items };
        } catch(e) {
          return { success: false, error: e.message };
        }
      },
      args: [selector || 'a, button, input, textarea, select, [role="button"]']
    });
    return results && results[0] ? results[0].result : { success: false, error: 'No result' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Get all open tabs info
async function tabList() {
  try {
    const tabs = await chrome.tabs.query({});
    const items = tabs.map(t => ({
      id: t.id,
      title: (t.title || '').substring(0, 100),
      url: t.url || '',
      active: t.active
    }));
    return { success: true, tabs: items };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Close a tab
async function tabClose(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Wait for a specified number of milliseconds
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.min(ms, 10000)));
}

// ===========================================
// DOC HELPERS
// ===========================================
function getFullText(doc) {
  let text = '';
  if (doc.body && doc.body.content) {
    for (const el of doc.body.content) {
      if (el.paragraph && el.paragraph.elements) {
        for (const pe of el.paragraph.elements) {
          if (pe.textRun) text += pe.textRun.content;
        }
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
  try {
    await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText + '\n', matchCase: false }, replaceText: '' } }]);
  } catch(e) {
    try { await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText, matchCase: false }, replaceText: '' } }]); } catch(e2) {}
  }
  try {
    const doc = await readDocRaw(docId);
    const ins = findSectionInsertPoint(doc, '== DONE ==');
    if (ins) await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: doneEntry + '\n' } }]);
  } catch(e) { console.error('[AgentOS] DONE insert error:', e.message); }
  await updateDocStatus(docId);
  return true;
}

async function markTaskSkipped(docId, taskText, reason) {
  const ts = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const entry = '[SKIPPED] ' + taskText + ' | ' + reason + ' (' + ts + ')';
  try {
    await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText + '\n', matchCase: false }, replaceText: '' } }]);
  } catch(e) {
    try { await batchUpdateDoc(docId, [{ replaceAllText: { containsText: { text: '[ ] ' + taskText, matchCase: false }, replaceText: '' } }]); } catch(e2) {}
  }
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
  }
  return true;
}

async function writeBrowseResults(docId, url, text) {
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const entry = '[' + ts + '] ' + url + '\n' + text.substring(0, 1000) + '\n---\n';
  const doc = await readDocRaw(docId);
  const ins = findSectionInsertPoint(doc, '== BROWSER RESULTS ==');
  if (ins) {
    await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry } }]);
  }
}

async function writeSheetResults(docId, action, details) {
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const entry = '[' + ts + '] ' + action + ': ' + details + '\n';
  const doc = await readDocRaw(docId);
  const ins = findSectionInsertPoint(doc, '== SHEET RESULTS ==');
  if (ins) {
    await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry } }]);
  }
}

// NEW v2.1: Write action results to ACTION LOG section
async function writeActionLog(docId, action, result) {
  const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const summary = typeof result === 'string' ? result : JSON.stringify(result).substring(0, 500);
  const entry = '[' + ts + '] ' + action + ' => ' + summary + '\n';
  try {
    const doc = await readDocRaw(docId);
    const ins = findSectionInsertPoint(doc, '== ACTION LOG ==');
    if (ins) {
      await batchUpdateDoc(docId, [{ insertText: { location: { index: ins }, text: entry } }]);
    } else {
      // Create ACTION LOG section before BROWSER RESULTS or TODO
      const fullText = getFullText(doc);
      let anchor = fullText.indexOf('== BROWSER RESULTS ==');
      if (anchor === -1) anchor = fullText.indexOf('== TODO ==');
      if (anchor !== -1) {
        await batchUpdateDoc(docId, [{ insertText: { location: { index: anchor + 1 }, text: '== ACTION LOG ==\n' + entry + '\n' } }]);
      }
    }
  } catch(e) {
    console.error('[AgentOS] writeActionLog error:', e.message);
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
  console.log('[AgentOS v2.1] installed:', details.reason);
  if (details.reason === 'update') chrome.storage.local.remove(['access_token', 'token_expiry']);
});

// ===========================================
// MESSAGE HANDLER
// ===========================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        // ---- AUTH ----
        case 'login': { const t = await launchOAuth(); sendResponse({ success: true, token: t }); break; }
        case 'checkAuth': { const s = await getStoredToken(); sendResponse({ loggedIn: !!s }); break; }
        case 'logout': { chrome.storage.local.remove(['access_token', 'token_expiry', 'docId', 'sheetId']); sendResponse({ success: true }); break; }

        // ---- STORAGE ----
        case 'setDocId': { chrome.storage.local.set({ docId: msg.docId }); sendResponse({ success: true }); break; }
        case 'setSheetId': { chrome.storage.local.set({ sheetId: msg.sheetId }); sendResponse({ success: true }); break; }
        case 'getStatus': {
          const st = await getStoredToken();
          const sd = await new Promise(r => chrome.storage.local.get(['docId', 'sheetId'], r));
          sendResponse({ loggedIn: !!st, docId: sd.docId || null, sheetId: sd.sheetId || null });
          break;
        }

        // ---- DOC ----
        case 'readDoc': {
          const dd = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const txt = await readDoc(dd.docId || msg.docId);
          sendResponse({ success: true, text: txt });
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

        // ---- TASKS ----
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
        case 'getTaskCounts': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const c = await getTaskCounts(d.docId);
          sendResponse({ success: true, counts: c });
          break;
        }

        // ---- BROWSE (fetch-based) ----
        case 'browse': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const pageText = await browseUrl(msg.url);
          await writeBrowseResults(d.docId, msg.url, pageText);
          sendResponse({ success: true, text: pageText.substring(0, 200) });
          break;
        }

        // ---- SHEETS ----
        case 'sheetWrite': {
          const d = await new Promise(r => chrome.storage.local.get(['docId', 'sheetId'], r));
          const sid = msg.sheetId || d.sheetId;
          if (!sid) throw new Error('No sheet connected - connect a Google Sheet first');
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
          await writeSheetResults(d.docId, 'READ', 'Read ' + vals.length + ' rows from ' + msg.range);
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

        // ---- NOTES ----
        case 'saveNote': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await saveNote(d.docId, msg.text);
          sendResponse({ success: true });
          break;
        }

        // ---- BROWSER CONTROL v2.1 ----
        case 'tabNavigate': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const result = await tabNavigate(msg.url);
          if (d.docId) await writeActionLog(d.docId, 'NAVIGATE ' + msg.url, result.success ? 'Opened tab ' + result.tabId : result.error);
          sendResponse(result);
          break;
        }
        case 'tabScrape': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const result = await tabScrape(msg.tabId, msg.selector);
          if (d.docId && result.success) await writeActionLog(d.docId, 'SCRAPE tab:' + result.tabId + (msg.selector ? ' sel:' + msg.selector : ''), result.text.substring(0, 300));
          sendResponse(result);
          break;
        }
        case 'tabClick': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const result = await tabClick(msg.tabId, msg.selector);
          if (d.docId) await writeActionLog(d.docId, 'CLICK ' + msg.selector + ' tab:' + (msg.tabId || 'active'), result.success ? 'Clicked ' + (result.tagName || '') : result.error);
          sendResponse(result);
          break;
        }
        case 'tabType': {
          const d = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const result = await tabType(msg.tabId, msg.selector, msg.text);
          if (d.docId) await writeActionLog(d.docId, 'TYPE into ' + msg.selector, result.success ? 'Typed: ' + (msg.text || '').substring(0, 50) : result.error);
          sendResponse(result);
          break;
        }
        case 'tabRead': {
          const result = await tabRead(msg.tabId, msg.selector);
          sendResponse(result);
          break;
        }
        case 'tabList': {
          const result = await tabList();
          sendResponse(result);
          break;
        }
        case 'tabClose': {
          const result = await tabClose(msg.tabId);
          sendResponse(result);
          break;
        }
        case 'tabWait': {
          await wait(msg.ms || 2000);
          sendResponse({ success: true, waited: msg.ms || 2000 });
          break;
        }

        default: sendResponse({ error: 'Unknown action: ' + msg.action });
      }
    } catch (err) {
      console.error('[AgentOS] Error:', err.message);
      sendResponse({ error: err.message });
    }
  })();
  return true;
});
