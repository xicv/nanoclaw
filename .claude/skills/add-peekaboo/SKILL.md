# Add Peekaboo (macOS Desktop Automation)

Add Peekaboo integration to NanoClaw so the agent can see and control the host Mac's desktop — click buttons, type text, manage windows, navigate menus, and automate any GUI workflow via WhatsApp commands.

**Usage:** `/add-peekaboo`

## Prerequisites

- macOS 15+ (Sequoia or later)
- Homebrew installed
- NanoClaw already set up and running

## Phase 1: Install Peekaboo

### Check if already installed

```bash
peekaboo --version && echo "INSTALLED" || echo "NOT_FOUND"
```

If INSTALLED, skip to Phase 2.

### Install via Homebrew

```bash
brew install peekaboo
```

If brew is not available, tell the user to download from https://github.com/steipete/Peekaboo/releases

### Verify installation

```bash
peekaboo --version
```

## Phase 2: Grant Permissions

Peekaboo needs two macOS permissions to work:

### Check permission status

```bash
peekaboo permissions status
```

### If Screen Recording or Accessibility is not granted:

Tell the user:

> Peekaboo needs **Screen Recording** and **Accessibility** permissions to see and control your Mac.
>
> 1. Open **System Settings > Privacy & Security > Screen Recording** and enable Peekaboo
> 2. Open **System Settings > Privacy & Security > Accessibility** and enable Peekaboo
>
> You may need to restart Peekaboo after granting permissions.

Use AskUserQuestion to confirm the user has granted permissions, then re-check:

```bash
peekaboo permissions status
```

## Phase 3: Verify Peekaboo Works

### Test basic screen capture

```bash
peekaboo see --json 2>/dev/null | head -20
```

This should return a JSON object with screen element data.

### Test app listing

```bash
peekaboo list apps --json
```

Should list running applications.

If either test fails, check permissions again.

## Phase 4: Build and Restart NanoClaw

The source code changes for Peekaboo IPC support are already in the codebase. Just rebuild and restart:

```bash
npm run build
```

If the build fails, check for TypeScript errors and fix them.

### Rebuild the container image

```bash
./container/build.sh
```

### Restart NanoClaw service

macOS:
```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Linux (should not apply since Peekaboo is macOS-only):
```bash
systemctl --user restart nanoclaw
```

## Phase 5: Test the Integration

Send a WhatsApp message to Andy:

> "What apps are running on my Mac?"

or

> "Take a screenshot of my desktop"

Andy should use the `peekaboo` MCP tool to execute the command and return the results.

### Manual IPC test (if WhatsApp test fails)

Check that NanoClaw is picking up peekaboo IPC requests:

```bash
tail -50 logs/nanoclaw.log | grep -i peekaboo
```

## Troubleshooting

**"Peekaboo command timed out":**
- Peekaboo may not be installed: `peekaboo --version`
- Peekaboo may not be in the NanoClaw service PATH. Check the launchd plist PATH includes the directory containing `peekaboo` (usually `/opt/homebrew/bin`)
- Fix: Update PATH in `~/Library/LaunchAgents/com.nanoclaw.plist`

**"Command not allowed":**
- Only whitelisted Peekaboo subcommands are allowed via IPC (security measure)
- Allowed: see, image, click, type, press, hotkey, paste, scroll, swipe, drag, move, window, space, menu, menubar, app, open, dock, dialog, list, sleep, capture, permissions

**"Screen Recording permission denied":**
- Open System Settings > Privacy & Security > Screen Recording
- Enable Peekaboo
- Restart Peekaboo and NanoClaw

**Agent doesn't use Peekaboo:**
- Check that `container/skills/peekaboo/SKILL.md` exists
- Rebuild the container: `./container/build.sh`
- The skill is synced to the container's `.claude/skills/` on each run
