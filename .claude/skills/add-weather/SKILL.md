# Add Weather

Add weather lookup capability to Andy. Uses free APIs (wttr.in + Open-Meteo) — no API keys needed. After running this skill, Andy can answer weather questions via WhatsApp.

## Phase 1: Pre-flight

Verify `curl` is available in the container:

```bash
container run --rm nanoclaw-agent:latest which curl
```

If missing, the Dockerfile needs `curl` added. Check:

```bash
grep -q 'curl' container/Dockerfile && echo "CURL_IN_DOCKERFILE" || echo "NEEDS_CURL"
```

If `NEEDS_CURL`, add `curl` to the `apt-get install` line in `container/Dockerfile`, then rebuild with `./container/build.sh`.

## Phase 2: Add Weather Instructions to CLAUDE.md

Read `groups/main/CLAUDE.md`. Add the following section after the "What You Can Do" list (or in an appropriate location). If a weather section already exists, update it instead of duplicating.

### Instructions to add:

```markdown
## Weather

You can check weather using free APIs. No API keys needed.

### Quick weather (wttr.in)

```bash
# Current conditions (one-line)
curl -s "wttr.in/Adelaide?format=3"

# Compact: location, condition, temp, humidity, wind
curl -s "wttr.in/Adelaide?format=%l:+%c+%t+%h+%w"

# Full 3-day forecast
curl -s "wttr.in/Adelaide?T"

# Today only
curl -s "wttr.in/Adelaide?1&T"

# Current only
curl -s "wttr.in/Adelaide?0&T"
```

Tips:
- URL-encode spaces: `wttr.in/New+York`
- Airport codes work: `wttr.in/ADL`
- Units: `?m` (metric, default) `?u` (imperial/USCS)
- Save as image: `curl -s "wttr.in/Adelaide.png" -o /tmp/weather.png`

### Programmatic weather (Open-Meteo, JSON fallback)

Use when wttr.in is down or you need structured data:

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=-34.93&longitude=138.60&current_weather=true"
```

Returns JSON with temperature, windspeed, and weather code. Find coordinates for any city first if needed.

### Default behavior

- Default to the user's location (Adelaide, Australia) when no city is specified
- Use metric units unless the user asks for imperial
- For quick checks, use the compact format; for forecasts, use the full format
```

## Phase 3: Update "What You Can Do" List

In the same `groups/main/CLAUDE.md`, find the "What You Can Do" bullet list and add:

```markdown
- **Check weather** — current conditions and forecasts for any city worldwide (no API key needed)
```

## Phase 4: Verify

Test that the weather commands work from inside the container:

```bash
container run --rm nanoclaw-agent:latest curl -s "wttr.in/Adelaide?format=3"
```

Expected output: something like `Adelaide: ⛅️ +18°C`

If it fails with a network error, the container may not have DNS or internet access. Check container networking.

## Troubleshooting

**curl not found in container**: Add `curl` to the Dockerfile's `apt-get install` line and rebuild.

**wttr.in rate limited or down**: The Open-Meteo fallback handles this. Andy's instructions include both.

**Wrong default city**: Update the default city in the weather section of `groups/main/CLAUDE.md`.
