// AgentOS Bridge - Background Service Worker v1.5.1
// Handles Google OAuth, reads/writes Google Docs, manages task state
// Fixes: replaceAllText fallback for task deletion

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
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) { reject(new Error('No response URL')); return; }
        const url = new URL(responseUrl.replace('#', '?'));
        const token = url.searchParams.get('access_token');
        const expiresIn = parseInt(url.searchParams.get('expires_in') || '3600');
        if (token) {
          storeToken(token, expiresIn);
          resolve(token);
        } else {
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
  const resp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
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
  const resp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!resp.ok) throw new Error('Failed to read doc: ' + resp.status);
  return await resp.json();
}

async function batchUpdateDoc(docId, requests) {
  const token = await getAuthToken(false);
  const resp = await fetch(
    'https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests: requests })
    }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[AgentOS] batchUpdate failed:', resp.status, errText);
    throw new Error('batchUpdate failed: ' + resp.status);
  }
  return await resp.json();
}

// ===========================================
// SMART TASK MANAGEMENT
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

function findLineRange(doc, searchText) {
  const fullText = getFullText(doc);
  const idx = fullText.indexOf(searchText);
  if (idx === -1) return null;
  let lineStart = idx;
  while (lineStart > 0 && fullText[lineStart - 1] !== '\n') lineStart--;
  let lineEnd = idx + searchText.length;
  while (lineEnd < fullText.length && fullText[lineEnd] !== '\n') lineEnd++;
  if (lineEnd < fullText.length) lineEnd++;
  return {
    startIndex: lineStart + 1,
    endIndex: lineEnd + 1,
    text: fullText.substring(lineStart, lineEnd)
  };
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
  const todoMatches = text.match(/\[ \] /g);
  const doneMatches = text.match(/\[x\] /g);
  const skipMatches = text.match(/\[SKIPPED\]/g);
  return {
    todo: todoMatches ? todoMatches.length : 0,
    done: doneMatches ? doneMatches.length : 0,
    skipped: skipMatches ? skipMatches.length : 0
  };
}

async function markTaskDone(docId, taskText) {
  console.log('[AgentOS] markTaskDone:', taskText);
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric'
  });
  const doneEntry = '[x] ' + taskText + ' (' + timestamp + ')';

  // Strategy: use replaceAllText to handle the TODO->DONE move
  // Step 1: Replace "[ ] taskText" with nothing (delete from TODO)
  // Step 2: Insert into DONE section
  try {
    // First try exact replaceAllText to remove from TODO
    await batchUpdateDoc(docId, [{
      replaceAllText: {
        containsText: { text: '[ ] ' + taskText + '\n', matchCase: false },
        replaceText: ''
      }
    }]);
  } catch (e) {
    // If that fails, try without newline
    try {
      await batchUpdateDoc(docId, [{
        replaceAllText: {
          containsText: { text: '[ ] ' + taskText, matchCase: false },
          replaceText: ''
        }
      }]);
    } catch (e2) {
      console.error('[AgentOS] Could not remove TODO item:', e2.message);
    }
  }

  // Step 2: Insert into DONE section
  try {
    const doc = await readDocRaw(docId);
    const doneInsert = findSectionInsertPoint(doc, '== DONE ==');
    if (doneInsert) {
      await batchUpdateDoc(docId, [{
        insertText: {
          location: { index: doneInsert },
          text: doneEntry + '\n'
        }
      }]);
    } else {
      // Fallback: append to end
      const fullText = getFullText(doc);
      const endIdx = doc.body.content[doc.body.content.length - 1].endIndex - 1;
      await batchUpdateDoc(docId, [{
        insertText: {
          location: { index: endIdx },
          text: '\n' + doneEntry
        }
      }]);
    }
  } catch (e) {
    console.error('[AgentOS] Could not insert DONE entry:', e.message);
  }

  await updateDocStatus(docId);
  return true;
}

async function markTaskSkipped(docId, taskText, reason) {
  console.log('[AgentOS] markTaskSkipped:', taskText, reason);
  const timestamp = new Date().toLocaleDateString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric'
  });
  const skipEntry = '[SKIPPED] ' + taskText + ' | ' + reason + ' (' + timestamp + ')';

  try {
    await batchUpdateDoc(docId, [{
      replaceAllText: {
        containsText: { text: '[ ] ' + taskText + '\n', matchCase: false },
        replaceText: ''
      }
    }]);
  } catch (e) {
    try {
      await batchUpdateDoc(docId, [{
        replaceAllText: {
          containsText: { text: '[ ] ' + taskText, matchCase: false },
          replaceText: ''
        }
      }]);
    } catch (e2) {
      console.error('[AgentOS] Could not remove TODO item:', e2.message);
    }
  }

  try {
    const doc = await readDocRaw(docId);
    const doneInsert = findSectionInsertPoint(doc, '== DONE ==');
    if (doneInsert) {
      await batchUpdateDoc(docId, [{
        insertText: {
          location: { index: doneInsert },
          text: skipEntry + '\n'
        }
      }]);
    }
  } catch (e) {
    console.error('[AgentOS] Could not insert SKIP entry:', e.message);
  }

  await updateDocStatus(docId);
  return true;
}

async function addTask(docId, taskText) {
  console.log('[AgentOS] addTask:', taskText);
  const doc = await readDocRaw(docId);
  const insertPoint = findSectionInsertPoint(doc, '== TODO ==');
  if (insertPoint) {
    await batchUpdateDoc(docId, [{
      insertText: {
        location: { index: insertPoint },
        text: '[ ] ' + taskText + '\n'
      }
    }]);
  } else {
    await batchUpdateDoc(docId, [{
      replaceAllText: {
        containsText: { text: '== TODO ==', matchCase: true },
        replaceText: '== TODO ==\n[ ] ' + taskText
      }
    }]);
  }
  return true;
}

async function updateDocStatus(docId) {
  try {
    const text = await readDoc(docId);
    const counts = countTasks(text);
    const total = counts.todo + counts.done + counts.skipped;
    let statusText = '';
    if (counts.todo === 0 && total > 0) {
      statusText = 'ALL TASKS COMPLETE | ' + counts.done + ' done, ' + counts.skipped + ' skipped';
    } else {
      statusText = counts.done + '/' + total + ' done, ' + counts.todo + ' remaining';
      if (counts.skipped > 0) statusText += ', ' + counts.skipped + ' skipped';
    }
    const doc = await readDocRaw(docId);
    const fullText = getFullText(doc);
    const statusIdx = fullText.indexOf('== STATUS ==');
    if (statusIdx !== -1) {
      let afterHeader = statusIdx + '== STATUS =='.length;
      while (afterHeader < fullText.length && fullText[afterHeader] === '\n') afterHeader++;
      let lineEnd = afterHeader;
      while (lineEnd < fullText.length && fullText[lineEnd] !== '\n') lineEnd++;
      const oldStatus = fullText.substring(afterHeader, lineEnd);
      if (oldStatus.trim()) {
        await batchUpdateDoc(docId, [{
          replaceAllText: {
            containsText: { text: oldStatus.trim(), matchCase: false },
            replaceText: statusText
          }
        }]);
      }
    }
  } catch (e) {
    console.error('[AgentOS] updateDocStatus error:', e.message);
  }
}

async function getTaskCounts(docId) {
  const text = await readDoc(docId);
  return countTasks(text);
}

// ===========================================
// INSTALL HANDLER
// ===========================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AgentOS] Extension installed/updated:', details.reason);
  if (details.reason === 'update') {
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
          sendResponse({ success: true });
          break;

        case 'setDocId':
          chrome.storage.local.set({ docId: msg.docId });
          sendResponse({ success: true });
          break;

        case 'getStatus':
          const statusToken = await getStoredToken();
          const statusData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          sendResponse({ loggedIn: !!statusToken, docId: statusData.docId || null });
          break;

        case 'readDoc':
          const docData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const rdDocId = docData.docId || msg.docId;
          const rdText = await readDoc(rdDocId);
          sendResponse({ success: true, text: rdText });
          break;

        case 'taskDone':
          const doneData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await markTaskDone(doneData.docId, msg.taskText);
          const doneCounts = await getTaskCounts(doneData.docId);
          sendResponse({ success: true, counts: doneCounts });
          break;

        case 'taskSkip':
          const skipData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await markTaskSkipped(skipData.docId, msg.taskText, msg.reason || 'no reason');
          const skipCounts = await getTaskCounts(skipData.docId);
          sendResponse({ success: true, counts: skipCounts });
          break;

        case 'addTask':
          const addData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          await addTask(addData.docId, msg.taskText);
          sendResponse({ success: true });
          break;

        case 'appendToDoc':
          const appData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const appDoc = await readDocRaw(appData.docId);
          const endIdx = appDoc.body.content[appDoc.body.content.length - 1].endIndex - 1;
          await batchUpdateDoc(appData.docId, [{
            insertText: { location: { index: endIdx }, text: msg.text }
          }]);
          sendResponse({ success: true });
          break;

        case 'getTaskCounts':
          const cData = await new Promise(r => chrome.storage.local.get(['docId'], r));
          const cts = await getTaskCounts(cData.docId);
          sendResponse({ success: true, counts: cts });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[AgentOS] Error:', err.message);
      sendResponse({ error: err.message });
    }
  })();
  return true;
});
