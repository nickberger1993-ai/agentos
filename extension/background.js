// AgentOS Bridge - Background Service Worker
// Handles Google OAuth via chrome.identity, reads/writes Google Docs

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
  console.log('[AgentOS] Redirect URL:', redirectUrl);

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + encodeURIComponent(CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent(redirectUrl)
    + '&response_type=token'
    + '&scope=' + encodeURIComponent(SCOPES)
    + '&prompt=consent';

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          console.error('[AgentOS] Auth error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          console.error('[AgentOS] No response URL');
          reject(new Error('No response URL'));
          return;
        }
        console.log('[AgentOS] Got response URL, parsing token...');
        const url = new URL(responseUrl.replace('#', '?'));
        const token = url.searchParams.get('access_token');
        const expiresIn = parseInt(url.searchParams.get('expires_in') || '3600');
        if (token) {
          storeToken(token, expiresIn);
          console.log('[AgentOS] Token stored successfully');
          resolve(token);
        } else {
          console.error('[AgentOS] No token in response');
          reject(new Error('No token in response'));
        }
      }
    );
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
  console.log('[AgentOS] Reading doc:', docId);
  const resp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[AgentOS] Doc read failed:', resp.status, errText);
    throw new Error('Failed to read doc: ' + resp.status);
  }
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
  console.log('[AgentOS] Doc read success, length:', text.length);
  return text;
}

async function appendToDoc(docId, text) {
  const token = await getAuthToken(false);
  const docResp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  const doc = await docResp.json();
  const endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
  const resp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate',
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: text } }] })
    }
  );
  if (!resp.ok) throw new Error('Failed to append: ' + resp.status);
  return true;
}

async function replaceInDoc(docId, find, replace) {
  const token = await getAuthToken(false);
  const resp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate',
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace } }]
      })
    }
  );
  if (!resp.ok) throw new Error('Failed to replace: ' + resp.status);
  return true;
}

async function markTaskDone(docId, taskText) {
  const timestamp = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
  await replaceInDoc(docId, '[ ] ' + taskText, '[x] ' + taskText);
  const doneEntry = '\n[' + timestamp + '] ' + taskText;
  await appendToDoc(docId, doneEntry);
  return true;
}

async function addTask(docId, taskText) {
  await replaceInDoc(docId, '== TODO ==', '== TODO ==\n[ ] ' + taskText);
  return true;
}

// ===========================================
// INSTALL HANDLER - clear stale data
// ===========================================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AgentOS] Extension installed/updated:', details.reason);
  if (details.reason === 'update') {
    // Clear stale auth data on update to force fresh login
    chrome.storage.local.remove(['access_token', 'token_expiry', 'docId'], () => {
      console.log('[AgentOS] Cleared stale storage on update');
    });
  }
});

// ===========================================
// MESSAGE HANDLER
// ===========================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      console.log('[AgentOS] Message received:', msg.action);

      switch (msg.action) {
        case 'login':
          const token = await launchOAuth();
          sendResponse({ success: true, token });
          break;

        case 'checkAuth':
          const stored = await getStoredToken();
          sendResponse({ loggedIn: !!stored });
          break;

        case 'logout':
          chrome.storage.local.remove(['access_token', 'token_expiry', 'docId']);
          console.log('[AgentOS] Logged out, cleared all storage');
          sendResponse({ success: true });
          break;

        case 'setDocId':
          chrome.storage.local.set({ docId: msg.docId });
          console.log('[AgentOS] Doc ID set:', msg.docId);
          sendResponse({ success: true });
          break;

        case 'getStatus':
          const statusToken = await getStoredToken();
          const statusData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          console.log('[AgentOS] getStatus:', { loggedIn: !!statusToken, docId: statusData.docId || null });
          sendResponse({ loggedIn: !!statusToken, docId: statusData.docId || null });
          break;

        case 'readDoc':
          const docData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const docId = docData.docId || msg.docId;
          console.log('[AgentOS] readDoc with docId:', docId);
          const text = await readDoc(docId);
          sendResponse({ success: true, text });
          break;

        case 'taskDone':
          const doneData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await markTaskDone(doneData.docId, msg.taskText);
          sendResponse({ success: true });
          break;

        case 'addTask':
          const addData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await addTask(addData.docId, msg.taskText);
          sendResponse({ success: true });
          break;

        case 'appendToDoc':
          const appendData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await appendToDoc(appendData.docId, msg.text);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[AgentOS] Error:', err.message);
      sendResponse({ error: err.message });
    }
  })();
  return true; // keep channel open for async
});
