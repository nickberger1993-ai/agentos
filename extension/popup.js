// ============================================================
// AgentOS v4.3 - POPUP LOGIC (aligned with popup.html v3 IDs)
// Uses background message contract:
//   connect, getState, buildContext, startSession, endSession, sheetRead
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const connStatus       = document.getElementById('connStatus');
  const docIdDisplay     = document.getElementById('docIdDisplay');
  const sheetIdDisplay   = document.getElementById('sheetIdDisplay');

  const connectBtn       = document.getElementById('connectBtn');
  const connectSheetBtn  = document.getElementById('connectSheetBtn');
  const docUrlInput      = document.getElementById('docUrlInput');
  const sheetUrlInput    = document.getElementById('sheetUrlInput');
  const connectSection   = document.getElementById('connectSection');

  const readDocBtn       = document.getElementById('readDocBtn');
  const actionsSection   = document.getElementById('actionsSection');
  const disconnectBtn    = document.getElementById('disconnectBtn');

  const sessionBtn       = document.getElementById('sessionBtn');
  const sessionIndicator = document.getElementById('sessionIndicator');
  const sessionDot       = document.getElementById('sessionDot');
  const sessionStatusText= document.getElementById('sessionStatusText');
  const sessionStats     = document.getElementById('sessionStats');
  const statActions      = document.getElementById('statActions');
  const statDuration     = document.getElementById('statDuration');
  const statSession      = document.getElementById('statSession');

  const todoList         = document.getElementById('todoList');
  const doneList         = document.getElementById('doneList');

  let sessionActive   = false;
  let currentSessionId= null;
  let sessionStart    = null;
  let timerInterval   = null;
  let actionCount     = 0;

  chrome.runtime.sendMessage({ type: 'getState' }, data => {
    if (chrome.runtime.lastError || !data) {
      setText(connStatus, 'Error', 'none');
      return;
    }
    renderState(data);
  });

  function renderState(data) {
    if (data.connected) {
      setText(connStatus, 'Connected', 'connected');
      setText(docIdDisplay, shorten(data.docId), '');
      setText(sheetIdDisplay, shorten(data.sheetId), '');
      if (connectSection) connectSection.style.display = 'none';
      if (actionsSection) actionsSection.style.display = 'block';
    } else {
      setText(connStatus, 'Not Connected', 'none');
      setText(docIdDisplay, '---', 'none');
      setText(sheetIdDisplay, '---', 'none');
      if (connectSection) connectSection.style.display = 'block';
      if (actionsSection) actionsSection.style.display = 'none';
    }
    if (data.sessionActive) { sessionActive = true;  showSessionRunning(); }
    else                    { sessionActive = false; showSessionIdle();    }
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      connectBtn.disabled = true;
      const oldText = connectBtn.textContent;
      connectBtn.textContent = 'Connecting...';
      setText(connStatus, 'Requesting Google permissions...', '');
      chrome.runtime.sendMessage({ type: 'connect' }, response => {
        connectBtn.disabled = false;
        connectBtn.textContent = oldText;
        if (chrome.runtime.lastError) {
          setText(connStatus, 'Error: ' + chrome.runtime.lastError.message, 'none');
          return;
        }
        if (response && (response.success || response.connected || response.docId)) {
          chrome.runtime.sendMessage({ type: 'getState' }, data => {
            if (data) renderState(data);
          });
        } else {
          const err = (response && response.error) ? response.error : 'Connection failed';
          setText(connStatus, 'Error: ' + err, 'none');
        }
      });
    });
  }

  if (connectSheetBtn) {
    connectSheetBtn.addEventListener('click', () => {
      if (connectBtn) connectBtn.click();
    });
  }

  if (sessionBtn) {
    sessionBtn.addEventListener('click', () => {
      if (sessionActive) endSession();
      else               startSession();
    });
  }

  function startSession() {
    sessionBtn.disabled = true;
    sessionBtn.textContent = 'Starting...';
    chrome.runtime.sendMessage({ type: 'startSession' }, response => {
      sessionBtn.disabled = false;
      if (chrome.runtime.lastError || !response || !response.sessionId) {
        sessionBtn.textContent = 'Start Session';
        return;
      }
      sessionActive = true;
      currentSessionId = response.sessionId;
      sessionStart = Date.now();
      actionCount = 0;
      showSessionRunning();
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id,
            { type: 'startSession', sessionId: response.sessionId },
            () => { void chrome.runtime.lastError; });
        }
      });
    });
  }

  function endSession() {
    chrome.runtime.sendMessage({ type: 'endSession', summary: 'Ended by user from popup' }, () => {
      sessionActive = false;
      currentSessionId = null;
      showSessionIdle();
      loadStats();
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'endSession' },
            () => { void chrome.runtime.lastError; });
        }
      });
    });
  }

  function showSessionRunning() {
    if (sessionIndicator) { sessionIndicator.classList.remove('idle'); sessionIndicator.classList.add('running'); }
    if (sessionDot) sessionDot.classList.add('running');
    if (sessionStatusText) sessionStatusText.textContent = 'Session active';
    if (sessionBtn) { sessionBtn.textContent = 'End Session'; sessionBtn.classList.add('active'); }
    if (sessionStats) sessionStats.style.display = 'grid';
    if (!sessionStart) sessionStart = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
    if (statSession && currentSessionId) statSession.textContent = String(currentSessionId).slice(-6);
  }

  function showSessionIdle() {
    if (sessionIndicator) { sessionIndicator.classList.remove('running'); sessionIndicator.classList.add('idle'); }
    if (sessionDot) sessionDot.classList.remove('running');
    if (sessionStatusText) sessionStatusText.textContent = 'No active session';
    if (sessionBtn) { sessionBtn.textContent = 'Start Session'; sessionBtn.classList.remove('active'); }
    if (sessionStats) sessionStats.style.display = 'none';
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    sessionStart = null;
  }

  function updateTimer() {
    if (!sessionStart || !statDuration) return;
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    if (s < 60)        statDuration.textContent = s + 's';
    else if (s < 3600) statDuration.textContent = Math.floor(s/60) + 'm ' + (s%60) + 's';
    else               statDuration.textContent = Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
    if (statActions) statActions.textContent = actionCount;
  }

  if (readDocBtn) {
    readDocBtn.addEventListener('click', () => {
      readDocBtn.disabled = true;
      const oldText = readDocBtn.textContent;
      readDocBtn.textContent = 'Loading...';
      chrome.runtime.sendMessage({ type: 'buildContext' }, response => {
        readDocBtn.disabled = false;
        readDocBtn.textContent = oldText;
        if (chrome.runtime.lastError || !response || !response.success) return;
        const ctx = response.context || {};
        const text = ctx.soul || '(empty)';
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id,
              { type: 'injectPrompt', text: text },
              () => { void chrome.runtime.lastError; });
          }
        });
      });
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!confirm('Disconnect from Google? Your Doc and Sheet stay intact.')) return;
      chrome.storage.local.clear(() => {
        setText(connStatus, 'Disconnected', 'none');
        setText(docIdDisplay, '---', 'none');
        setText(sheetIdDisplay, '---', 'none');
        if (connectSection) connectSection.style.display = 'block';
        if (actionsSection) actionsSection.style.display = 'none';
        showSessionIdle();
      });
    });
  }

  function loadTodos() {
    chrome.runtime.sendMessage({ type: 'buildContext' }, response => {
      if (chrome.runtime.lastError || !response || !response.success) return;
      const ctx = response.context || {};
      const soul = ctx.soul || '';
      const todos = extractSection(soul, 'TODO');
      const dones = extractSection(soul, 'DONE');
      renderList(todoList, todos, 'No open tasks');
      renderList(doneList, dones, 'No completed tasks yet');
    });
  }

  function extractSection(soul, name) {
    const re = new RegExp('==\\s*' + name + '\\s*==\\s*([\\s\\S]*?)(?:==\\s*[A-Z][^=]*==|$)');
    const m = soul.match(re);
    if (!m) return [];
    return m[1].split('\n').map(l => l.trim())
      .filter(l => l.length > 0 && !/^==/.test(l)).slice(0, 15);
  }

  function renderList(container, items, emptyMsg) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="task-item" style="color:#666">' + emptyMsg + '</div>';
      return;
    }
    container.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'task-item';
      div.textContent = item.length > 80 ? item.slice(0, 80) + '…' : item;
      container.appendChild(div);
    });
  }

  function loadStats() {
    chrome.runtime.sendMessage({ type: 'sheetRead', range: 'Sessions!A:A' }, r => {
      if (chrome.runtime.lastError || !r) return;
      const values = (r && r.data && r.data.values) || (r && r.values) || null;
      if (values && statActions && !sessionActive) {
        statActions.textContent = Math.max(0, values.length - 1);
      }
    });
  }

  function setText(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('connected', 'none');
    if (cls) el.classList.add(cls);
  }

  function shorten(id) {
    if (!id) return '---';
    if (id.length <= 10) return id;
    return id.slice(0, 6) + '…' + id.slice(-4);
  }

  setTimeout(loadTodos, 300);
});
