/**
 * Stdio MCP Server for NanoClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');
const PEEKABOO_REQUESTS_DIR = path.join(IPC_DIR, 'peekaboo', 'requests');
const PEEKABOO_RESPONSES_DIR = path.join(IPC_DIR, 'peekaboo', 'responses');
const APPLESCRIPT_REQUESTS_DIR = path.join(IPC_DIR, 'applescript', 'requests');
const APPLESCRIPT_RESPONSES_DIR = path.join(IPC_DIR, 'applescript', 'responses');
const OBSIDIAN_REQUESTS_DIR = path.join(IPC_DIR, 'obsidian', 'requests');
const OBSIDIAN_RESPONSES_DIR = path.join(IPC_DIR, 'obsidian', 'responses');

// Context from environment variables (set by the agent runner)
const chatJid = process.env.NANOCLAW_CHAT_JID!;
const groupFolder = process.env.NANOCLAW_GROUP_FOLDER!;
const isMain = process.env.NANOCLAW_IS_MAIN === '1';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.'),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference. To modify an existing task, use update_task instead.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
    schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
    schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
    context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
    target_group_jid: z.string().optional().describe('(Main group only) JID of the group to schedule the task for. Defaults to the current group.'),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (/[Zz]$/.test(args.schedule_value) || /[+-]\d{2}:\d{2}$/.test(args.schedule_value)) {
        return {
          content: [{ type: 'text' as const, text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const data = {
      type: 'schedule_task',
      taskId,
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}` }],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

      if (tasks.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const formatted = tasks
        .map(
          (t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  },
);

server.tool(
  'update_task',
  'Update an existing scheduled task. Only provided fields are changed; omitted fields stay the same.',
  {
    task_id: z.string().describe('The task ID to update'),
    prompt: z.string().optional().describe('New prompt for the task'),
    schedule_type: z.enum(['cron', 'interval', 'once']).optional().describe('New schedule type'),
    schedule_value: z.string().optional().describe('New schedule value (see schedule_task for format)'),
  },
  async (args) => {
    // Validate schedule_value if provided
    if (args.schedule_type === 'cron' || (!args.schedule_type && args.schedule_value)) {
      if (args.schedule_value) {
        try {
          CronExpressionParser.parse(args.schedule_value);
        } catch {
          return {
            content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}".` }],
            isError: true,
          };
        }
      }
    }
    if (args.schedule_type === 'interval' && args.schedule_value) {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}".` }],
          isError: true,
        };
      }
    }

    const data: Record<string, string | undefined> = {
      type: 'update_task',
      taskId: args.task_id,
      groupFolder,
      isMain: String(isMain),
      timestamp: new Date().toISOString(),
    };
    if (args.prompt !== undefined) data.prompt = args.prompt;
    if (args.schedule_type !== undefined) data.schedule_type = args.schedule_type;
    if (args.schedule_value !== undefined) data.schedule_value = args.schedule_value;

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} update requested.` }] };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
  {
    jid: z.string().describe('The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")'),
    name: z.string().describe('Display name for the group'),
    folder: z.string().describe('Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")'),
    trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can register new groups.' }],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Group "${args.name}" registered. It will start receiving messages immediately.` }],
    };
  },
);

server.tool(
  'peekaboo',
  `Control the host Mac's GUI via Peekaboo. Captures screenshots, analyzes UI elements, clicks, types, scrolls, and manages windows/apps/menus on the macOS desktop.

WORKFLOW: Always start with "see" to capture a UI snapshot, then use the element IDs from the snapshot to interact.

COMMON COMMANDS:
• see: Capture and analyze the screen or a specific app window. Returns element IDs you can use with click/type/etc.
• click: Click an element by its ID from a "see" snapshot
• type: Type text, optionally targeting an element
• press: Press special keys (Return, Tab, Escape, etc.)
• hotkey: Key combos like cmd,c or cmd,shift,t
• scroll: Scroll up/down/left/right
• window: Manage windows (close, minimize, maximize, move, resize, focus, list)
• app: Launch, quit, switch, list applications
• menu: Click menu items or list menus
• list: List apps, windows, screens
• image: Save a screenshot to a file

EXAMPLE - Open Safari and search:
1. peekaboo(command: "app", args: ["launch", "Safari"])
2. peekaboo(command: "see", args: ["--app", "Safari"])  → get element IDs
3. peekaboo(command: "click", args: ["--id", "e5"])  → click search bar
4. peekaboo(command: "type", args: ["--text", "hello world"])
5. peekaboo(command: "press", args: ["Return"])

NOTE: This tool bridges to the host macOS via IPC. There is ~1-2 second latency per command. The host must have Peekaboo installed with Screen Recording + Accessibility permissions granted.`,
  {
    command: z.string().describe('Peekaboo subcommand: see, click, type, press, hotkey, scroll, window, app, menu, list, image, paste, swipe, drag, move, menubar, dock, dialog, space, open, sleep, capture, permissions'),
    args: z.array(z.string()).optional().describe('Arguments for the command (e.g., ["--app", "Safari"] for see, ["--id", "e5"] for click, ["--text", "hello"] for type)'),
  },
  async (toolArgs) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const request = {
      requestId,
      command: toolArgs.command,
      args: toolArgs.args || [],
      timestamp: new Date().toISOString(),
    };

    // Write request with requestId as filename so host can match response
    fs.mkdirSync(PEEKABOO_REQUESTS_DIR, { recursive: true });
    const requestPath = path.join(PEEKABOO_REQUESTS_DIR, `${requestId}.json`);
    const tempPath = `${requestPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(request, null, 2));
    fs.renameSync(tempPath, requestPath);

    // Poll for response (timeout after 35 seconds)
    const responsePath = path.join(PEEKABOO_RESPONSES_DIR, `${requestId}.json`);
    const pollInterval = 200;
    const maxWait = 35_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (fs.existsSync(responsePath)) {
        try {
          const response = JSON.parse(fs.readFileSync(responsePath, 'utf-8'));
          // Clean up response file
          try { fs.unlinkSync(responsePath); } catch { /* ignore */ }

          if (response.status === 'error') {
            return {
              content: [{ type: 'text' as const, text: `Peekaboo error: ${response.error}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: response.output || 'Command completed (no output).' }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Failed to parse Peekaboo response: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return {
      content: [{ type: 'text' as const, text: 'Peekaboo command timed out after 35 seconds. The host may not have Peekaboo installed or the IPC handler may not be running.' }],
      isError: true,
    };
  },
);

server.tool(
  'apple_reminders_notes',
  `Create and manage macOS Reminders, Notes, and Apple Music, and send macOS notifications on the host Mac.

COMMANDS:
• notification: Show a macOS notification banner. Params: message (required), title, subtitle, sound (e.g. "Glass", "Ping", "Pop")
• reminders_create: Create a reminder. Params: title (required), list, due_date (ISO local: "2026-03-04T15:30:00"), notes, priority (none/low/medium/high)
• reminders_list: List reminders. Params: list, include_completed (boolean)
• reminders_complete: Mark a reminder done. Params: reminder_id (required)
• reminders_delete: Delete a reminder. Params: reminder_id (required)
• reminders_list_lists: List all reminder lists. No params.
• notes_create: Create a note. Params: title (required), body, folder
• notes_list: List notes. Params: folder, limit (1-100, default 20)
• notes_get: Get a note's content. Params: note_id (required)
• notes_list_folders: List all note folders. No params.
• music_play: Play/resume music. Params: track (search & play), playlist (play playlist). No params = resume.
• music_pause: Pause playback. No params.
• music_stop: Stop playback. No params.
• music_next: Skip to next track. No params.
• music_previous: Go to previous track. No params.
• music_status: Get current playback status, track info, volume, shuffle, repeat. No params.
• music_volume: Get or set volume. Params: level (0-100). No params = get current volume.
• music_search: Search music library. Params: query (required), limit (1-50, default 10).
• music_queue: Add a track to Up Next. Params: track (required, search term).
• music_playlist_list: List all playlists. No params.
• music_playlist_play: Play a playlist. Params: playlist (required), shuffle (boolean).
• music_shuffle: Get or set shuffle. Params: enabled (boolean). No params = get current.
• music_repeat: Set repeat mode. Params: mode (required: "off", "one", "all").

EXAMPLES:
  apple_reminders_notes(command: "notification", params: {message: "Task complete!", title: "NanoClaw", sound: "Glass"})
  apple_reminders_notes(command: "reminders_create", params: {title: "Buy groceries", due_date: "2026-03-04T17:00:00", priority: "high"})
  apple_reminders_notes(command: "notes_create", params: {title: "Meeting Notes", body: "Discussed project timeline"})
  apple_reminders_notes(command: "music_play", params: {track: "Bohemian Rhapsody"})
  apple_reminders_notes(command: "music_status", params: {})
  apple_reminders_notes(command: "music_volume", params: {level: 50})
  apple_reminders_notes(command: "music_search", params: {query: "Taylor Swift"})
  apple_reminders_notes(command: "music_playlist_play", params: {playlist: "Favorites", shuffle: true})

NOTE: This tool bridges to the host macOS via IPC. There is ~1-2 second latency per command.`,
  {
    command: z.string().describe('Command to execute (e.g., "reminders_create", "notes_list")'),
    params: z.record(z.string(), z.unknown()).optional().describe('Parameters for the command (varies by command)'),
  },
  async (toolArgs) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const request = {
      requestId,
      command: toolArgs.command,
      params: toolArgs.params || {},
      timestamp: new Date().toISOString(),
    };

    // Write request with requestId as filename so host can match response
    fs.mkdirSync(APPLESCRIPT_REQUESTS_DIR, { recursive: true });
    const requestPath = path.join(APPLESCRIPT_REQUESTS_DIR, `${requestId}.json`);
    const tempPath = `${requestPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(request, null, 2));
    fs.renameSync(tempPath, requestPath);

    // Poll for response (timeout after 35 seconds)
    const responsePath = path.join(APPLESCRIPT_RESPONSES_DIR, `${requestId}.json`);
    const pollInterval = 200;
    const maxWait = 35_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (fs.existsSync(responsePath)) {
        try {
          const response = JSON.parse(fs.readFileSync(responsePath, 'utf-8'));
          // Clean up response file
          try { fs.unlinkSync(responsePath); } catch { /* ignore */ }

          if (response.status === 'error') {
            return {
              content: [{ type: 'text' as const, text: `AppleScript error: ${response.error}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: response.output || 'Command completed (no output).' }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Failed to parse AppleScript response: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return {
      content: [{ type: 'text' as const, text: 'AppleScript command timed out after 35 seconds. The host IPC handler may not be running.' }],
      isError: true,
    };
  },
);

server.tool(
  'obsidian',
  `Interact with the host Mac's Obsidian vault via CLI. Read, create, search, and manage notes in the user's Obsidian vault.

COMMANDS:
• version: Show Obsidian CLI version. No args needed.
• vaults: List available vaults. Args: ["verbose"] for details.
• files: List files in a vault. Args: ["--vault", "VaultName"]
• create: Create a new note. Args: ["--vault", "VaultName", "--path", "path/to/note.md", "--content", "Note content here"]
• read: Read a note's content. Args: ["--vault", "VaultName", "--path", "path/to/note.md"]
• append: Append content to a note. Args: ["--vault", "VaultName", "--path", "path/to/note.md", "--content", "Content to append"]
• daily: Open or create today's daily note. Args: ["--vault", "VaultName"]
• tasks: List tasks from the vault. Args: ["--vault", "VaultName"]
• search: Search notes. Args: ["--vault", "VaultName", "--query", "search term"]

EXAMPLES:
  obsidian(command: "files", args: ["--vault", "Documents"])
  obsidian(command: "create", args: ["--vault", "Documents", "--path", "Notes/Claw/meeting-notes.md", "--content", "# Meeting Notes\\n..."])
  obsidian(command: "read", args: ["--vault", "Documents", "--path", "Notes/Claw/todo.md"])
  obsidian(command: "search", args: ["--vault", "Documents", "--query", "project deadline"])
  obsidian(command: "append", args: ["--vault", "Documents", "--path", "Notes/Claw/log.md", "--content", "\\n## New Entry\\n..."])

NOTE: This tool bridges to the host macOS via IPC. There is ~1-2 second latency per command. Obsidian desktop app must be running on the host.`,
  {
    command: z.string().describe('Obsidian CLI subcommand: version, vaults, files, create, read, append, daily, tasks, search'),
    args: z.array(z.string()).optional().describe('Arguments for the command (e.g., ["--vault", "Documents", "--path", "Notes/file.md"])'),
  },
  async (toolArgs) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const request = {
      requestId,
      command: toolArgs.command,
      args: toolArgs.args || [],
      timestamp: new Date().toISOString(),
    };

    // Write request with requestId as filename so host can match response
    fs.mkdirSync(OBSIDIAN_REQUESTS_DIR, { recursive: true });
    const requestPath = path.join(OBSIDIAN_REQUESTS_DIR, `${requestId}.json`);
    const tempPath = `${requestPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(request, null, 2));
    fs.renameSync(tempPath, requestPath);

    // Poll for response (timeout after 35 seconds)
    const responsePath = path.join(OBSIDIAN_RESPONSES_DIR, `${requestId}.json`);
    const pollInterval = 200;
    const maxWait = 35_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (fs.existsSync(responsePath)) {
        try {
          const response = JSON.parse(fs.readFileSync(responsePath, 'utf-8'));
          // Clean up response file
          try { fs.unlinkSync(responsePath); } catch { /* ignore */ }

          if (response.status === 'error') {
            return {
              content: [{ type: 'text' as const, text: `Obsidian error: ${response.error}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: response.output || 'Command completed (no output).' }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Failed to parse Obsidian response: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return {
      content: [{ type: 'text' as const, text: 'Obsidian command timed out after 35 seconds. Ensure Obsidian desktop app is running on the host.' }],
      isError: true,
    };
  },
);

// --- Media tools ---

const MEDIA_DIR = '/workspace/media';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

server.tool(
  'get_media',
  `Download a media attachment so you can view it. Call this when you see an <attachment> element in a message and want to see the actual file content.

The tool will request the host to download the file, then return the local path. Use the Read tool to view images, or read file contents.

Example: A message contains <attachment id="whatsapp:media:1709123456789-abc123" name="photo.jpg" type="image/jpeg" />
→ Call get_media with media_id="whatsapp:media:1709123456789-abc123"
→ Returns path like /workspace/media/1709123456789-abc123.jpg
→ Use Read tool on that path to view the image`,
  {
    media_id: z.string().describe('The media attachment ID from the <attachment> element'),
  },
  async (args) => {
    const mediaId = args.media_id;
    // Extract uid from "channel:media:uid" format
    const parts = mediaId.split(':');
    if (parts.length < 3) {
      return {
        content: [{ type: 'text' as const, text: `Invalid media ID format: ${mediaId}. Expected "channel:media:uid".` }],
        isError: true,
      };
    }
    const uid = parts.slice(2).join(':');

    // Check if already downloaded
    const existingFiles = fs.existsSync(MEDIA_DIR)
      ? fs.readdirSync(MEDIA_DIR).filter((f) => f.startsWith(`${uid}.`) && !f.endsWith('.error') && !f.endsWith('.downloading'))
      : [];

    if (existingFiles.length > 0) {
      const filePath = path.join(MEDIA_DIR, existingFiles[0]);
      return {
        content: [{ type: 'text' as const, text: `Media already downloaded: ${filePath}` }],
      };
    }

    // Write IPC download request
    writeIpcFile(TASKS_DIR, {
      type: 'media_download',
      mediaId,
      groupFolder,
      timestamp: new Date().toISOString(),
    });

    // Opt 1: Exponential backoff polling (100ms start, 2x, 2000ms cap)
    const timeout = 30_000;
    const start = Date.now();
    let interval = 100;
    const maxInterval = 2000;

    while (Date.now() - start < timeout) {
      await sleep(interval);
      interval = Math.min(interval * 2, maxInterval);

      if (!fs.existsSync(MEDIA_DIR)) continue;
      const files = fs.readdirSync(MEDIA_DIR).filter(
        (f) => f.startsWith(`${uid}.`),
      );
      // Check for error sentinel first
      const errorFile = files.find((f) => f.endsWith('.error'));
      if (errorFile) {
        const errMsg = fs.readFileSync(path.join(MEDIA_DIR, errorFile), 'utf-8');
        return {
          content: [{ type: 'text' as const, text: `Media download failed: ${errMsg}` }],
          isError: true,
        };
      }
      // Check for actual media file (skip .downloading sentinels)
      const mediaFile = files.find((f) => !f.endsWith('.error') && !f.endsWith('.downloading'));
      if (mediaFile) {
        const filePath = path.join(MEDIA_DIR, mediaFile);
        return {
          content: [{ type: 'text' as const, text: `Media downloaded: ${filePath}` }],
        };
      }
    }

    return {
      content: [{ type: 'text' as const, text: `Timeout waiting for media download: ${mediaId}` }],
      isError: true,
    };
  },
);

server.tool(
  'send_media',
  `Send a file or image to the current chat. Use this to share files, images, or documents you've created or downloaded.

The file must be under /workspace/. Provide the full path to the file.

Examples:
- Send a generated chart: send_media(file_path="/workspace/group/chart.png", caption="Here's the chart")
- Send a document: send_media(file_path="/workspace/group/report.pdf", filename="Monthly Report.pdf")`,
  {
    file_path: z.string().describe('Path to the file to send (must be under /workspace/)'),
    caption: z.string().optional().describe('Optional caption to send with the file'),
    filename: z.string().optional().describe('Optional display filename (defaults to actual filename)'),
  },
  async (args) => {
    // Validate file path is under /workspace/
    if (!args.file_path.startsWith('/workspace/')) {
      return {
        content: [{ type: 'text' as const, text: 'File path must be under /workspace/.' }],
        isError: true,
      };
    }

    // Validate file exists
    if (!fs.existsSync(args.file_path)) {
      return {
        content: [{ type: 'text' as const, text: `File not found: ${args.file_path}` }],
        isError: true,
      };
    }

    writeIpcFile(TASKS_DIR, {
      type: 'media_message',
      containerFilePath: args.file_path,
      caption: args.caption,
      filename: args.filename || path.basename(args.file_path),
      chatJid,
      groupFolder,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [{ type: 'text' as const, text: `Media send requested: ${args.filename || path.basename(args.file_path)}` }],
    };
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
