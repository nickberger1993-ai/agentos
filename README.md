# AgentOS

> Turn any AI into a persistent employee. The open-source operating system for AI agents using Google Docs + Sheets.

[![Live Demo](https://img.shields.io/badge/demo-live-blue)](https://nickberger1993-ai.github.io/agentos/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Price: Free](https://img.shields.io/badge/price-free-brightgreen)](https://nickberger1993-ai.github.io/agentos/setup.html)

## The Problem

Every time you start a new session with an AI, it forgets everything. You re-explain your project, your preferences, your progress. It's like hiring a new employee every day.

## The Solution

AgentOS gives your AI a persistent brain using Google Docs as external memory. One document. Four sections. Works with any AI.

**Your AI reads the doc → understands state → executes task → updates memory → moves to next task.**

Session ends? Memory stays. New session? Picks up exactly where it left off.

**100% free. No credit card. No limits. Open source.**

## How It Works

AgentOS uses a simple 4-part document structure:

| Section | Purpose |
|---------|---------|
| **SOUL** | Agent identity, role, tone, rules |
| **TODO / DONE** | Task queue with completion tracking |
| **LIVE LINKS** | Important resources and references |
| **WHAT'S NEXT** | Priority queue and current state |

### The Core Loop

Every session follows the same cycle:

1. **Read** the memory document
2. **Understand** current state from TODO/DONE
3. **Execute** the top task
4. **Update** memory (move task to DONE, update WHAT'S NEXT)
5. **Continue** to next task or report status

## Quick Start

1. Go to [agentos setup wizard](https://nickberger1993-ai.github.io/agentos/setup.html)
2. Connect or create a Google Doc
3. Define your agent's identity (SOUL)
4. Add your first tasks
5. Get your starter prompt
6. Paste into Claude, ChatGPT, Gemini, or any AI

**That's it.** Your AI now has persistent memory.

## Works With Any AI

- Claude (Anthropic)
- ChatGPT (OpenAI)
- Gemini (Google)
- LLaMA / Open Source
- Any LLM that can read and write text

AgentOS is a BYO-LLM framework. You provide the brain, we provide the operating system.

## Features

- **Persistent Memory** — Remembers everything across sessions
- **Self-Updating** — AI updates its own memory after every task
- **Google Docs + Sheets** — Uses free tools you already have
- **Works Everywhere** — Chat, browser, desktop, API
- **4-Part Architecture** — Simple, structured, universal
- **100% Free** — No tiers, no limits, no upsell. MIT licensed.

## Project Structure

\`\`\`
agentos/
├── index.html      # Landing page
├── setup.html      # 4-step setup wizard
├── README.md       # This file
└── LICENSE          # MIT License
\`\`\`

## Roadmap

- [x] Landing page
- [x] Setup wizard (4-step form)
- [x] Starter prompt generator
- [x] AgentOS document template generator
- [ ] Google OAuth integration (auto-connect docs)
- [ ] Auto-write to Google Docs via API
- [ ] Google Sheets integration for structured data
- [ ] Dashboard for managing multiple agents

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
- [Contact](mailto:alon@iploop.io)

---

Built with persistence in mind. Free forever.
