# AgentOS

**Turn any AI into a persistent autonomous agent. Free. No server. Just Google.**

AgentOS is an open-source Chrome extension that transforms any chat AI (ChatGPT, Claude, Gemini) into a full autonomous agent with persistent memory, skills, scheduling, email, and multi-agent coordination — all powered by your free Google account.

## Why AgentOS?

| Problem | AgentOS Solution |
|---------|-----------------|
| AI forgets everything between sessions | Google Doc = persistent SOUL memory |
| No database or structured storage | Google Sheets = 6-tab database |
| Can't learn or save reusable skills | Google Docs = one doc per skill |
| No task scheduling or automation | Google Calendar = cron-style scheduler |
| No messaging or notifications | Gmail = email gateway |
| Can't delegate to sub-agents | Google Drive = multi-agent system |
| Requires expensive API keys | Works with ANY free chat AI |
| Needs a server | Runs 100% in your browser |

## How It Works

```
Connect Google Account → Extension auto-creates Doc + Sheet
  ↓
Open any AI chat → Click "Start Session"
  ↓
AI reads its SOUL memory → Sees current tasks
  ↓
AI outputs command tags → Extension executes them
  ↓
[BROWSE: latest AI news] → Opens Google search
[SAVE_NOTE: found 3 articles] → Saves to memory Doc
[SKILL_CREATE: research|...] → Creates reusable skill
[SCHEDULE_TASK: daily-report|tomorrow 9am|...] → Sets Calendar event
[EMAIL_NOTIFY: user@email.com|Report|...] → Sends via Gmail
  ↓
Results injected back → AI continues autonomously
  ↓
Session ends → Summary saved → Next session picks up where it left off
```

## 34 Command Tags

**Memory:** SAVE_NOTE, SHEET_WRITE, SHEET_READ, SHEET_APPEND, TASK_DONE, ADD_TASK, SKIP

**Browser:** TAB_OPEN, TAB_SCRAPE, TAB_CLICK, TAB_TYPE, TAB_READ, TAB_LIST, TAB_CLOSE, TAB_WAIT, BROWSE

**Skills:** SKILL_CREATE, SKILL_SEARCH, SKILL_RECALL, SKILL_IMPROVE, SKILL_LIST

**Scheduler:** SCHEDULE_TASK, SCHEDULE_LIST, SCHEDULE_CANCEL

**Multi-Agent:** SPAWN_AGENT, AGENT_MSG, ASSIGN_TASK, AGENT_LIST, AGENT_DONE

**Email:** EMAIL_NOTIFY, EMAIL_REPORT, EMAIL_CHECK

**Session:** SESSION_COMPLETE

## Quick Start (5 minutes)

### 1. Set up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable these APIs:
   - Google Docs API
   - Google Sheets API
   - Google Drive API
   - Google Calendar API
   - Gmail API

### 2. Create OAuth Credentials

1. Go to APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Select "Chrome Extension" as application type
4. Name it "AgentOS Extension"
5. For Item ID: load the extension first (step 3), then come back

### 3. Install Extension

1. Clone this repo: `git clone https://github.com/nickberger1993-ai/agentos.git`
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the `extension` folder
5. Copy your extension ID from the extensions page
6. Go back to Google Cloud → update the Chrome Extension OAuth with your extension ID
7. Copy the Client ID from Google Cloud
8. Edit `extension/manifest.json` → replace the `client_id` value under `oauth2`

### 4. Connect & Go

1. Click the AgentOS icon in Chrome toolbar
2. Click "Connect Google" — authorize all permissions
3. Extension auto-creates your SOUL Doc + Database Sheet
4. Open any AI chat (ChatGPT, Claude, Gemini)
5. Click "Start Session" — the AI becomes autonomous

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Chrome Extension                │
│                                                  │
│  popup.html/js ← User controls (connect, start) │
│  content.js   ← Tag scanner + result injection   │
│  background.js ← Message router + API calls      │
│                                                  │
│  skills.js     ← Google Docs skill management    │
│  scheduler.js  ← Google Calendar scheduling      │
│  multiagent.js ← Google Drive agent spawning     │
│  gateway.js    ← Gmail messaging gateway         │
│  templates.js  ← 8 pre-built agent templates     │
└─────────────────────────────────────────────────┘
         │              │              │
    Google Docs    Google Sheets   Google Calendar
    (Memory+Skills) (Database)     (Scheduler)
         │              │              │
    Google Drive      Gmail       Any Chat AI
    (Sub-agents)   (Messaging)   (BYO-LLM)
```

## Google-Native Feature Map

| Feature | Google Service | How It Works |
|---------|---------------|-------------|
| SOUL Memory | Google Docs | Main doc stores identity, tasks, notes, session logs |
| Database | Google Sheets | 6 tabs: Sessions, Skills, Agents, Messages, Tasks, Data |
| Skills/Plugins | Google Docs | Each skill = one Doc, searchable via Drive API |
| Scheduler | Google Calendar | Calendar events with task descriptions |
| Messaging | Gmail | Send notifications, reports, check inbox |
| Multi-Agent | Google Drive | Each sub-agent = Doc+Sheet pair |
| Auth | Google OAuth | One-click sign-in via Chrome Identity API |
| Templates | Built-in | 8 pre-configured agent types |

## File Structure

```
extension/
├── manifest.json    ← v4.0.0, MV3 with all Google API scopes
├── background.js    ← Service worker: auto-provision + message router
├── content.js       ← Content script: tag scanner + 34 command handlers
├── content.css      ← UI styles for floating badge/panel
├── popup.html       ← Extension popup: one-click connect UI
├── popup.js         ← Popup logic: OAuth flow + session controls
├── skills.js        ← Skills module: create, search, recall, improve
├── scheduler.js     ← Scheduler module: Calendar API integration
├── multiagent.js    ← Multi-agent module: spawn, message, assign
├── gateway.js       ← Email gateway: send, check, report via Gmail
└── templates.js     ← 8 agent templates (researcher, coder, etc.)
```

## Agent Templates

1. **Research Agent** — Web research with source tracking
2. **Code Agent** — Software development assistant
3. **Writer Agent** — Content creation and editing
4. **Data Agent** — Spreadsheet analysis and reporting
5. **Social Agent** — Social media management
6. **Support Agent** — Customer service automation
7. **Sales Agent** — Lead tracking and outreach
8. **Ops Agent** — DevOps and system monitoring

## Roadmap

- [x] Core feedback loop (v1-v3)
- [x] 34 command tags (v4)
- [x] Skills system via Google Docs
- [x] Google Calendar scheduler
- [x] Gmail messaging gateway
- [x] Multi-agent coordination via Drive
- [x] One-click auto-provisioning
- [x] 8 agent templates
- [ ] Visual workflow builder
- [ ] Mobile companion PWA
- [ ] Community skill marketplace
- [ ] Voice interface
- [ ] Chrome Web Store publication

## Contributing

PRs welcome. The architecture is modular — add new command tags in content.js and their handlers in background.js.

## License

MIT

