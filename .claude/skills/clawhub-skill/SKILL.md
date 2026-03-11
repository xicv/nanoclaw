# ClawHub Skill Converter

Convert a ClawHub/OpenClaw skill (or any idea) into a native NanoClaw skill.

**Usage:** `/clawhub-skill <url-or-idea>`

**Examples:**
- `/clawhub-skill https://clawhub.ai/skills/weather-briefing`
- `/clawhub-skill daily standup summary from GitHub commits`
- `/clawhub-skill home automation control via HomeAssistant API`

## How It Works

This skill takes a ClawHub URL or a plain-English idea and produces a complete NanoClaw skill folder in `.claude/skills/`.

## Phase 1: Understand the Source

### If a URL is provided:

1. Fetch the URL using WebFetch to read the skill page.
2. Extract:
   - **Name** and description
   - **What it does** (core functionality)
   - **Triggers** (how users invoke it)
   - **Dependencies** (APIs, npm packages, system tools)
   - **Configuration** (env vars, secrets, user settings)
   - **Code** (if source is visible, read it to understand the implementation)

3. If the URL is a GitHub repo, use the `mcp__zread__` tools to read the source files and understand the implementation.

### If an idea is provided:

1. Parse the idea into:
   - **Name** (derive a short kebab-case name)
   - **Description** (one-liner)
   - **Core functionality** (what it should do)
   - **Likely dependencies** (APIs, packages)

## Phase 2: Design the NanoClaw Skill

AskUserQuestion to confirm the skill plan before building:

Present:
- **Skill name** (e.g., `weather-briefing`)
- **What it will do**
- **Skill type**: Does it need to modify NanoClaw source code, or is it purely an agent capability (CLAUDE.md instructions + tools)?
- **Dependencies** (npm packages, APIs, env vars needed)
- **How it's invoked** (slash command in Claude Code, or agent capability via WhatsApp)

### Skill Type Decision

**Agent capability** (most common): The skill adds instructions to the agent's CLAUDE.md so Andy knows how to do something new. No source code changes needed.
- Example: "summarize my inbox" → Add instructions + API setup to agent's toolkit
- Implementation: SKILL.md guides adding instructions to `groups/main/CLAUDE.md` or creating tools in the container

**Code modification** (rare): The skill changes NanoClaw's source code to add infrastructure.
- Example: "add Telegram channel" → Modifies src/index.ts, adds src/channels/telegram.ts
- Implementation: Uses `add/` and `modify/` directories with intent files

**Hybrid**: Some skills need both (e.g., add a new channel + teach the agent how to use it).

## Phase 3: Build the Skill

### 3a. Create the skill folder

```
.claude/skills/<skill-name>/
├── SKILL.md
└── manifest.yaml (if code modification skill)
```

### 3b. Write the SKILL.md

Follow NanoClaw skill conventions:

1. **Title** — `# Skill Name`
2. **Description** — One paragraph explaining what it does and when to use it
3. **Prerequisites** — What needs to be set up first (API keys, packages)
4. **Phases** — Step-by-step instructions Claude Code follows:
   - Phase 1: Pre-flight checks (verify requirements)
   - Phase 2: Setup (install dependencies, configure)
   - Phase 3: Implementation (code changes or agent instructions)
   - Phase 4: Verify (test that it works)
5. **Troubleshooting** — Common issues and fixes

**Writing principles:**
- Write instructions FOR Claude Code to follow, not for humans to read
- Use `AskUserQuestion` for any user-facing decisions
- Be specific: include exact commands, file paths, expected outputs
- Handle errors: tell Claude what to do when things fail
- Follow the NanoClaw principle: fix things automatically, only ask the user when genuine manual action is required (e.g., pasting an API key)

### 3c. For code modification skills, also create:

- `manifest.yaml` with dependencies, adds, modifies, and test commands
- `add/` directory with new source files
- `modify/` directory with changed files + `.intent.md` for each
- `tests/` directory with test files

### 3d. For agent capability skills:

The SKILL.md should instruct Claude Code to:
1. Add necessary tools/scripts to the container or host
2. Update the group's CLAUDE.md with instructions for Andy
3. Set up any required env vars or API keys
4. Test the capability by invoking it

## Phase 4: Test the Skill

After creating the skill:

1. Show the user the generated SKILL.md content
2. Ask: "Want to run this skill now to set it up?"
3. If yes, invoke it with the Skill tool

## Mapping OpenClaw → NanoClaw Concepts

| OpenClaw | NanoClaw Equivalent |
|----------|-------------------|
| Skill package (npm) | `.claude/skills/<name>/` folder |
| `skill.json` config | `manifest.yaml` |
| `index.ts` entry point | Instructions in `SKILL.md` |
| Tool definitions | Bash tools available in container |
| Cron triggers | NanoClaw task scheduler (IPC) |
| Memory/state | `groups/<name>/CLAUDE.md` |
| API integrations | Env vars in `.env` + container access |
| UI components | Not applicable (WhatsApp is the UI) |

## Important Notes

- ClawHub skills often rely on OpenClaw's runtime (MCP servers, tool definitions, etc.). The conversion creates a NanoClaw-native equivalent, not a direct port.
- Some complex OpenClaw skills may need to be simplified for NanoClaw's architecture.
- Always prefer teaching the agent via CLAUDE.md instructions over modifying source code.
- Security: if the source skill requires API keys or secrets, use `.env` and never hardcode them.
