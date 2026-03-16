---
name: pinchtab
description: >
  Control a headless Chrome browser via Pinchtab's HTTP API. Use for web automation,
  scraping, form filling, navigation, and multi-tab workflows. Pinchtab exposes the
  accessibility tree as flat JSON with stable refs — optimized for AI agents (low token
  cost, fast). Use when the task involves: browsing websites, filling forms, clicking
  buttons, extracting page text, taking screenshots, or any browser-based automation.
allowed-tools: Bash(pinchtab:*)
---

# Pinchtab — Browser Automation

Fast, lightweight browser control via HTTP + accessibility tree. Pinchtab runs on the host machine; you reach it from this container via `$PINCHTAB_URL` with bearer auth `$PINCHTAB_TOKEN`.

## Quick Start

```bash
# 1. Health check
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/health"

# 2. Navigate
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}'

# 3. Snapshot interactive elements
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?filter=interactive&format=compact"

# 4. Click a ref from the snapshot
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "e5"}'

# 5. Re-snapshot to see result
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?filter=interactive&format=compact"
```

## Core Workflow

1. **Navigate** to a URL
2. **Snapshot** the accessibility tree (get refs like `e0`, `e5`, `e12`)
3. **Act** on refs (click, type, press)
4. **Snapshot** again to see results

Refs are cached per tab after each snapshot — no need to re-snapshot before every action unless the page changed significantly.

## API Reference

### Navigate

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}'

# With options: custom timeout, block images, open in new tab
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "timeout": 60, "blockImages": true, "newTab": true}'
```

### Snapshot (accessibility tree)

```bash
# Interactive elements only — buttons, links, inputs (recommended default)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?filter=interactive"

# Compact format — one-line-per-node, best token efficiency
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?format=compact"

# Smart diff — only changes since last snapshot (massive token savings)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?diff=true"

# Text format — indented tree, ~40-60% fewer tokens than JSON
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?format=text"

# Scope to CSS selector
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?selector=main"

# Limit depth
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?depth=5"

# Truncate to ~N tokens
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?maxTokens=2000"

# Full tree (expensive — use only when needed)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot"

# Maximum efficiency combo
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/snapshot?format=compact&selector=main&maxTokens=2000&filter=interactive"
```

Returns flat JSON array of nodes with `ref`, `role`, `name`, `depth`, `value`, `nodeId`.

**Token optimization**: Use `?format=compact` for best efficiency. Add `?filter=interactive` for action-oriented tasks (~75% fewer nodes). Use `?selector=main` to scope to relevant content. Use `?diff=true` on multi-step workflows.

### Act on Elements

```bash
# Click by ref
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "e5"}'

# Click and wait for navigation
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "e5", "waitNav": true}'

# Type into element (click first to focus, then type)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "type", "ref": "e12", "text": "hello world"}'

# Fill (set value directly, no keystrokes)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "fill", "selector": "#email", "text": "user@example.com"}'

# Press a key
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "press", "key": "Enter"}'

# Focus an element
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "focus", "ref": "e3"}'

# Hover (trigger dropdowns/tooltips)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "hover", "ref": "e8"}'

# Select dropdown option
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "select", "ref": "e10", "value": "option2"}'

# Scroll to element
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "scroll", "ref": "e20"}'

# Scroll by pixels (infinite scroll pages)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/action" \
  -H 'Content-Type: application/json' \
  -d '{"kind": "scroll", "scrollY": 800}'
```

### Batch Actions

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/actions" \
  -H 'Content-Type: application/json' \
  -d '[{"kind":"click","ref":"e3"},{"kind":"type","ref":"e3","text":"hello"},{"kind":"press","key":"Enter"}]'
```

### Extract Text

```bash
# Readability mode (default) — strips nav/footer/ads, keeps article content
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Raw innerText
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text?mode=raw"
```

Returns `{url, title, text}`. Cheapest option (~800 tokens for most pages).

### Screenshot

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/screenshot?raw=true" -o /tmp/screenshot.jpg

# Lower quality for smaller file
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  "$PINCHTAB_URL/screenshot?raw=true&quality=50" -o /tmp/screenshot.jpg
```

### Evaluate JavaScript

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/evaluate" \
  -H 'Content-Type: application/json' \
  -d '{"expression": "document.title"}'
```

### Tab Management

```bash
# List tabs
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/tabs"

# Open new tab
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/tab" \
  -H 'Content-Type: application/json' \
  -d '{"action": "new", "url": "https://example.com"}'

# Close tab
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/tab" \
  -H 'Content-Type: application/json' \
  -d '{"action": "close", "tabId": "TARGET_ID"}'
```

Multi-tab: pass `?tabId=TARGET_ID` to snapshot/screenshot/text, or `"tabId"` in POST body.

### Tab Locking (multi-agent)

```bash
# Lock a tab (default 30s timeout, max 5min)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/tab/lock" \
  -H 'Content-Type: application/json' \
  -d '{"tabId": "TARGET_ID", "owner": "agent-1", "timeoutSec": 60}'

# Unlock
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/tab/unlock" \
  -H 'Content-Type: application/json' \
  -d '{"tabId": "TARGET_ID", "owner": "agent-1"}'
```

### Cookies

```bash
# Get cookies for current page
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/cookies"

# Set cookies
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/cookies" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","cookies":[{"name":"session","value":"abc123"}]}'
```

### Stealth

```bash
# Check stealth status
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/stealth/status"

# Rotate fingerprint
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/fingerprint/rotate" \
  -H 'Content-Type: application/json' \
  -d '{"os": "windows"}'
```

### Health Check

```bash
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/health"
```

## Token Cost Guide

| Method                         | Typical tokens | When to use                         |
| ------------------------------ | -------------- | ----------------------------------- |
| `/text`                        | ~800           | Reading page content                |
| `/snapshot?filter=interactive` | ~3,600         | Finding buttons/links to click      |
| `/snapshot?diff=true`          | varies         | Multi-step workflows (only changes) |
| `/snapshot?format=compact`     | ~56-64% less   | One-line-per-node, best efficiency  |
| `/snapshot?format=text`        | ~40-60% less   | Indented tree, cheaper than JSON    |
| `/snapshot`                    | ~10,500        | Full page understanding             |
| `/screenshot`                  | ~2K (vision)   | Visual verification                 |

**Strategy**: Start with `/snapshot?filter=interactive&format=compact`. Use `?diff=true` on subsequent snapshots. Use `/text` when you only need readable content. Use full `/snapshot` only for complete page understanding.

## Social Media Browsing (No Account Required)

### X / Twitter (via Nitter)

X.com blocks content behind a login wall. Use Nitter frontends instead — they mirror public tweets without requiring authentication.

**Primary instance:** `xcancel.com` (most reliable)
**Fallbacks:** `nitter.poach.me`, `nitter.privacydev.net`

```bash
# Read a user's tweets
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://xcancel.com/elonmusk", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Search tweets
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://xcancel.com/search?q=AI+agents", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Read a specific tweet thread
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://xcancel.com/user/status/1234567890", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

**Tips:** Always use `blockImages: true` — Nitter is text-focused. If an instance is down, try the fallbacks. Use `/text` (not `/snapshot`) for reading content — much cheaper.

### Xiaohongshu / RedNote / Little Red Book

Public notes on xiaohongshu.com are viewable without login. Use stealth mode — the site has anti-bot detection.

```bash
# Search for content (navigate to explore page with search)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.xiaohongshu.com/search_result?keyword=melbourne+coffee", "blockImages": true}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"

# Read a specific note (use the explore URL format)
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" \
  -X POST "$PINCHTAB_URL/navigate" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.xiaohongshu.com/explore/NOTE_ID"}'
curl -s -H "Authorization: Bearer $PINCHTAB_TOKEN" "$PINCHTAB_URL/text"
```

**Tips:** Content is in Chinese (Simplified). Use `/text` for extraction then translate. If blocked, rotate fingerprint via `/fingerprint/rotate`. Some content may show a login prompt — scroll past it or use `/snapshot?selector=main` to focus on the content area.

### Douban

See the dedicated **douban** skill for comprehensive Douban browsing (movies, music, books, artists/celebrities, search, image downloading, anti-scraping best practices).

### Platform Limitations

| Platform               | Works without account | Best endpoint | Notes                                |
| ---------------------- | --------------------- | ------------- | ------------------------------------ |
| X/Twitter (via Nitter) | Yes                   | `/text`       | Instances may go down; use fallbacks |
| Xiaohongshu            | Partial               | `/text`       | May hit login prompts; use stealth   |
| Douban                 | Yes                   | `/text`       | Most open; rate limit yourself       |
| Facebook               | No                    | —             | Aggressive login wall, not viable    |
| Threads                | No                    | —             | Immediate login wall                 |
| Weibo                  | Limited               | `/text`       | Desktop version requires login       |

## Tips

- Refs are stable between snapshot and actions -- no need to re-snapshot before clicking
- After navigation or major page changes, take a new snapshot to get fresh refs
- Use `filter=interactive` by default, fall back to full snapshot when needed
- Always pass `tabId` explicitly when working with multiple tabs
- Use `blockImages: true` on navigate for read-heavy tasks to reduce bandwidth
- Screenshots save as JPEG; use `-o /tmp/file.jpg` to write to disk
