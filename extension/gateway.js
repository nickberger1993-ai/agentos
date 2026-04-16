// ============================================================
// AgentOS v4.0 — MESSAGING GATEWAY (gateway.js)
// Gmail as messaging channel
// Receive tasks via email, send results back
// Agent works even through email - ultimate accessibility
// ============================================================

const GatewayManager = {
  LABEL_NAME: 'AgentOS',
  labelId: null,
  pollInterval: null,
  POLL_INTERVAL_MS: 120000, // Check every 2 minutes
  processedIds: new Set(),

  // --------------------------------------------------------
  // INIT: Find or create AgentOS Gmail label
  // --------------------------------------------------------
  async init(token) {
    try {
      // List labels to find ours
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const existing = data.labels?.find(l => l.name === this.LABEL_NAME);

      if (existing) {
        this.labelId = existing.id;
      } else {
        // Create label
        const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: this.LABEL_NAME,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
            color: { textColor: '#ffffff', backgroundColor: '#fb4c2f' }
          })
        });
        const label = await createRes.json();
        this.labelId = label.id;
      }

      console.log('[Gateway] Initialized, label:', this.labelId);
      return { success: true, labelId: this.labelId };
    } catch (err) {
      console.error('[Gateway] Init error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // CHECK INBOX: Poll for new emails with AgentOS subject prefix
  // --------------------------------------------------------
  async checkInbox(token) {
    try {
      // Search for unread emails to AgentOS
      const query = encodeURIComponent('subject:[AgentOS] is:unread');
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.messages || data.messages.length === 0) return [];

      const tasks = [];
      for (const msg of data.messages) {
        if (this.processedIds.has(msg.id)) continue;

        // Get full message
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const fullMsg = await msgRes.json();

        // Parse headers
        const headers = fullMsg.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // Get body
        let body = '';
        if (fullMsg.payload?.body?.data) {
          body = atob(fullMsg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (fullMsg.payload?.parts) {
          for (const part of fullMsg.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              break;
            }
          }
        }

        // Parse task from email
        const task = this.parseEmailTask(subject, body, from);
        if (task) {
          task.messageId = msg.id;
          task.date = date;
          tasks.push(task);
          this.processedIds.add(msg.id);
        }
      }

      return tasks;
    } catch (err) {
      console.error('[Gateway] Check inbox error:', err);
      return [];
    }
  },

  // --------------------------------------------------------
  // PARSE EMAIL TASK: Extract task info from email
  // --------------------------------------------------------
  parseEmailTask(subject, body, from) {
    // Expected format: [AgentOS] Task: Do something
    // Or: [AgentOS] Query: What is X?
    // Or: [AgentOS] Schedule: Do X at 9am daily
    const taskMatch = subject.match(/\[AgentOS\]\s*(\w+):\s*(.+)/i);
    if (!taskMatch) return null;

    const type = taskMatch[1].toLowerCase();
    const title = taskMatch[2].trim();

    return {
      type, // task, query, schedule, report, skill
      title,
      body: body.trim(),
      from,
      priority: body.toLowerCase().includes('urgent') ? 'high' : 'normal'
    };
  },

  // --------------------------------------------------------
  // SEND REPLY: Send result back via email
  // --------------------------------------------------------
  async sendReply(messageId, to, subject, body, token) {
    try {
      // Get original message for threading
      const origRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Message-ID`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const orig = await origRes.json();
      const origMsgId = orig.payload?.headers?.find(h => h.name === 'Message-ID')?.value || '';

      // Build email
      const email = [
        `To: ${to}`,
        `Subject: Re: ${subject}`,
        `In-Reply-To: ${origMsgId}`,
        `References: ${origMsgId}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ].join('\r\n');

      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodedEmail, threadId: orig.threadId })
      });

      // Mark original as read
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'], addLabelIds: [this.labelId] })
      });

      console.log(`[Gateway] Reply sent to ${to}`);
      return { success: true };
    } catch (err) {
      console.error('[Gateway] Send reply error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // SEND NOTIFICATION: Proactive email from agent
  // --------------------------------------------------------
  async sendNotification(to, subject, body, token) {
    try {
      const email = [
        `To: ${to}`,
        `Subject: [AgentOS] ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ].join('\r\n');

      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodedEmail })
      });

      console.log(`[Gateway] Notification sent to ${to}: ${subject}`);
      return { success: true };
    } catch (err) {
      console.error('[Gateway] Send notification error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // START POLLING: Check for new email tasks
  // --------------------------------------------------------
  startPolling(token, onEmailTask) {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      const tasks = await this.checkInbox(token);
      for (const task of tasks) {
        console.log(`[Gateway] Email task: ${task.type} - ${task.title}`);
        if (onEmailTask) onEmailTask(task);
      }
    }, this.POLL_INTERVAL_MS);

    console.log('[Gateway] Email polling started (every 2 min)');
    return { success: true };
  },

  // --------------------------------------------------------
  // STOP POLLING
  // --------------------------------------------------------
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Gateway] Email polling stopped');
  },

  // --------------------------------------------------------
  // SEND DAILY REPORT: Summary of agent activity
  // --------------------------------------------------------
  async sendDailyReport(to, report, token) {
    const subject = `Daily Report - ${new Date().toLocaleDateString()}`;
    const body = [
      'AgentOS Daily Activity Report',
      '================================',
      '',
      `Date: ${new Date().toLocaleDateString()}`,
      `Time: ${new Date().toLocaleTimeString()}`,
      '',
      'Tasks Completed:',
      report.tasksCompleted || 'None',
      '',
      'Skills Created:',
      report.skillsCreated || 'None',
      '',
      'Sessions Run:',
      report.sessionsRun || '0',
      '',
      'Upcoming Scheduled Tasks:',
      report.upcoming || 'None',
      '',
      '---',
      'Reply to this email with [AgentOS] Task: <your task> to assign new work.',
      'Sent by AgentOS - https://github.com/nickberger1993-ai/agentos'
    ].join('\n');

    return await this.sendNotification(to, subject, body, token);
  },

  // --------------------------------------------------------
  // GET GATEWAY STATUS: For popup display
  // --------------------------------------------------------
  getStatus() {
    return {
      active: !!this.pollInterval,
      labelId: this.labelId,
      processedCount: this.processedIds.size,
      pollInterval: this.POLL_INTERVAL_MS / 1000
    };
  }
};

if (typeof module !== 'undefined') module.exports = GatewayManager;
