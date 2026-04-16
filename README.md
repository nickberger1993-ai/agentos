# AgentOS

**Turn any AI into an autonomous agent. Zero config. Just a Google account.**

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://nickberger1993-ai.github.io/agentos/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Price: Free](https://img.shields.io/badge/Price-Free_Forever-blue)](https://nickberger1993-ai.github.io/agentos/setup.html)
[![Version](https://img.shields.io/badge/version-4.0.0-purple)](https://github.com/nickberger1993-ai/agentos)

---

## The Problem

Every AI agent framework needs servers, Docker, API keys, Python environments, and technical setup. Most people don't have that. But **everyone has a Google account**.

## The Solution

AgentOS turns any AI chat into a fully autonomous agent using only free Google services:

| What You Need | What AgentOS Uses It For |
|---|---|
| Google Account | Authentication (OAuth) |
| Google Docs | Agent memory + SOUL (personality) |
| Google Sheets | Structured database + logs |
| Google Calendar | Task scheduler (cron jobs) |
| Gmail | Messaging gateway (email tasks in/out) |
| Chrome | Extension bridge to any AI chat |

**One click. Connect Google. Everything auto-generates. Your agent is live.**

## How It Works

```
1. Install Chrome Extension
2. Open ChatGPT / Claude / Gemini
3. Click "Connect Google" (OAuth consent)
4. AgentOS auto-creates:
   - Memory Doc (SOUL + TODO + Notes)
   - Database Sheet (Sessions + Skills + Agents + Messages)
   - Task Calendar ("AgentOS Tasks")
   - Gmail Label ("AgentOS")
5. Click "Start Session" - the agent takes over
```

### The Autonomous Loop

```
Session Start
  |
  v
Extension reads Doc + Sheet + Calendar + Gmail
  |
  v
Builds context-rich prompt with memory + skills + schedule
  |
  v
Injects into AI chat -> Auto-sends
  |
  v
AI reads state -> Outputs command tags
  |
  v
Extension executes (browse, write, schedule, email, spawn agents)
  |
  v
Results injected back as [RESULT] message
  |
  v
AI sees result -> Continues to next task
  |
  v
LOOP REPEATS until [SESSION_COMPLETE]
  |
  v
Extension writes summary to Doc + Sheet
  |
  v
Next session picks up where it left off
```

## 35+ Command Tags

The AI agent uses these tags - the extension executes them automatically:

### Memory Tools
| Tag | What It Does |
|---|---|
| `[SAVE_NOTE\|text]` | Save to memory doc |
| `[SHEET_WRITE\|range\|data]` | Write to database |
| `[SHEET_READ\|range]` | Read from database |
| `[SHEET_APPEND\|data]` | Append row to database |
| `[TASK_DONE]` | Mark current task complete |
| `[ADD_TASK\|task]` | Add new task to TODO |
| `[SKIP\|reason]` | Skip task with reason |

### Browser Control
| Tag | What It Does |
|---|---|
| `[TAB_OPEN\|url]` | Open browser tab |
| `[TAB_SCRAPE\|selector]` | Scrape page content |
| `[TAB_CLICK\|selector]` | Click element |
| `[TAB_TYPE\|selector\|text]` | Type into form |
| `[TAB_READ]` | Read full page text |
| `[TAB_LIST]` | List all open tabs |
| `[TAB_CLOSE\|tabId]` | Close a tab |
| `[TAB_WAIT\|seconds]` | Wait before next action |
| `[BROWSE\|url]` | Quick browse and summarize |

### Skills System
| Tag | What It Does |
|---|---|
| `[SKILL_CREATE\|name\|category\|...]` | Create reusable skill |
| `[SKILL_SEARCH\|query]` | Find relevant skills |
| `[SKILL_RECALL\|docId]` | Load skill content |
| `[SKILL_IMPROVE\|docId\|note]` | Improve existing skill |
| `[SKILL_LIST]` | List all skills |

### Scheduler (Google Calendar)
| Tag | What It Does |
|---|---|
| `[SCHEDULE_TASK\|title\|time\|recurrence]` | Schedule future task |
| `[SCHEDULE_LIST]` | List upcoming tasks |
| `[SCHEDULE_CANCEL\|eventId]` | Cancel scheduled task |

### Multi-Agent
| Tag | What It Does |
|---|---|
| `[SPAWN_AGENT\|name\|role]` | Create sub-agent (new Doc+Sheet) |
| `[AGENT_MSG\|name\|message]` | Send message to agent |
| `[ASSIGN_TASK\|name\|task]` | Delegate task to agent |
| `[AGENT_LIST]` | List all agents |
| `[AGENT_DONE\|summary]` | Report completion |

### Email Gateway (Gmail)
| Tag | What It Does |
|---|---|
| `[EMAIL_NOTIFY\|to\|subject\|body]` | Send email |
| `[EMAIL_REPORT\|to]` | Send daily report |
| `[EMAIL_CHECK]` | Check inbox for tasks |

### Session
| Tag | What It Does |
|---|---|
| `[SESSION_COMPLETE]` | End session, write summary |

## Quick Start

1. Clone this repo or download the `extension/` folder
2. Go to `chrome://extensions` > Enable Developer Mode > Load Unpacked > select `extension/`
3. Open ChatGPT, Claude, or Gemini
4. Click the AgentOS extension icon
5. Click **Connect Google** (one-time OAuth consent)
6. AgentOS auto-creates your Doc, Sheet, Calendar, and Gmail label
7. Click **Start Session** - the agent takes over

That's it. No servers. No API keys. No Docker. No Python.

## Agent Templates

Deploy a pre-built agent in one click. Each template creates a full Doc + Sheet pair:

| Template | Category | What It Does |
|---|---|---|
| Task Manager | Productivity | Daily priorities, deadlines, reminders |
| Code Reviewer | Development | PR review, security scanning, code quality |
| Content Writer | Marketing | Blog posts, SEO content, social copy |
| Lead Tracker | Business | Lead scoring, pipeline, follow-ups |
| Daily Assistant | Personal | Morning briefings, schedule, habits |
| Researcher | Research | Web research, data collection, reports |
| Site Monitor | DevOps | Uptime checks, performance alerts |
| Product Tracker | E-Commerce | Price tracking, competitor monitoring |

## Works With Any AI

- **Claude** (Anthropic)
- **ChatGPT** (OpenAI)
- **Gemini** (Google)
- Any AI that runs in a browser chat

AgentOS is a BYO-LLM framework. You provide the brain, we provide the operating system.

## The Google-Native Architecture

Every feature maps to a free Google service. No servers needed.

| Feature | OpenClaw Uses | AgentOS Uses |
|---|---|---|
| Agent Memory | SOUL.md file | Google Doc |
| Database | SQLite/Postgres | Google Sheets |
| Skills | File system | Google Docs (one per skill) |
| Scheduler | Cron/systemd | Google Calendar |
| Messaging | Telegram/Discord/Slack | Gmail |
| Multi-Agent | Docker containers | Google Drive (Doc+Sheet pairs) |
| Templates | SOUL.md files | Pre-built Docs |
| Auth | API keys | Google OAuth |
| Execution | Terminal/SSH | Chrome Extension |

**Result:** Anyone with a Google account can run an AI agent. No technical setup.

## Features

- **Autonomous Loop** - AI works independently with real feedback
- **Skills System** - Agent creates, recalls, and improves learned procedures
- **Task Scheduler** - Google Calendar as cron jobs for the agent
- **Multi-Agent Teams** - Spawn sub-agents, delegate tasks, coordinate work
- **Email Gateway** - Receive tasks via email, send reports back
- **8 Agent Templates** - One-click deploy for any role
- **Persistent Memory** - Remembers everything across sessions
- **Session Management** - Start/end sessions, track actions, log everything
- **Browser Automation** - Open tabs, click, type, scrape
- **35+ Command Tags** - Full tool suite for any task
- **Auto-Provisioning** - Connect Google, everything generates automatically
- **Free Forever** - No tiers, no server, MIT licensed

## Project Structure

```
agentos/
|-- extension/
|   |-- manifest.json        # Chrome extension config (MV3, v4.0)
|   |-- background.js        # Service worker + auto-provisioning
|   |-- content.js           # Chat bridge + command tag executor
|   |-- content.css          # UI overlay styles
|   |-- popup.html           # Extension popup UI
|   |-- popup.js             # Popup logic + session control
|   |-- skills.js            # Skills system (Google Docs)
|   |-- scheduler.js         # Task scheduler (Google Calendar)
|   |-- multiagent.js        # Multi-agent orchestration (Drive)
|   |-- gateway.js           # Email gateway (Gmail)
|   |-- templates.js         # 8 pre-built agent templates
|-- index.html               # Landing page
|-- setup.html               # Setup wizard
|-- callback.html            # OAuth callback
|-- README.md
|-- LICENSE
```

## Roadmap

- [x] Landing page
- [x] Setup wizard
- [x] Google OAuth integration
- [x] Auto-read/write Google Docs
- [x] Google Sheets integration
- [x] Chrome Extension bridge
- [x] Command tag system (35+ tags)
- [x] Browser control (8 TAB commands)
- [x] Autonomous feedback loop
- [x] Session management
- [x] Session logging
- [x] Memory recall across sessions
- [x] Session complete detection
- [x] Skills system (learn, create, recall, improve)
- [x] Task scheduler (Google Calendar)
- [x] Multi-agent support (spawn, message, delegate)
- [x] Email gateway (Gmail)
- [x] Agent templates (8 roles)
- [x] Auto-provisioning (one-click setup)
- [ ] Visual workflow builder
- [ ] Mobile companion (PWA)
- [ ] Community skill marketplace
- [ ] Voice interface

## Contributing

AgentOS is open source. Contributions welcome.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**Built for everyone. Free forever. Just a Google account.**

[Live Demo](https://nickberger1993-ai.github.io/agentos/) | [Setup Guide](https://nickberger1993-ai.github.io/agentos/setup.html)# AgentOS

> Turn any AI into an autonomous agent. The open-source operating system for AI agents using Google Docs + Sheets + Chrome Extension.

[![Live Demo](https://img.shields.io/badge/demo-live-blue)](https://nickberger1993-ai.github.io/agentos/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Price: Free](https://img.shields.io/badge/price-free-brightgreen)](https://nickberger1993-ai.github.io/agentos/setup.html)
[![Version](https://img.shields.io/badge/version-3.0.0-orange)](https://github.com/nickberger1993-ai/agentos)

## The Problem

Every time you start a new session with an AI, it forgets everything. You re-explain your project, your preferences, your progress. It's like hiring a new employee every day.

And even when the AI remembers — it can't DO anything. It can't browse the web, write to a database, or work autonomously on tasks.

## The Solution

AgentOS turns any AI chat into a fully autonomous agent with:

- **Persistent Memory** via Google Docs — remembers across sessions
- **Structured Database** via Google Sheets — logs every action
- **Real Browser Control** via Chrome Extension — browses, clicks, types, scrapes
- **Autonomous Feedback Loop** — AI acts, sees results, keeps working

**Your AI reads its memory doc > picks up tasks > executes via command tags > extension does the work > injects results back > AI continues > session ends > memory saved.**

**100% free. No server. No API keys. Just a Chrome extension + Google account.**

## How It Works

AgentOS has 3 components:

| Component | Role |
|-----------|------|
| **Google Doc** | Agent memory — SOUL, TODO/DONE, notes, session log |
| **Google Sheet** | Structured database — session logs, research data |
| **Chrome Extension** | Bridge between AI chat and Google APIs + browser control |

### The Autonomous Loop

\`\`\`
Start Session
  > Extension reads Doc + Sheet (memory recall)
  > Builds session prompt with context
  > Injects into AI chat > auto-sends
  > AI responds with command tags
  > Extension executes them (browse, write, click...)
  > Results injected back as [RESULT] messages
  > AI sees results > continues working
  > Loop repeats until tasks done
  > [SESSION_COMPLETE] > summary saved to Doc + Sheet
  > Next session picks up where it left off
\`\`\`

## Available Tools

The AI agent can use these command tags — the extension executes them automatically:

### Memory Tools
| Tag | What it does |
|-----|-------------|
| \`[TASK_DONE: task]\` | Marks a task as complete |
| \`[ADD_TASK: task]\` | Adds a new task to TODO |
| \`[SKIP: task | reason]\` | Skips a task with reason |
| \`[SAVE_NOTE: text]\` | Saves a note to the doc |
| \`[BROWSE: url]\` | Fetches a webpage |
| \`[SHEET_WRITE: range | data]\` | Writes to Google Sheet |
| \`[SHEET_READ: range]\` | Reads from Google Sheet |
| \`[SHEET_APPEND: range | data]\` | Appends rows to Sheet |

### Browser Control
| Tag | What it does |
|-----|-------------|
| \`[TAB_OPEN: url]\` | Opens URL in a real browser tab |
| \`[TAB_SCRAPE: tabId]\` | Scrapes text from a tab |
| \`[TAB_CLICK: tabId | selector]\` | Clicks an element |
| \`[TAB_TYPE: tabId | selector | text]\` | Types into an input |
| \`[TAB_READ: tabId]\` | Lists interactive elements |
| \`[TAB_LIST]\` | Lists all open tabs |
| \`[TAB_CLOSE: tabId]\` | Closes a tab |
| \`[TAB_WAIT: ms]\` | Waits before next action |

### Session Control
| Tag | What it does |
|-----|-------------|
| \`[SESSION_COMPLETE: summary]\` | Ends session, saves summary |

## Quick Start

1. Clone this repo or download the \`extension/\` folder
2. Go to \`chrome://extensions\` > Enable Developer Mode > Load Unpacked > select \`extension/\`
3. Create a Google Doc with the AgentOS template (see [setup wizard](https://nickberger1993-ai.github.io/agentos/setup.html))
4. Create a Google Sheet for structured data
5. Open ChatGPT, Claude, or Gemini
6. Click the AgentOS extension icon > paste Doc URL > Connect
7. Paste Sheet URL > Connect
8. Click **Start Session** — the agent takes over

## Works With Any AI

- **Claude** (Anthropic)
- **ChatGPT** (OpenAI)
- **Gemini** (Google)
- **Any LLM** that runs in a browser chat

AgentOS is a BYO-LLM framework. You provide the brain, we provide the operating system.

## Features

- **Autonomous Agent Loop** — AI works independently with feedback loop
- **Persistent Memory** — Remembers everything across sessions via Google Docs
- **Session Management** — Start/end sessions, track actions, log everything
- **Sheet Logging** — Every action logged to Google Sheets with timestamps
- **Memory Recall** — New sessions load context from previous sessions
- **Browser Control** — Open tabs, click, type, scrape — real browser automation
- **Self-Updating** — AI updates its own memory after every task
- **Session Complete** — AI decides when to stop, writes summary
- **100% Free** — No tiers, no server, no API keys, MIT licensed

## Google Doc Structure

The memory document uses this structure:

\`\`\`
== SOUL ==           > Agent identity and rules
== AVAILABLE TAGS == > All command tags the agent can use
== RULES ==          > Operating rules for the agent
== RESPONSE FORMAT ==> How the agent should respond
== LIVE LINKS ==     > Important resources
== WHAT'S NEXT ==    > Current priorities
== TODO ==           > Task queue ([ ] uncompleted tasks)
== DONE ==           > Completed tasks ([x] done, [SKIPPED])
== NOTES ==          > Agent's findings and notes
== SESSION LOG ==    > History of past sessions
\`\`\`

## Project Structure

\`\`\`
agentos/
|-- extension/
|   |-- manifest.json    # Chrome extension config (MV3)
|   |-- background.js    # Session engine, Google APIs, browser control
|   |-- content.js       # Tag scanner, feedback loop, chat injection
|   |-- content.css      # AgentOS badge and notification styles
|   |-- popup.html       # Extension popup UI
|   |-- popup.js         # Popup logic and session management
|-- index.html           # Landing page
|-- setup.html           # Setup wizard
|-- callback.html        # OAuth callback
|-- README.md            # This file
|-- LICENSE              # MIT License
\`\`\`

## Roadmap

- [x] Landing page
- [x] Setup wizard
- [x] Starter prompt generator
- [x] Google OAuth integration
- [x] Auto-read/write Google Docs via API
- [x] Google Sheets integration
- [x] Chrome Extension bridge
- [x] Command tag system (18 tags)
- [x] Browser control (TAB_OPEN, CLICK, TYPE, SCRAPE, READ, LIST, CLOSE, WAIT)
- [x] Autonomous feedback loop
- [x] Session management (start/end/track)
- [x] Session logging to Google Sheets
- [x] Memory recall from previous sessions
- [x] Session complete detection
- [ ] Multi-agent support
- [ ] Agent marketplace
- [ ] Visual workflow builder
- [ ] Mobile companion app

## Contributing

AgentOS is open source. Contributions welcome.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## License

MIT License. See [LICENSE](LICENSE) for details.

## Links

- [Live Site](https://nickberger1993-ai.github.io/agentos/)
- [Setup Wizard](https://nickberger1993-ai.github.io/agentos/setup.html)

---

Built with persistence in mind. Free forever.
