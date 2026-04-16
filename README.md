# AgentOS

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
