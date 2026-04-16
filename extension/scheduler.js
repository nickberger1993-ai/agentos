// ============================================================
// AgentOS v4.0 — SCHEDULER SYSTEM (scheduler.js)
// Google Calendar as task scheduler
// Agent creates, reads, and executes scheduled tasks
// ============================================================

const SchedulerManager = {
  CALENDAR_NAME: 'AgentOS Tasks',
  calendarId: null,
  checkInterval: null,
  POLL_INTERVAL_MS: 60000, // Check every 60 seconds

  // --------------------------------------------------------
  // INIT: Find or create the AgentOS calendar
  // --------------------------------------------------------
  async init(token) {
    try {
      // List calendars to find ours
      const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const list = await listRes.json();
      const existing = list.items?.find(c => c.summary === this.CALENDAR_NAME);

      if (existing) {
        this.calendarId = existing.id;
      } else {
        // Create new calendar
        const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: this.CALENDAR_NAME,
            description: 'Scheduled tasks for AgentOS autonomous agent',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        });
        const cal = await createRes.json();
        this.calendarId = cal.id;
      }

      console.log('[Scheduler] Initialized, calendar:', this.calendarId);
      return { success: true, calendarId: this.calendarId };
    } catch (err) {
      console.error('[Scheduler] Init error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // SCHEDULE TASK: Create a calendar event as a scheduled task
  // --------------------------------------------------------
  async scheduleTask(task, token) {
    try {
      if (!this.calendarId) await this.init(token);

      const { title, description, startTime, endTime, recurrence, priority } = task;

      const event = {
        summary: `[AgentOS] ${title}`,
        description: JSON.stringify({
          type: 'agent_task',
          task: description || title,
          priority: priority || 'normal',
          status: 'pending',
          created: new Date().toISOString()
        }),
        start: {
          dateTime: startTime || new Date(Date.now() + 3600000).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endTime || new Date(Date.now() + 7200000).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        colorId: priority === 'high' ? '11' : priority === 'low' ? '7' : '9',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 5 }] }
      };

      // Add recurrence if specified (daily, weekly, monthly)
      if (recurrence) {
        const rules = {
          'daily': 'RRULE:FREQ=DAILY',
          'weekly': 'RRULE:FREQ=WEEKLY',
          'monthly': 'RRULE:FREQ=MONTHLY',
          'weekdays': 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
          'hourly': 'RRULE:FREQ=HOURLY;INTERVAL=1'
        };
        if (rules[recurrence]) event.recurrence = [rules[recurrence]];
      }

      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      const created = await res.json();

      console.log(`[Scheduler] Task scheduled: ${title} at ${startTime}`);
      return { success: true, eventId: created.id, title };
    } catch (err) {
      console.error('[Scheduler] Schedule error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // CHECK DUE: Get tasks that are due now (within 5 min window)
  // --------------------------------------------------------
  async checkDueTasks(token) {
    try {
      if (!this.calendarId) await this.init(token);

      const now = new Date();
      const windowStart = new Date(now.getTime() - 300000); // 5 min ago
      const windowEnd = new Date(now.getTime() + 300000);   // 5 min from now

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?timeMin=${windowStart.toISOString()}&timeMax=${windowEnd.toISOString()}&singleEvents=true&orderBy=startTime`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();

      const dueTasks = [];
      for (const event of (data.items || [])) {
        if (!event.summary?.startsWith('[AgentOS]')) continue;
        try {
          const meta = JSON.parse(event.description || '{}');
          if (meta.status === 'pending') {
            dueTasks.push({
              eventId: event.id,
              title: event.summary.replace('[AgentOS] ', ''),
              task: meta.task,
              priority: meta.priority,
              scheduledTime: event.start.dateTime,
              meta
            });
          }
        } catch (e) {
          // Not a valid agent task, skip
        }
      }

      return dueTasks;
    } catch (err) {
      console.error('[Scheduler] Check due error:', err);
      return [];
    }
  },

  // --------------------------------------------------------
  // MARK COMPLETE: Update event to show task was executed
  // --------------------------------------------------------
  async markComplete(eventId, result, token) {
    try {
      if (!this.calendarId) await this.init(token);

      // Get current event
      const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const event = await getRes.json();

      // Update description with completion info
      let meta = {};
      try { meta = JSON.parse(event.description || '{}'); } catch(e) {}
      meta.status = 'completed';
      meta.completedAt = new Date().toISOString();
      meta.result = result || 'Done';

      event.description = JSON.stringify(meta);
      event.summary = event.summary.replace('[AgentOS]', '[DONE]');
      event.colorId = '2'; // Green

      await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });

      console.log(`[Scheduler] Marked complete: ${eventId}`);
      return { success: true };
    } catch (err) {
      console.error('[Scheduler] Mark complete error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // LIST UPCOMING: Get all upcoming scheduled tasks
  // --------------------------------------------------------
  async listUpcoming(token, maxResults = 20) {
    try {
      if (!this.calendarId) await this.init(token);

      const now = new Date().toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?timeMin=${now}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();

      return (data.items || [])
        .filter(e => e.summary?.startsWith('[AgentOS]'))
        .map(e => {
          let meta = {};
          try { meta = JSON.parse(e.description || '{}'); } catch(ex) {}
          return {
            eventId: e.id,
            title: e.summary.replace('[AgentOS] ', ''),
            task: meta.task,
            priority: meta.priority,
            status: meta.status,
            scheduledTime: e.start?.dateTime || e.start?.date,
            recurrence: e.recurrence
          };
        });
    } catch (err) {
      console.error('[Scheduler] List upcoming error:', err);
      return [];
    }
  },

  // --------------------------------------------------------
  // DELETE TASK: Cancel a scheduled task
  // --------------------------------------------------------
  async deleteTask(eventId, token) {
    try {
      if (!this.calendarId) await this.init(token);
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`[Scheduler] Deleted task: ${eventId}`);
      return { success: true };
    } catch (err) {
      console.error('[Scheduler] Delete error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // START POLLING: Check for due tasks every minute
  // --------------------------------------------------------
  startPolling(token, onTaskDue) {
    if (this.checkInterval) clearInterval(this.checkInterval);

    this.checkInterval = setInterval(async () => {
      const dueTasks = await this.checkDueTasks(token);
      for (const task of dueTasks) {
        console.log(`[Scheduler] Task due: ${task.title}`);
        if (onTaskDue) onTaskDue(task);
      }
    }, this.POLL_INTERVAL_MS);

    console.log('[Scheduler] Polling started (every 60s)');
    return { success: true };
  },

  // --------------------------------------------------------
  // STOP POLLING
  // --------------------------------------------------------
  stopPolling() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[Scheduler] Polling stopped');
  },

  // --------------------------------------------------------
  // CRON-STYLE: Parse natural language schedule
  // "every day at 9am", "every monday", "every hour"
  // --------------------------------------------------------
  parseSchedule(text) {
    const lower = text.toLowerCase();
    const result = { recurrence: null, startTime: null };
    const now = new Date();

    // Time extraction
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || '0');
      if (timeMatch[3] === 'pm' && hours < 12) hours += 12;
      if (timeMatch[3] === 'am' && hours === 12) hours = 0;
      now.setHours(hours, minutes, 0, 0);
      if (now < new Date()) now.setDate(now.getDate() + 1);
      result.startTime = now.toISOString();
    }

    // Recurrence extraction
    if (lower.includes('every day') || lower.includes('daily')) result.recurrence = 'daily';
    else if (lower.includes('every week') || lower.includes('weekly')) result.recurrence = 'weekly';
    else if (lower.includes('every month') || lower.includes('monthly')) result.recurrence = 'monthly';
    else if (lower.includes('weekday')) result.recurrence = 'weekdays';
    else if (lower.includes('every hour') || lower.includes('hourly')) result.recurrence = 'hourly';

    // Tomorrow
    if (lower.includes('tomorrow')) {
      const tmrw = new Date(now);
      tmrw.setDate(tmrw.getDate() + 1);
      result.startTime = tmrw.toISOString();
    }

    return result;
  },

  // --------------------------------------------------------
  // BUILD SCHEDULE CONTEXT: For session prompt
  // --------------------------------------------------------
  async getScheduleContext(token) {
    const upcoming = await this.listUpcoming(token, 5);
    if (upcoming.length === 0) return '';

    let block = '\n== SCHEDULED TASKS ==\n';
    for (const t of upcoming) {
      const time = new Date(t.scheduledTime).toLocaleString();
      block += `- [${t.priority || 'normal'}] ${t.title} @ ${time}`;
      if (t.recurrence) block += ' (recurring)';
      block += '\n';
    }
    block += 'Use [SCHEDULE_TASK|title|time|recurrence] to schedule new tasks.\n';
    return block;
  }
};

if (typeof module !== 'undefined') module.exports = SchedulerManager;
