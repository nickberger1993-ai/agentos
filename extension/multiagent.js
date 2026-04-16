// ============================================================
// AgentOS v4.0 — MULTI-AGENT SYSTEM (multiagent.js)
// Google Drive folders for agent teams
// Each agent = Google Doc (SOUL) + Google Sheet (DB)
// Agents communicate via shared Messages sheet tab
// ============================================================

const MultiAgentManager = {
  AGENTS_TAB: 'Agents',
  MESSAGES_TAB: 'Messages',
  teamFolderId: null,
  activeAgents: new Map(),

  // --------------------------------------------------------
  // INIT: Create Agents and Messages tabs in master sheet
  // --------------------------------------------------------
  async initMultiAgent(sheetId, token) {
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
      const metaRes = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const meta = await metaRes.json();
      const tabs = meta.sheets?.map(s => s.properties.title) || [];

      // Create Agents tab if missing
      if (!tabs.includes(this.AGENTS_TAB)) {
        await this.createSheetTab(sheetId, this.AGENTS_TAB, token);
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.AGENTS_TAB}!A1:I1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['Agent Name', 'Role', 'Doc ID', 'Sheet ID', 'Status', 'Created', 'Last Active', 'Task Count', 'Parent Agent']] })
        });
      }

      // Create Messages tab if missing
      if (!tabs.includes(this.MESSAGES_TAB)) {
        await this.createSheetTab(sheetId, this.MESSAGES_TAB, token);
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.MESSAGES_TAB}!A1:G1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['Timestamp', 'From Agent', 'To Agent', 'Type', 'Message', 'Status', 'Response']] })
        });
      }

      console.log('[MultiAgent] Initialized');
      return { success: true };
    } catch (err) {
      console.error('[MultiAgent] Init error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // SPAWN AGENT: Create a new sub-agent with its own Doc+Sheet
  // --------------------------------------------------------
  async spawnAgent(name, role, soulTemplate, parentAgent, token) {
    try {
      // 1. Create agent's SOUL document
      const docRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[AGENT] ${name} - ${role}` })
      });
      const doc = await docRes.json();
      const agentDocId = doc.documentId;

      // Write SOUL template
      const soul = soulTemplate || this.generateSoul(name, role);
      await fetch(`https://docs.googleapis.com/v1/documents/${agentDocId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: soul } }] })
      });

      // 2. Create agent's database sheet
      const sheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { title: `[AgentOS] ${name} DB` },
          sheets: [
            { properties: { title: 'Data' } },
            { properties: { title: 'Sessions' } },
            { properties: { title: 'Log' } }
          ]
        })
      });
      const sheet = await sheetRes.json();
      const agentSheetId = sheet.spreadsheetId;

      // 3. Register in master Agents tab
      const masterSheetId = await this.getMasterSheetId();
      if (masterSheetId) {
        const now = new Date().toISOString();
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${this.AGENTS_TAB}!A:I:append?valueInputOption=USER_ENTERED`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[name, role, agentDocId, agentSheetId, 'active', now, now, '0', parentAgent || 'root']] })
        });
      }

      // 4. Track in memory
      this.activeAgents.set(name.toLowerCase(), {
        name, role, docId: agentDocId, sheetId: agentSheetId,
        status: 'active', parent: parentAgent || 'root'
      });

      console.log(`[MultiAgent] Spawned: ${name} (${role})`);
      return { success: true, name, docId: agentDocId, sheetId: agentSheetId };
    } catch (err) {
      console.error('[MultiAgent] Spawn error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // GENERATE SOUL: Create a SOUL template for a sub-agent
  // --------------------------------------------------------
  generateSoul(name, role) {
    return [
      `== SOUL ==`,
      `You are ${name}, an AgentOS sub-agent.`,
      `Role: ${role}`,
      `You are part of a multi-agent team coordinated by a parent agent.`,
      '',
      '== CORE RULES ==',
      '1. Focus exclusively on your assigned role',
      '2. Report results back to your parent agent via [AGENT_MSG]',
      '3. Ask for help from sibling agents when stuck',
      '4. Log all actions to your session sheet',
      '5. When your task is complete, send [AGENT_DONE] to parent',
      '',
      '== AVAILABLE TAGS ==',
      '[SAVE_NOTE|text] - Save to your memory doc',
      '[SHEET_WRITE|range|data] - Write to your sheet',
      '[SHEET_READ|range] - Read from your sheet',
      '[TAB_OPEN|url] - Open a browser tab',
      '[TAB_SCRAPE|selector] - Scrape page content',
      '[AGENT_MSG|to|message] - Send message to another agent',
      '[AGENT_DONE|summary] - Report completion to parent',
      '[TASK_DONE] - Mark current task complete',
      '',
      '== TODO ==',
      '[ ] Awaiting assignment from parent agent',
      '',
      '== DONE ==',
      '',
      '== NOTES ==',
      ''
    ].join('\n');
  },

  // --------------------------------------------------------
  // SEND MESSAGE: Agent-to-agent communication via Messages sheet
  // --------------------------------------------------------
  async sendMessage(from, to, type, message, token) {
    try {
      const masterSheetId = await this.getMasterSheetId();
      if (!masterSheetId) return { success: false, error: 'No master sheet' };

      const now = new Date().toISOString();
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${this.MESSAGES_TAB}!A:G:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[now, from, to, type, message, 'pending', '']] })
      });

      console.log(`[MultiAgent] Message: ${from} -> ${to}: ${type}`);
      return { success: true };
    } catch (err) {
      console.error('[MultiAgent] Send message error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // CHECK MESSAGES: Get pending messages for an agent
  // --------------------------------------------------------
  async checkMessages(agentName, token) {
    try {
      const masterSheetId = await this.getMasterSheetId();
      if (!masterSheetId) return [];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${this.MESSAGES_TAB}!A:G`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const rows = data.values || [];

      const pending = [];
      for (let i = 1; i < rows.length; i++) {
        const [timestamp, from, to, type, message, status] = rows[i];
        if (to.toLowerCase() === agentName.toLowerCase() && status === 'pending') {
          pending.push({ row: i + 1, timestamp, from, type, message });
        }
      }
      return pending;
    } catch (err) {
      console.error('[MultiAgent] Check messages error:', err);
      return [];
    }
  },

  // --------------------------------------------------------
  // MARK READ: Mark a message as read/processed
  // --------------------------------------------------------
  async markMessageRead(row, response, token) {
    try {
      const masterSheetId = await this.getMasterSheetId();
      if (!masterSheetId) return;

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${this.MESSAGES_TAB}!F${row}:G${row}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [['read', response || '']] })
      });
    } catch (err) {
      console.error('[MultiAgent] Mark read error:', err);
    }
  },

  // --------------------------------------------------------
  // LIST AGENTS: Get all registered agents
  // --------------------------------------------------------
  async listAgents(token) {
    try {
      const masterSheetId = await this.getMasterSheetId();
      if (!masterSheetId) return [];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${this.AGENTS_TAB}!A:I`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const rows = data.values || [];

      if (rows.length <= 1) return [];
      return rows.slice(1).map((row, i) => ({
        name: row[0], role: row[1], docId: row[2], sheetId: row[3],
        status: row[4], created: row[5], lastActive: row[6],
        taskCount: parseInt(row[7]) || 0, parent: row[8], row: i + 2
      }));
    } catch (err) {
      console.error('[MultiAgent] List agents error:', err);
      return [];
    }
  },

  // --------------------------------------------------------
  // ASSIGN TASK: Send a task to a sub-agent
  // --------------------------------------------------------
  async assignTask(agentName, task, token) {
    // Write task to agent's TODO section in their Doc
    const agents = await this.listAgents(token);
    const agent = agents.find(a => a.name.toLowerCase() === agentName.toLowerCase());
    if (!agent) return { success: false, error: `Agent ${agentName} not found` };

    // Read agent's doc
    const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${agent.docId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const doc = await docRes.json();

    // Find TODO section and append task
    let todoIndex = -1;
    let text = '';
    for (const elem of doc.body.content) {
      if (elem.paragraph) {
        for (const el of elem.paragraph.elements) {
          if (el.textRun) {
            text += el.textRun.content;
            if (el.textRun.content.includes('== TODO ==')) {
              todoIndex = elem.endIndex - 1;
            }
          }
        }
      }
    }

    if (todoIndex > 0) {
      await fetch(`https://docs.googleapis.com/v1/documents/${agent.docId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: todoIndex }, text: `\n[ ] ${task}` } }] })
      });
    }

    // Also send as a message
    await this.sendMessage('coordinator', agentName, 'task', task, token);

    console.log(`[MultiAgent] Assigned to ${agentName}: ${task}`);
    return { success: true, agent: agentName, task };
  },

  // --------------------------------------------------------
  // DEACTIVATE: Set agent status to inactive
  // --------------------------------------------------------
  async deactivateAgent(agentName, token) {
    try {
      const agents = await this.listAgents(token);
      const agent = agents.find(a => a.name.toLowerCase() === agentName.toLowerCase());
      if (!agent) return { success: false, error: 'Agent not found' };

      const masterSheetId = await this.getMasterSheetId();
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterSheetId}/values/${this.AGENTS_TAB}!E${agent.row}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [['inactive']] })
      });

      this.activeAgents.delete(agentName.toLowerCase());
      console.log(`[MultiAgent] Deactivated: ${agentName}`);
      return { success: true };
    } catch (err) {
      console.error('[MultiAgent] Deactivate error:', err);
      return { success: false, error: err.message };
    }
  },

  // --------------------------------------------------------
  // GET TEAM CONTEXT: For session prompt building
  // --------------------------------------------------------
  async getTeamContext(token) {
    const agents = await this.listAgents(token);
    if (agents.length === 0) return '';

    let block = '\n== AGENT TEAM ==\n';
    for (const a of agents) {
      block += `- ${a.name} (${a.role}) [status: ${a.status}] tasks: ${a.taskCount}\n`;
    }
    block += '\nUse [SPAWN_AGENT|name|role] to create sub-agents.\n';
    block += 'Use [AGENT_MSG|name|message] to communicate.\n';
    block += 'Use [ASSIGN_TASK|name|task] to delegate work.\n';
    return block;
  },

  // --------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------
  async createSheetTab(sheetId, tabName, token) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] })
    });
  },

  async getMasterSheetId() {
    return new Promise(resolve => {
      chrome.storage.local.get(['sheetId'], result => { resolve(result.sheetId || null); });
    });
  }
};

if (typeof module !== 'undefined') module.exports = MultiAgentManager;
