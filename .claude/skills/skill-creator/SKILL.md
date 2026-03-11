# Skill Creator

Interactively create a new NanoClaw skill from scratch. Walks through naming, description, type selection, phase design, and generates a complete SKILL.md.

**Usage:** `/skill-creator`

## Phase 1: Gather Skill Details

### 1a. Name and Description

AskUserQuestion: What should this skill do? Describe the idea in a sentence or two.

Parse the response to derive:
- **Skill name** (kebab-case, e.g., `weather-briefing`)
- **Description** (one-liner)

AskUserQuestion to confirm: "I'll call this skill `<name>` — '<description>'. Sound right?"

### 1b. Skill Type

AskUserQuestion: What type of skill is this?

- **Agent capability** (most common): Teaches Andy (the agent) something new via CLAUDE.md instructions. No NanoClaw source code changes. Examples: summarize inbox, check weather, search files.
- **Code modification** (rare): Changes NanoClaw's source code to add infrastructure. Examples: add a new channel, modify the router, add a new IPC command.
- **Hybrid**: Both code changes AND agent instructions.

### 1c. Invocation

AskUserQuestion: How should this skill be invoked?

- **Slash command** (`/skill-name`): A Claude Code command that sets up or configures the skill
- **Agent capability**: Andy can do it when asked via WhatsApp (no slash command needed)
- **Both**: Slash command for setup, then Andy can use it ongoing

### 1d. Dependencies

AskUserQuestion: Does this skill need any of the following? (multi-select)

- API keys or secrets (stored in `.env`)
- npm packages
- System tools (brew, apt packages)
- External services (APIs, webhooks)
- File/directory access (mount allowlist)
- None of the above

For each selected, ask follow-up questions to get specifics.

## Phase 2: Design the Phases

Based on the skill type, design the SKILL.md phases:

### For Agent Capability skills:

The generated SKILL.md should have these phases:

1. **Pre-flight** — Check prerequisites (API keys present, tools installed, etc.)
2. **Setup** — Install dependencies, configure env vars, create helper scripts if needed
3. **Implementation** — Add instructions to the group's CLAUDE.md so Andy knows how to use the capability
4. **Verify** — Test the capability works (run a command, check output, etc.)

### For Code Modification skills:

1. **Pre-flight** — Check prerequisites, verify current state of files to modify
2. **Setup** — Install dependencies
3. **Implementation** — Create/modify source files with exact code changes
4. **Build & Test** — `npm run build && npm test` to verify changes compile and pass
5. **Verify** — Run the service and test the new functionality

### For Hybrid skills:

Combine both approaches — code changes first, then agent instructions.

## Phase 3: Generate the Skill

### 3a. Create the skill folder

```
.claude/skills/<skill-name>/
├── SKILL.md
```

### 3b. Write the SKILL.md

Follow these conventions:

1. **Title** — `# Skill Name`
2. **Description** — One paragraph: what it does, when to use it
3. **Usage** — How to invoke: `/skill-name` or `/skill-name <args>`
4. **Prerequisites** — What needs to be set up first
5. **Phases** — Step-by-step instructions for Claude Code:
   - Use `AskUserQuestion` for user-facing decisions
   - Include exact bash commands, file paths, expected outputs
   - Handle errors: tell Claude what to do when things fail
   - Follow the NanoClaw principle: fix automatically, only ask users for genuine manual actions

**Writing principles for the generated SKILL.md:**

- Write instructions FOR Claude Code to follow, not for humans to read
- Be specific: exact commands, exact file paths, exact expected outputs
- Handle errors: "If X fails, try Y. If Y fails, ask user Z."
- Use `AskUserQuestion` for any choice that needs user input
- Never hardcode secrets — use `.env` and environment variables
- Include a Troubleshooting section for common issues

### 3c. For code modification skills, also create:

- `manifest.yaml` with:
  ```yaml
  name: skill-name
  description: One-liner
  dependencies:
    npm: [package-names]
  adds:
    - path/to/new/file.ts
  modifies:
    - path/to/existing/file.ts
  test: npm test
  ```
- `add/` directory with new source files
- `modify/` directory with replacement files + `.intent.md` for each explaining the changes

### 3d. Register the skill

After creating the SKILL.md, register it in `.claude/settings.local.json` so it appears as a slash command:

Read `.claude/settings.local.json` (create if it doesn't exist). Add to the `skills` array:

```json
{
  "skills": [
    {
      "name": "<skill-name>",
      "path": ".claude/skills/<skill-name>/SKILL.md",
      "description": "<one-liner description>"
    }
  ]
}
```

Merge with existing skills — don't overwrite.

## Phase 4: Present and Test

### 4a. Show the result

Display the generated SKILL.md content to the user.

### 4b. Offer to run it

AskUserQuestion: "Want to run `/<skill-name>` now to set it up?"

- **Yes** — Invoke it with the Skill tool
- **Not yet** — Tell user they can run it anytime with `/<skill-name>`

## Troubleshooting

**Skill doesn't appear as slash command:**
- Check `.claude/settings.local.json` has the skill entry
- Restart Claude Code session (skills are loaded at startup)

**Skill fails when run:**
- Read the SKILL.md and check for missing prerequisites
- Check `logs/setup.log` for errors
- Verify env vars are set in `.env`

**Agent doesn't use the capability:**
- Check the group's CLAUDE.md has the instructions
- Rebuild and restart: `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
