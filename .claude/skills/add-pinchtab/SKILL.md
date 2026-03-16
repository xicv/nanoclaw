---
name: add-pinchtab
description: >
  Install Pinchtab as the browser automation backend. Replaces agent-browser (Playwright)
  with a host-side HTTP service for 5-13x better token efficiency. Builds Go binary,
  configures launchd/systemd service, updates Dockerfile and container runner.
---

# Add Pinchtab Browser Automation

Replaces in-container agent-browser (Playwright + Chromium) with host-side pinchtab (Go binary + Chrome via CDP). Agents call pinchtab's HTTP API from containers using curl.

## Phase 1: Pre-flight

### Check if already installed

```bash
which pinchtab
curl -s http://localhost:9867/health
```

If pinchtab is running and healthy, skip to Phase 3.

### Check prerequisites

- **Go 1.25+**: `go version` (needed to build from source)
- **Google Chrome**: Check `/Applications/Google Chrome.app` (macOS) or `which chromium` (Linux)

If Go is missing, check for a prebuilt release at https://github.com/pinchtab/pinchtab/releases.

## Phase 2: Install Pinchtab Binary

### Build from source

```bash
cd /tmp
git clone https://github.com/pinchtab/pinchtab.git
cd pinchtab
go build -ldflags="-s -w" -o pinchtab .
cp pinchtab ~/.local/bin/pinchtab
rm -rf /tmp/pinchtab
```

### Verify

```bash
BRIDGE_HEADLESS=true ~/.local/bin/pinchtab &
sleep 3
curl -s http://localhost:9867/health
kill %1
```

## Phase 3: Configure Service

### Generate auth token

```bash
TOKEN=$(openssl rand -hex 32)
echo "PINCHTAB_TOKEN=$TOKEN" >> .env
```

### Install launchd service (macOS)

Read PINCHTAB_TOKEN from `.env` and create the plist:

```bash
PINCHTAB_TOKEN=$(grep PINCHTAB_TOKEN .env | cut -d= -f2)
PINCHTAB_BIN="$HOME/.local/bin/pinchtab"
```

Write `~/Library/LaunchAgents/com.pinchtab.bridge.plist` with:
- ProgramArguments: path to pinchtab binary
- EnvironmentVariables: PINCHTAB_PORT=9867, PINCHTAB_HEADLESS=true, PINCHTAB_TOKEN
- RunAtLoad: true, KeepAlive: true

```bash
launchctl load -w ~/Library/LaunchAgents/com.pinchtab.bridge.plist
```

### Install systemd service (Linux)

```bash
sudo cp /tmp/pinchtab/scripts/systemd/pinchtab.service /etc/systemd/system/pinchtab@.service
sudo systemctl daemon-reload
sudo systemctl enable --now pinchtab@$USER
```

### Verify auth

```bash
PINCHTAB_TOKEN=$(grep PINCHTAB_TOKEN .env | cut -d= -f2)
# Should return 200 with health JSON
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" http://localhost:9867/health
# Should return 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:9867/health
```

## Phase 4: Update NanoClaw Code

These changes should already be applied if you installed pinchtab via the main integration. Verify each:

### Container skill

Check `container/skills/pinchtab/SKILL.md` exists. If not, create it (see `docs/plans/2026-03-12-pinchtab-integration-design.md`).

Delete `container/skills/agent-browser/` if it still exists.

### Dockerfile

Verify `container/Dockerfile` does NOT contain:
- `chromium` in apt-get
- `agent-browser` in npm install
- `AGENT_BROWSER_EXECUTABLE_PATH` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`

### Container runner

Verify `src/container-runner.ts` passes `PINCHTAB_URL` and `PINCHTAB_TOKEN` env vars to containers.

Verify `src/config.ts` exports `PINCHTAB_PORT` and `PINCHTAB_TOKEN`.

## Phase 5: Rebuild and Verify

```bash
# Rebuild slimmed container image
./container/build.sh

# Build NanoClaw
npx tsc

# Restart NanoClaw
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Test by sending a message that triggers browser use.
