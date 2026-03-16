# Pinchtab Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace agent-browser with pinchtab for 5-13x more token-efficient browser automation via a host-side HTTP service.

**Architecture:** Pinchtab runs as a host-side launchd service (Go binary + Chrome). Containers call it via HTTP through the host gateway, same pattern as the credential proxy. The old Playwright/Chromium/agent-browser stack is removed from the container image.

**Tech Stack:** Go (pinchtab binary), launchd (macOS service), curl (container HTTP client), TypeScript (NanoClaw host)

---

### Task 1: Build and install pinchtab binary

**Files:**
- None (system-level install)

**Step 1: Clone and build pinchtab**

```bash
cd /tmp
git clone https://github.com/pinchtab/pinchtab.git
cd pinchtab
go build -ldflags="-s -w" -o pinchtab .
```

**Step 2: Install binary to /usr/local/bin**

```bash
sudo cp /tmp/pinchtab/pinchtab /usr/local/bin/pinchtab
pinchtab --help || echo "Binary installed"
```

**Step 3: Verify it works**

```bash
BRIDGE_HEADLESS=true pinchtab &
sleep 3
curl http://localhost:9867/health
kill %1
```
Expected: `{"status":"ok"}` or similar health response.

**Step 4: Clean up temp build**

```bash
rm -rf /tmp/pinchtab
```

---

### Task 2: Generate BRIDGE_TOKEN and add to .env

**Files:**
- Modify: `.env`

**Step 1: Generate a secure random token**

```bash
TOKEN=$(openssl rand -hex 32)
echo "BRIDGE_TOKEN=$TOKEN" >> .env
echo "Token generated: ${TOKEN:0:8}..."
```

**Step 2: Verify token is in .env**

```bash
grep BRIDGE_TOKEN .env
```
Expected: `BRIDGE_TOKEN=<64-char hex string>`

---

### Task 3: Install launchd service

**Files:**
- Create: `~/Library/LaunchAgents/com.pinchtab.bridge.plist`

**Step 1: Create the plist file**

Read `BRIDGE_TOKEN` from `.env` and inject it into the plist. The plist runs pinchtab headless on port 9867.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pinchtab.bridge</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/pinchtab</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>BRIDGE_PORT</key>
        <string>9867</string>
        <key>BRIDGE_HEADLESS</key>
        <string>true</string>
        <key>BRIDGE_TOKEN</key>
        <string>TOKEN_VALUE_HERE</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/pinchtab.out.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/pinchtab.err.log</string>

    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
```

**Step 2: Load and start the service**

```bash
launchctl load -w ~/Library/LaunchAgents/com.pinchtab.bridge.plist
```

**Step 3: Verify service is running**

```bash
curl -H "Authorization: Bearer $BRIDGE_TOKEN" http://localhost:9867/health
```
Expected: Health check passes with auth.

---

### Task 4: Create container pinchtab skill

**Files:**
- Create: `container/skills/pinchtab/SKILL.md`
- Delete: `container/skills/agent-browser/SKILL.md`

**Step 1: Write the pinchtab skill**

Create `container/skills/pinchtab/SKILL.md` — adapted from pinchtab's upstream SKILL.md but using `$PINCHTAB_URL` env var and `$BRIDGE_TOKEN` for auth. All commands use curl. The skill file is the primary interface agents use to control the browser.

Key adaptations from upstream:
- Replace `http://localhost:9867` with `$PINCHTAB_URL` (injected by container-runner)
- Add `-H "Authorization: Bearer $BRIDGE_TOKEN"` to all curl commands
- Keep the full API reference from upstream skill

**Step 2: Delete the old agent-browser skill**

```bash
rm -rf container/skills/agent-browser/
```

**Step 3: Commit**

```bash
git add container/skills/pinchtab/SKILL.md
git rm -r container/skills/agent-browser/
git commit -m "feat: replace agent-browser with pinchtab skill"
```

---

### Task 5: Slim the Dockerfile

**Files:**
- Modify: `container/Dockerfile`

**Step 1: Remove Chromium, fonts, Playwright, and agent-browser**

The new Dockerfile removes:
- All Chromium/font packages from apt-get
- `AGENT_BROWSER_EXECUTABLE_PATH` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env vars
- `agent-browser` from the npm global install

Keep: `curl`, `git`, `jq` (curl is needed to call pinchtab API).

Change from:
```dockerfile
# Install system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    curl \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for agent-browser
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Install agent-browser and claude-code globally
RUN npm install -g agent-browser @anthropic-ai/claude-code
```

To:
```dockerfile
# Install system dependencies (browser runs on host via pinchtab)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install claude-code globally
RUN npm install -g @anthropic-ai/claude-code
```

**Step 2: Commit**

```bash
git add container/Dockerfile
git commit -m "feat: slim Dockerfile — remove Chromium/agent-browser (pinchtab on host)"
```

---

### Task 6: Pass PINCHTAB_URL and BRIDGE_TOKEN to containers

**Files:**
- Modify: `src/container-runner.ts` (lines 240-290, `buildContainerArgs` function)
- Modify: `src/config.ts`

**Step 1: Add PINCHTAB_PORT config**

In `src/config.ts`, add:
```typescript
export const PINCHTAB_PORT = parseInt(
  process.env.PINCHTAB_PORT || '9867',
  10,
);
```

**Step 2: Read BRIDGE_TOKEN from .env**

In `src/config.ts`, update `readEnvFile` to include `BRIDGE_TOKEN`:
```typescript
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER', 'BRIDGE_TOKEN']);
```

Add:
```typescript
export const BRIDGE_TOKEN =
  process.env.BRIDGE_TOKEN || envConfig.BRIDGE_TOKEN || '';
```

**Step 3: Pass env vars in buildContainerArgs**

In `src/container-runner.ts`, add these lines after the timezone env var (around line 247):

```typescript
// Route browser traffic through host-side pinchtab service
args.push(
  '-e',
  `PINCHTAB_URL=http://${CONTAINER_HOST_GATEWAY}:${PINCHTAB_PORT}`,
);
if (BRIDGE_TOKEN) {
  args.push('-e', `BRIDGE_TOKEN=${BRIDGE_TOKEN}`);
}
```

Import `PINCHTAB_PORT` and `BRIDGE_TOKEN` from `./config.js`.

**Step 4: Commit**

```bash
git add src/container-runner.ts src/config.ts
git commit -m "feat: pass PINCHTAB_URL and BRIDGE_TOKEN to containers"
```

---

### Task 7: Create /add-pinchtab installer skill

**Files:**
- Create: `.claude/skills/add-pinchtab/SKILL.md`

**Step 1: Write the installer skill**

This follows the NanoClaw convention for integration skills (`/add-whatsapp`, `/add-telegram`, etc.). The skill automates the full setup: build binary, generate token, install launchd service, update .env, slim Dockerfile, rebuild container.

**Step 2: Commit**

```bash
git add .claude/skills/add-pinchtab/SKILL.md
git commit -m "feat: add /add-pinchtab installer skill"
```

---

### Task 8: Rebuild container and verify

**Step 1: Rebuild the container image**

```bash
./container/build.sh
```
Expected: Build succeeds, image is significantly smaller.

**Step 2: Verify pinchtab service is running**

```bash
curl -H "Authorization: Bearer $(grep BRIDGE_TOKEN .env | cut -d= -f2)" http://localhost:9867/health
```

**Step 3: Test end-to-end with a simple prompt**

Send a test message to NanoClaw that triggers browser use (e.g., "Search for weather in London") and verify the agent uses pinchtab via curl instead of agent-browser.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: rebuild container with pinchtab integration"
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Build and install pinchtab binary | System |
| 2 | Generate BRIDGE_TOKEN | `.env` |
| 3 | Install launchd service | `~/Library/LaunchAgents/com.pinchtab.bridge.plist` |
| 4 | Create container pinchtab skill | `container/skills/pinchtab/SKILL.md` |
| 5 | Slim the Dockerfile | `container/Dockerfile` |
| 6 | Pass env vars to containers | `src/container-runner.ts`, `src/config.ts` |
| 7 | Create installer skill | `.claude/skills/add-pinchtab/SKILL.md` |
| 8 | Rebuild and verify | Build + test |
