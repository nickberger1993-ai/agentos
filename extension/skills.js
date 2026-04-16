// ============================================================
// AgentOS v4.0 — SKILLS SYSTEM (skills.js)
// Google Docs as skill storage, Google Sheets as skill index
// Agent learns, creates, recalls, and improves skills
// ============================================================

const SkillsManager = {
  SKILLS_TAB: 'Skills',
  skillsFolderId: null,
  skillCache: new Map(),

  // INIT: Create Skills tab in the connected sheet
  async initSkillsSheet(sheetId, token) {
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
      const metaRes = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      const meta = await metaRes.json();
      const exists = meta.sheets?.some(s => s.properties.title === this.SKILLS_TAB);
      if (!exists) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: this.SKILLS_TAB } } }] })
        });
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.SKILLS_TAB}!A1:H1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['Skill Name', 'Category', 'Doc ID', 'Created', 'Last Used', 'Use Count', 'Rating', 'Tags']] })
        });
      }
      console.log('[Skills] Skills sheet initialized');
      return true;
    } catch (err) { console.error('[Skills] Init error:', err); return false; }
  },

  // CREATE SKILL: Agent creates a new skill from experience
  async createSkill(name, category, content, tags, token) {
    try {
      const docRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[SKILL] ${name}` })
      });
      const doc = await docRes.json();
      const docId = doc.documentId;
      const skillDoc = this.formatSkillDoc(name, category, content, tags);
      await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: skillDoc } }] })
      });
      const sheetId = await this.getSheetId();
      if (sheetId) {
        const now = new Date().toISOString();
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.SKILLS_TAB}!A:H:append?valueInputOption=USER_ENTERED`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[name, category, docId, now, now, '1', '5', tags.join(', ')]] })
        });
      }
      this.skillCache.set(name.toLowerCase(), { name, category, docId, content, tags, useCount: 1, rating: 5 });
      console.log(`[Skills] Created: ${name} (doc: ${docId})`);
      return { success: true, docId, name };
    } catch (err) { console.error('[Skills] Create error:', err); return { success: false, error: err.message }; }
  },

  // FORMAT: Standard skill document structure
  formatSkillDoc(name, category, content, tags) {
    return [
      `== SKILL: ${name} ==`, `Category: ${category}`, `Tags: ${tags.join(', ')}`,
      `Created: ${new Date().toISOString()}`, 'Version: 1', '',
      '== DESCRIPTION ==', content.description || '', '',
      '== STEPS ==', content.steps || '', '',
      '== TRIGGERS ==', content.triggers || 'Manual invocation', '',
      '== INPUTS ==', content.inputs || 'None required', '',
      '== OUTPUTS ==', content.outputs || 'Task completion', '',
      '== EXAMPLES ==', content.examples || '', '',
      '== IMPROVEMENT LOG ==', `[${new Date().toISOString()}] Initial version created`, '',
      '== NOTES ==', ''
    ].join('\n');
  },

  // SEARCH: Find skills by name, category, or tags
  async searchSkills(query, token) {
    try {
      const sheetId = await this.getSheetId();
      if (!sheetId) return [];
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.SKILLS_TAB}!A:H`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const rows = data.values || [];
      if (rows.length <= 1) return [];
      const q = query.toLowerCase();
      const results = [];
      for (let i = 1; i < rows.length; i++) {
        const [name, category, docId, created, lastUsed, useCount, rating, tags] = rows[i];
        const searchText = `${name} ${category} ${tags}`.toLowerCase();
        if (searchText.includes(q)) {
          results.push({ name, category, docId, created, lastUsed, useCount: parseInt(useCount) || 0, rating: parseInt(rating) || 5, tags: tags ? tags.split(', ') : [], row: i + 1 });
        }
      }
      results.sort((a, b) => b.useCount - a.useCount);
      return results;
    } catch (err) { console.error('[Skills] Search error:', err); return []; }
  },

  // RECALL: Load full skill content from its Google Doc
  async recallSkill(docId, token) {
    try {
      for (const [key, skill] of this.skillCache) {
        if (skill.docId === docId) { skill.useCount++; return { success: true, content: skill.content, cached: true }; }
      }
      const url = `https://docs.googleapis.com/v1/documents/${docId}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const doc = await res.json();
      let text = '';
      if (doc.body && doc.body.content) {
        for (const elem of doc.body.content) {
          if (elem.paragraph) { for (const el of elem.paragraph.elements) { if (el.textRun) text += el.textRun.content; } }
        }
      }
      await this.updateSkillUsage(docId, token);
      return { success: true, content: text, cached: false };
    } catch (err) { console.error('[Skills] Recall error:', err); return { success: false, error: err.message }; }
  },

  // IMPROVE: Agent updates a skill based on new experience
  async improveSkill(docId, improvement, token) {
    try {
      const current = await this.recallSkill(docId, token);
      if (!current.success) return current;
      const logEntry = `\n[${new Date().toISOString()}] ${improvement}`;
      const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const doc = await docRes.json();
      const endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
      await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: endIndex }, text: logEntry } }] })
      });
      console.log(`[Skills] Improved: ${docId}`);
      return { success: true };
    } catch (err) { console.error('[Skills] Improve error:', err); return { success: false, error: err.message }; }
  },

  // LIST: Get all skills with metadata
  async listSkills(token) {
    try {
      const sheetId = await this.getSheetId();
      if (!sheetId) return [];
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.SKILLS_TAB}!A:H`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const rows = data.values || [];
      if (rows.length <= 1) return [];
      return rows.slice(1).map((row, i) => ({
        name: row[0], category: row[1], docId: row[2], created: row[3], lastUsed: row[4],
        useCount: parseInt(row[5]) || 0, rating: parseInt(row[6]) || 5,
        tags: row[7] ? row[7].split(', ') : [], row: i + 2
      }));
    } catch (err) { console.error('[Skills] List error:', err); return []; }
  },

  // UPDATE USAGE: Increment use count and last used date
  async updateSkillUsage(docId, token) {
    try {
      const sheetId = await this.getSheetId();
      if (!sheetId) return;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.SKILLS_TAB}!A:H`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const rows = data.values || [];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][2] === docId) {
          const newCount = (parseInt(rows[i][5]) || 0) + 1;
          const now = new Date().toISOString();
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${this.SKILLS_TAB}!E${i+1}:F${i+1}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [[now, newCount.toString()]] })
          });
          break;
        }
      }
    } catch (err) { console.error('[Skills] Update usage error:', err); }
  },

  // DELETE: Remove a skill
  async deleteSkill(docId, token) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${docId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      });
      for (const [key, skill] of this.skillCache) { if (skill.docId === docId) { this.skillCache.delete(key); break; } }
      console.log(`[Skills] Deleted: ${docId}`);
      return { success: true };
    } catch (err) { console.error('[Skills] Delete error:', err); return { success: false, error: err.message }; }
  },

  // AUTO-SKILL: Detect when agent should create a skill
  shouldCreateSkill(taskHistory) {
    if (!taskHistory || taskHistory.length < 3) return false;
    const actions = taskHistory.map(t => t.action);
    const uniqueActions = new Set(actions);
    return uniqueActions.size < actions.length * 0.8;
  },

  // GET RELEVANT SKILLS: For session prompt building
  async getRelevantSkills(todoItems, token) {
    try {
      const allSkills = await this.listSkills(token);
      if (allSkills.length === 0) return '';
      const relevant = [];
      const todoText = todoItems.join(' ').toLowerCase();
      for (const skill of allSkills) {
        const skillText = `${skill.name} ${skill.category} ${skill.tags.join(' ')}`.toLowerCase();
        const skillWords = skillText.split(/\s+/);
        const match = skillWords.some(w => w.length > 3 && todoText.includes(w));
        if (match) relevant.push(skill);
      }
      if (relevant.length === 0) return '';
      let block = '\n== AVAILABLE SKILLS ==\n';
      for (const s of relevant.slice(0, 5)) {
        block += `- ${s.name} (category: ${s.category}, used ${s.useCount}x) => [SKILL_RECALL|${s.docId}]\n`;
      }
      block += 'Use [SKILL_RECALL|docId] to load a skill before executing.\n';
      return block;
    } catch (err) { console.error('[Skills] Relevant skills error:', err); return ''; }
  },

  // HELPER: Get sheet ID from storage
  async getSheetId() {
    return new Promise(resolve => {
      chrome.storage.local.get(['sheetId'], result => { resolve(result.sheetId || null); });
    });
  }
};

if (typeof module !== 'undefined') module.exports = SkillsManager;
