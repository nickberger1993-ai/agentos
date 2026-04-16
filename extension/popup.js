// ============================================================
// AgentOS v4.3 - POPUP LOGIC (fixed message contracts)
// One-click Connect Google flow + Session management
// FIXES: getStatus->getState, connectGoogle->connect,
//   startSession response handling, injectPrompt payload key
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const setupView = document.getElementById('setupView');
  const mainView = document.getElementById('mainView');
  const btnConnect = document.getElementById('btnConnect');
  const statusText = document.getElementById('statusText');
  const btnStartSession = document.getElementById('btnStartSession');
  const btnEndSession = document.getElementById('btnEndSession');
  const btnReadDoc = document.getElementById('btnReadDoc');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const sessionDot = document.getElementById('sessionDot');
  const sessionStatus = document.getElementById('sessionStatus');
  const sessionTimer = document.getElementById('sessionTimer');
  const linkDoc = document.getElementById('linkDoc');
  const linkSheet = document.getElementById('linkSheet');
  const dotCal = document.getElementById('dotCal');
  const dotGmail = document.getElementById('dotGmail');
  const calStatus = document.getElementById('calStatus');
  const gmailStatus = document.getElementById('gmailStatus');
  let sessionActive = false;
  let sessionStart = null;
  let timerInterval = null;

  // ---- CHECK STATUS ON LOAD (FIX: getState not getStatus) ----
  chrome.runtime.sendMessage({ type: 'getState' }, data => {
    if (data && data.connected) {
      showMainView(data);
    } else {
      showSetupView();
    }
  });

  // ---- CONNECT GOOGLE (FIX: connect not connectGoogle) ----
  btnConnect.addEventListener('click', () => {
    btnConnect.disabled = true;
    btnConnect.textContent = 'Connecting...';
    statusText.textContent = 'Requesting Google permissions...';
    chrome.runtime.sendMessage({ type: 'connect' }, response => {
      if (response && response.success) {
        statusText.textContent = 'Connected! Doc + Sheet ready.';
        chrome.runtime.sendMessage({ type: 'getState' }, data => {
          setTimeout(() => showMainView(data), 1000);
        });
      } else {
        statusText.textContent = 'Error: ' + (response?.error || 'Connection failed');
        btnConnect.disabled = false;
        btnConnect.textContent = 'Connect Google';
      }
    });
  });

  // ---- SHOW VIEWS ----
  function showSetupView() {
    setupView.classList.add('active');
    mainView.classList.remove('active');
  }

  function showMainView(data) {
    setupView.classList.remove('active');
    mainView.classList.add('active');
    if (data && data.docId) {
      linkDoc.href = 'https://docs.google.com/document/d/' + data.docId;
      linkDoc.textContent = 'Open';
    }
    if (data && data.sheetId) {
      linkSheet.href = 'https://docs.google.com/spreadsheets/d/' + data.sheetId;
      linkSheet.textContent = 'Open';
    }
    loadStats();
  }

  // ---- SESSION MANAGEMENT (FIX: response handling) ----
  btnStartSession.addEventListener('click', () => {
    btnStartSession.disabled = true;
    btnStartSession.textContent = 'Starting...';
    // FIX: startSession returns {sessionId}, not {success, prompt}
    chrome.runtime.sendMessage({ type: 'startSession' }, response => {
      if (response && response.sessionId) {
        sessionActive = true;
        sessionStart = Date.now();
        sessionDot.classList.remove('dot-red');
        sessionDot.classList.add('dot-green', 'session-active');
        sessionStatus.textContent = 'Session active';
        btnStartSession.style.display = 'none';
        btnEndSession.style.display = 'block';
        timerInterval = setInterval(updateTimer, 1000);
        // Tell content script to start its session (it handles buildContext itself)
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'startSession', sessionId: response.sessionId });
          }
        });
      } else {
        btnStartSession.disabled = false;
        btnStartSession.textContent = 'Start Session';
      }
    });
  });

  btnEndSession.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'endSession', summary: 'Ended by user from popup' }, () => {
      sessionActive = false;
      sessionDot.classList.remove('dot-green', 'session-active');
      sessionDot.classList.add('dot-red');
      sessionStatus.textContent = 'No active session';
      btnEndSession.style.display = 'none';
      btnStartSession.style.display = 'block';
      btnStartSession.disabled = false;
      btnStartSession.textContent = 'Start Session';
      if (timerInterval) clearInterval(timerInterval);
      sessionTimer.textContent = '00:00';
      loadStats();
    });
  });

  // ---- READ MEMORY ----
  btnReadDoc.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'buildContext' }, response => {
      if (response && response.success && response.context) {
        // FIX: injectPrompt uses text field (matches content.js msg.text)
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'injectPrompt',
              text: response.context.soul || '(empty)'
            });
          }
        });
      }
    });
  });

  // ---- RESET AGENT ----
  btnDisconnect.addEventListener('click', () => {
    if (confirm('This will reset your agent. Your Doc and Sheet will remain in Google Drive. Continue?')) {
      chrome.runtime.sendMessage({ type: 'resetAgent' }, () => {
        showSetupView();
      });
    }
  });

  // ---- HELPERS ----
  function updateTimer() {
    if (!sessionStart) return;
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    sessionTimer.textContent = mins + ':' + secs;
  }

  function loadStats() {
    chrome.runtime.sendMessage({ type: 'sheetRead', range: 'Sessions!A:A' }, r => {
      if (r && r.data && r.data.values) {
        const el = document.getElementById('statSessions');
        if (el) el.textContent = Math.max(0, r.data.values.length - 1);
      }
    });
    chrome.runtime.sendMessage({ type: 'sheetRead', range: 'Skills!A:A' }, r => {
      if (r && r.data && r.data.values) {
        const el = document.getElementById('statSkills');
        if (el) el.textContent = Math.max(0, r.data.values.length - 1);
      }
    });
    chrome.runtime.sendMessage({ type: 'sheetRead', range: 'Agents!A:A' }, r => {
      if (r && r.data && r.data.values) {
        const el = document.getElementById('statAgents');
        if (el) el.textContent = Math.max(0, r.data.values.length - 1);
      }
    });
  }
});

