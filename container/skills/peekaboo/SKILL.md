---
name: peekaboo
description: Control the host Mac's desktop — see the screen, click buttons, type text, manage windows and apps, navigate menus, and automate any GUI workflow. Use whenever the user asks to interact with macOS apps, take screenshots, or automate desktop tasks.
allowed-tools: Bash(peekaboo:*)
---

# macOS Desktop Automation with Peekaboo

You can see and control the host Mac's desktop through the `peekaboo` MCP tool. This lets you interact with any macOS application — click buttons, fill forms, read screen content, manage windows, and automate workflows.

## How it works

Peekaboo runs on the host Mac (not in your container). Commands are bridged via IPC with ~1-2 second latency per call. Results come back as structured JSON.

## Core workflow

1. **See** the screen or app to get a UI snapshot with element IDs
2. **Interact** using those element IDs (click, type, etc.)
3. **Re-see** after navigation or significant changes

## IMPORTANT: Multi-window apps (Chrome, VS Code, etc.)

Many apps have hidden helper windows. If you just use `--app "Google Chrome"`, Peekaboo may capture a tiny helper window instead of the main one. **Always target by window title** for apps with multiple windows:

1. First, list windows: `peekaboo(command: "list", args: ["windows", "--app", "Google Chrome"])`
2. Find the main window (the one with an actual title, not empty string)
3. Use `--window-title` to target it: `peekaboo(command: "image", args: ["--app", "Google Chrome", "--window-title", "part of title"])`

The `--window-title` flag does substring matching, so you only need a few words from the title.

## Quick reference

### Vision — see what's on screen

```
peekaboo(command: "see")                              # Full screen snapshot
peekaboo(command: "see", args: ["--app", "Safari"])   # Specific app window
peekaboo(command: "see", args: ["--app", "Finder", "--interactive"])  # Only interactive elements
peekaboo(command: "image", args: ["--app", "Safari", "--path", "/tmp/screenshot.png"])  # Save screenshot
peekaboo(command: "list", args: ["apps"])              # List running apps
peekaboo(command: "list", args: ["windows"])           # List all windows
```

### Interaction — click, type, scroll

```
peekaboo(command: "click", args: ["--id", "e5"])                    # Click element by ID from see
peekaboo(command: "click", args: ["--query", "Submit button"])      # Click by description
peekaboo(command: "type", args: ["--text", "Hello world"])          # Type text
peekaboo(command: "type", args: ["--id", "e3", "--text", "Hello"])  # Type into specific element
peekaboo(command: "press", args: ["Return"])                        # Press special key
peekaboo(command: "press", args: ["Tab"])                           # Press Tab
peekaboo(command: "hotkey", args: ["cmd,c"])                        # Copy (Cmd+C)
peekaboo(command: "hotkey", args: ["cmd,shift,t"])                  # Cmd+Shift+T
peekaboo(command: "paste", args: ["--text", "pasted content"])      # Paste via clipboard
peekaboo(command: "scroll", args: ["down", "500"])                  # Scroll down
peekaboo(command: "scroll", args: ["up", "300", "--id", "e2"])      # Scroll element
```

### Windows & Apps

```
peekaboo(command: "app", args: ["launch", "Safari"])           # Launch app
peekaboo(command: "app", args: ["quit", "Safari"])             # Quit app
peekaboo(command: "app", args: ["switch", "Finder"])           # Switch to app
peekaboo(command: "window", args: ["focus", "--app", "Safari"])  # Focus window
peekaboo(command: "window", args: ["minimize", "--app", "Safari"])
peekaboo(command: "window", args: ["maximize", "--app", "Safari"])
peekaboo(command: "window", args: ["close", "--app", "Safari"])
peekaboo(command: "window", args: ["list"])                    # List all windows
```

### Menus & Menu Bar

```
peekaboo(command: "menu", args: ["click", "--app", "Safari", "--path", "File > New Window"])
peekaboo(command: "menu", args: ["list", "--app", "Safari"])
peekaboo(command: "menubar", args: ["list"])                   # Status bar icons
peekaboo(command: "menubar", args: ["click", "--name", "Wi-Fi"])
```

### Spaces & Dock

```
peekaboo(command: "space", args: ["list"])
peekaboo(command: "space", args: ["switch", "2"])
peekaboo(command: "dock", args: ["list"])
peekaboo(command: "dock", args: ["launch", "Safari"])
```

### Drag & Drop

```
peekaboo(command: "drag", args: ["--from-id", "e1", "--to-id", "e5"])
peekaboo(command: "swipe", args: ["--from", "500,500", "--to", "100,500"])
peekaboo(command: "move", args: ["--to", "500,300"])           # Move cursor
```

### Dialogs

```
peekaboo(command: "dialog", args: ["list"])                    # List open dialogs
peekaboo(command: "dialog", args: ["click", "--name", "OK"])   # Click dialog button
peekaboo(command: "dialog", args: ["dismiss"])                 # Dismiss current dialog
```

## Example: Open a URL in Safari and take a screenshot

```
peekaboo(command: "app", args: ["launch", "Safari"])
peekaboo(command: "see", args: ["--app", "Safari"])
# → snapshot shows element IDs, find the URL bar (e.g., e3)
peekaboo(command: "click", args: ["--id", "e3"])
peekaboo(command: "type", args: ["--text", "https://example.com"])
peekaboo(command: "press", args: ["Return"])
peekaboo(command: "sleep", args: ["2000"])
peekaboo(command: "see", args: ["--app", "Safari"])
# → read page content from the snapshot
```

## Example: Check System Settings

```
peekaboo(command: "app", args: ["launch", "System Settings"])
peekaboo(command: "see", args: ["--app", "System Settings", "--interactive"])
# → find the setting you need, click through the UI
```

## Tips

- Always `see` first to get current element IDs — they change after navigation
- Use `--app` to scope to a specific application (faster, less noise)
- Use `--interactive` with `see` to only get clickable/typeable elements
- After clicking or typing, `see` again to verify the result
- For text-heavy pages, the `see` output includes the text content
- Use `sleep` between fast actions if the UI needs time to update
- Peekaboo needs Screen Recording + Accessibility permissions on the host Mac
