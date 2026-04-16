// ============================================================
// AgentOS v4.0 - POPUP LOGIC
// One-click Connect Google flow + Session management
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Elements
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

  // ---- CHECK STATUS ON LOAD ----
  chrome.runtime.sendMessage({ type: 'getStatus' }, data => {
    if (data && data.provisioned) {
      showMainView(data);
    } else {
      showSetupView();
    }
  });

  // ---- CONNECT GOOGLE (ONE CLICK) ----
  btnConnect.addEventListener('click', () => {
    btnConnect.disabled = true;
    btnConnect.textContent = 'Connecting...';
    statusText.textContent = 'Requesting Google permissions...';

    chrome.runtime.sendMessage({ type: 'connectGoogle' }, response => {
      if (response && response.success) {
        if (response.alreadyProvisioned) {
          statusText.textContent = 'Already connected! Loading...';
        } else {
          statusText.textContent = 'Created Doc + Sheet + Calendar + Gmail label!';
        }
        // Re-fetch full status and show main view
        chrome.runtime.sendMessage({ type: 'getStatus' }, data => {
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

    // Set links
    if (data.docUrl) { linkDoc.href = data.docUrl; linkDoc.textContent = 'Open'; }
    if (data.sheetUrl) { linkSheet.href = data.sheetUrl; linkSheet.textContent = 'Open'; }

    // Calendar status
    if (data.calendarId) {
      dotCal.classList.remove('dot-yellow'); dotCal.classList.add('dot-green');
      calStatus.textContent = 'Active';
    } else { calStatus.textContent = 'Not connected'; }

    // Gmail status
    if (data.gmailLabelId) {
      dotGmail.classList.remove('dot-yellow'); dotGmail.classList.add('dot-green');
      gmailStatus.textContent = 'Active';
    } else { gmailStatus.textContent = 'Not connected'; }

    // Load stats
    loadStats();
  }

  // ---- SESSION MANAGEMENT ----
  btnStartSession.addEventListener('click', () => {
    btnStartSession.disabled = true;
    btnStartSession.textContent = 'Starting...';

    chrome.runtime.sendMessage({ type: 'startSession' }, response => {
      if (response && response.success) {
        sessionActive = true;
        sessionStart = Date.now();
        sessionDot.classList.remove('dot-red'); sessionDot.classList.add('dot-green');
        sessionDot.classList.add('session-active');
        sessionStatus.textContent = 'Session active';
        btnStartSession.style.display = 'none';
        btnEndSession.style.display = 'block';

        // Start timer
        timerInterval = setInterval(updateTimer, 1000);

        // Send prompt to content script
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'injectPrompt',
              prompt: response.prompt
            });
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
      sessionDot.classList.remove('dot-green', 'session-active'); sessionDot.classList.add('dot-red');
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
    chrome.runtime.sendMessage({ type: 'readDoc' }, response => {
      if (response && response.text) {
        // Send to active tab as a message
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'injectPrompt', prompt: response.text });
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
    // Load session count
    chrome.runtime.sendMessage({ type: 'readSheet', range: 'Sessions!A:A' }, r => {
      if (r && r.values) document.getElementById('statSessions').textContent = Math.max(0, r.values.length - 1);
    });
    // Load skills count
    chrome.runtime.sendMessage({ type: 'readSheet', range: 'Skills!A:A' }, r => {
      if (r && r.values) document.getElementById('statSkills').textContent = Math.max(0, r.values.length - 1);
    });
    // Load agents count
    chrome.runtime.sendMessage({ type: 'readSheet', range: 'Agents!A:A' }, r => {
      if (r && r.values) document.getElementById('statAgents').textContent = Math.max(0, r.values.length - 1);
    });
  }
});
