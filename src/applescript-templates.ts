/**
 * AppleScript template builders for macOS Reminders & Notes
 *
 * Security model: only whitelisted commands with hardcoded templates.
 * All string params are escaped before interpolation into AppleScript.
 */

// ---------- String escaping ----------

/** Escape a string for safe interpolation inside AppleScript double-quoted strings. */
export function escapeAppleScriptString(str: string): string {
  // Strip control chars (except newline/tab) that can't appear in AS strings
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Minimal HTML escaping for Notes body content. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Param validation ----------

export function validateStringParam(
  params: Record<string, unknown>,
  key: string,
  maxLen: number,
  required: boolean,
): string | undefined {
  const val = params[key];
  if (val === undefined || val === null) {
    if (required) throw new Error(`Missing required parameter: ${key}`);
    return undefined;
  }
  if (typeof val !== 'string')
    throw new Error(`Parameter "${key}" must be a string`);
  if (val.length > maxLen)
    throw new Error(`Parameter "${key}" exceeds max length of ${maxLen}`);
  return val;
}

function validateNumberParam(
  params: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  required: boolean,
): number | undefined {
  const val = params[key];
  if (val === undefined || val === null) {
    if (required) throw new Error(`Missing required parameter: ${key}`);
    return undefined;
  }
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) throw new Error(`Parameter "${key}" must be a number`);
  if (num < min || num > max)
    throw new Error(`Parameter "${key}" must be between ${min} and ${max}`);
  return num;
}

function validateBooleanParam(
  params: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const val = params[key];
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  throw new Error(`Parameter "${key}" must be a boolean`);
}

// ---------- Allowed commands ----------

export const ALLOWED_APPLESCRIPT_COMMANDS = new Set([
  'notification',
  'reminders_create',
  'reminders_list',
  'reminders_complete',
  'reminders_delete',
  'reminders_list_lists',
  'notes_create',
  'notes_list',
  'notes_get',
  'notes_list_folders',
  'music_play',
  'music_pause',
  'music_stop',
  'music_next',
  'music_previous',
  'music_status',
  'music_volume',
  'music_search',
  'music_queue',
  'music_playlist_list',
  'music_playlist_play',
  'music_shuffle',
  'music_repeat',
]);

// ---------- Priority mapping ----------

const PRIORITY_MAP: Record<string, number> = {
  none: 0,
  low: 9,
  medium: 5,
  high: 1,
};

// ---------- Template builders ----------

function buildRemindersCreate(params: Record<string, unknown>): string[] {
  const title = validateStringParam(params, 'title', 500, true)!;
  const list = validateStringParam(params, 'list', 200, false);
  const dueDate = validateStringParam(params, 'due_date', 30, false);
  const notes = validateStringParam(params, 'notes', 2000, false);
  const priorityStr = validateStringParam(params, 'priority', 10, false);

  const escaped = escapeAppleScriptString(title);
  const lines: string[] = ['tell application "Reminders"'];

  const listRef = list
    ? `list "${escapeAppleScriptString(list)}"`
    : 'default list';

  const props: string[] = [`name:"${escaped}"`];

  if (dueDate) {
    // Parse ISO local date: 2026-03-04T15:30:00
    const match = dueDate.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!match)
      throw new Error(
        `Invalid due_date format: "${dueDate}". Use ISO local: YYYY-MM-DDTHH:MM:SS`,
      );
    const [, yr, mo, dy, hr, mn, sc] = match;
    // Use locale-safe date components
    lines.push(`set dueD to current date`);
    lines.push(`set year of dueD to ${Number(yr)}`);
    lines.push(`set month of dueD to ${Number(mo)}`);
    lines.push(`set day of dueD to ${Number(dy)}`);
    lines.push(`set hours of dueD to ${Number(hr || 0)}`);
    lines.push(`set minutes of dueD to ${Number(mn || 0)}`);
    lines.push(`set seconds of dueD to ${Number(sc || 0)}`);
    props.push('due date:dueD');
  }

  if (notes) {
    props.push(`body:"${escapeAppleScriptString(notes)}"`);
  }

  if (priorityStr) {
    const p = PRIORITY_MAP[priorityStr.toLowerCase()];
    if (p === undefined)
      throw new Error(
        `Invalid priority: "${priorityStr}". Use: none, low, medium, high`,
      );
    if (p > 0) props.push(`priority:${p}`);
  }

  lines.push(
    `set newReminder to make new reminder in ${listRef} with properties {${props.join(', ')}}`,
  );
  lines.push(`return id of newReminder`);
  lines.push('end tell');
  return lines;
}

function buildRemindersList(params: Record<string, unknown>): string[] {
  const list = validateStringParam(params, 'list', 200, false);
  const includeCompleted =
    validateBooleanParam(params, 'include_completed') ?? false;

  const lines: string[] = ['tell application "Reminders"'];

  const listRef = list
    ? `list "${escapeAppleScriptString(list)}"`
    : 'default list';

  if (includeCompleted) {
    lines.push(`set rems to every reminder of ${listRef}`);
  } else {
    lines.push(
      `set rems to (every reminder of ${listRef} whose completed is false)`,
    );
  }

  lines.push('set output to ""');
  lines.push('repeat with r in rems');
  lines.push('set rId to id of r');
  lines.push('set rName to name of r');
  lines.push('set rDone to completed of r');
  lines.push('set rPrio to priority of r');
  lines.push('try');
  lines.push('set rDue to due date of r as string');
  lines.push('on error');
  lines.push('set rDue to "none"');
  lines.push('end try');
  lines.push(
    'set output to output & rId & "\\t" & rName & "\\t" & rDone & "\\t" & rDue & "\\t" & rPrio & "\\n"',
  );
  lines.push('end repeat');
  lines.push('return output');
  lines.push('end tell');
  return lines;
}

function buildRemindersComplete(params: Record<string, unknown>): string[] {
  const reminderId = validateStringParam(params, 'reminder_id', 200, true)!;
  if (!/^[A-Za-z0-9\-:\/]+$/.test(reminderId))
    throw new Error('Invalid reminder_id format');

  return [
    'tell application "Reminders"',
    `set r to first reminder whose id is "${escapeAppleScriptString(reminderId)}"`,
    'set completed of r to true',
    'return "completed"',
    'end tell',
  ];
}

function buildRemindersDelete(params: Record<string, unknown>): string[] {
  const reminderId = validateStringParam(params, 'reminder_id', 200, true)!;
  if (!/^[A-Za-z0-9\-:\/]+$/.test(reminderId))
    throw new Error('Invalid reminder_id format');

  return [
    'tell application "Reminders"',
    `set r to first reminder whose id is "${escapeAppleScriptString(reminderId)}"`,
    'delete r',
    'return "deleted"',
    'end tell',
  ];
}

function buildRemindersListLists(): string[] {
  return [
    'tell application "Reminders"',
    'set output to ""',
    'repeat with l in every list',
    'set output to output & id of l & "\\t" & name of l & "\\n"',
    'end repeat',
    'return output',
    'end tell',
  ];
}

function buildNotesCreate(params: Record<string, unknown>): string[] {
  const title = validateStringParam(params, 'title', 500, true)!;
  const body = validateStringParam(params, 'body', 10000, false);
  const folder = validateStringParam(params, 'folder', 200, false);

  const escapedTitle = escapeAppleScriptString(title);

  // Notes uses HTML for body content
  const htmlBody = body
    ? `<h1>${escapeHtml(title)}</h1><br>${escapeHtml(body).replace(/\n/g, '<br>')}`
    : `<h1>${escapeHtml(title)}</h1>`;

  const lines: string[] = ['tell application "Notes"'];

  if (folder) {
    lines.push(
      `set targetFolder to folder "${escapeAppleScriptString(folder)}" of default account`,
    );
    lines.push(
      `set newNote to make new note at targetFolder with properties {name:"${escapedTitle}", body:"${escapeAppleScriptString(htmlBody)}"}`,
    );
  } else {
    lines.push(
      `set newNote to make new note with properties {name:"${escapedTitle}", body:"${escapeAppleScriptString(htmlBody)}"}`,
    );
  }

  lines.push('return id of newNote');
  lines.push('end tell');
  return lines;
}

function buildNotesList(params: Record<string, unknown>): string[] {
  const folder = validateStringParam(params, 'folder', 200, false);
  const limit = validateNumberParam(params, 'limit', 1, 100, false) ?? 20;

  const lines: string[] = ['tell application "Notes"'];

  if (folder) {
    lines.push(
      `set noteList to every note of folder "${escapeAppleScriptString(folder)}" of default account`,
    );
  } else {
    lines.push('set noteList to every note of default account');
  }

  lines.push('set output to ""');
  lines.push('set counter to 0');
  lines.push('repeat with n in noteList');
  lines.push(`if counter >= ${limit} then exit repeat`);
  lines.push('set nId to id of n');
  lines.push('set nName to name of n');
  lines.push('set nDate to modification date of n as string');
  lines.push(
    'set output to output & nId & "\\t" & nName & "\\t" & nDate & "\\n"',
  );
  lines.push('set counter to counter + 1');
  lines.push('end repeat');
  lines.push('return output');
  lines.push('end tell');
  return lines;
}

function buildNotesGet(params: Record<string, unknown>): string[] {
  const noteId = validateStringParam(params, 'note_id', 200, true)!;
  if (!/^[A-Za-z0-9\-:\/x]+$/.test(noteId))
    throw new Error('Invalid note_id format');

  return [
    'tell application "Notes"',
    `set n to first note whose id is "${escapeAppleScriptString(noteId)}"`,
    'set nName to name of n',
    'set nBody to plaintext of n',
    'set nDate to modification date of n as string',
    'return nName & "\\n---\\n" & nBody & "\\n---\\nModified: " & nDate',
    'end tell',
  ];
}

function buildNotesListFolders(): string[] {
  return [
    'tell application "Notes"',
    'set output to ""',
    'repeat with f in every folder of default account',
    'set output to output & id of f & "\\t" & name of f & "\\n"',
    'end repeat',
    'return output',
    'end tell',
  ];
}

// ---------- Apple Music ----------

function buildMusicPlay(params: Record<string, unknown>): string[] {
  const track = validateStringParam(params, 'track', 500, false);
  const playlist = validateStringParam(params, 'playlist', 200, false);

  const lines: string[] = ['tell application "Music"'];
  if (track) {
    lines.push(
      `set results to (search playlist "Library" for "${escapeAppleScriptString(track)}")`,
    );
    lines.push('if (count of results) > 0 then');
    lines.push('play item 1 of results');
    lines.push('set t to item 1 of results');
    lines.push('return "Playing: " & name of t & " by " & artist of t');
    lines.push('else');
    lines.push(`return "No tracks found for: ${escapeAppleScriptString(track)}"`);
    lines.push('end if');
  } else if (playlist) {
    lines.push(
      `play playlist "${escapeAppleScriptString(playlist)}"`,
    );
    lines.push(`return "Playing playlist: ${escapeAppleScriptString(playlist)}"`);
  } else {
    lines.push('play');
    lines.push('return "Playback resumed"');
  }
  lines.push('end tell');
  return lines;
}

function buildMusicPause(): string[] {
  return [
    'tell application "Music"',
    'pause',
    'return "Paused"',
    'end tell',
  ];
}

function buildMusicStop(): string[] {
  return [
    'tell application "Music"',
    'stop',
    'return "Stopped"',
    'end tell',
  ];
}

function buildMusicNext(): string[] {
  return [
    'tell application "Music"',
    'next track',
    'delay 0.5',
    'set t to current track',
    'return "Now playing: " & name of t & " by " & artist of t & " (" & album of t & ")"',
    'end tell',
  ];
}

function buildMusicPrevious(): string[] {
  return [
    'tell application "Music"',
    'previous track',
    'delay 0.5',
    'set t to current track',
    'return "Now playing: " & name of t & " by " & artist of t & " (" & album of t & ")"',
    'end tell',
  ];
}

function buildMusicStatus(): string[] {
  return [
    'tell application "Music"',
    'set pState to player state as string',
    'if pState is "stopped" then',
    'return "Player state: stopped"',
    'end if',
    'set t to current track',
    'set tName to name of t',
    'set tArtist to artist of t',
    'set tAlbum to album of t',
    'set tDuration to duration of t',
    'set tPosition to player position',
    'set vol to sound volume',
    'set shuf to shuffling',
    'set rep to song repeat as string',
    'set mins to (tPosition div 60) as integer',
    'set secs to (tPosition mod 60) as integer',
    'set totalMins to (tDuration div 60) as integer',
    'set totalSecs to (tDuration mod 60) as integer',
    'if secs < 10 then set secs to "0" & secs',
    'if totalSecs < 10 then set totalSecs to "0" & totalSecs',
    'return "State: " & pState & "\\nTrack: " & tName & "\\nArtist: " & tArtist & "\\nAlbum: " & tAlbum & "\\nPosition: " & mins & ":" & secs & " / " & totalMins & ":" & totalSecs & "\\nVolume: " & vol & "\\nShuffle: " & shuf & "\\nRepeat: " & rep',
    'end tell',
  ];
}

function buildMusicVolume(params: Record<string, unknown>): string[] {
  const level = validateNumberParam(params, 'level', 0, 100, false);

  const lines: string[] = ['tell application "Music"'];
  if (level !== undefined) {
    lines.push(`set sound volume to ${level}`);
    lines.push(`return "Volume set to ${level}"`);
  } else {
    lines.push('return "Volume: " & sound volume');
  }
  lines.push('end tell');
  return lines;
}

function buildMusicSearch(params: Record<string, unknown>): string[] {
  const query = validateStringParam(params, 'query', 200, true)!;
  const limit = validateNumberParam(params, 'limit', 1, 50, false) ?? 10;

  return [
    'tell application "Music"',
    `set results to (search playlist "Library" for "${escapeAppleScriptString(query)}")`,
    'set output to ""',
    'set counter to 0',
    'repeat with t in results',
    `if counter >= ${limit} then exit repeat`,
    'set output to output & name of t & "\\t" & artist of t & "\\t" & album of t & "\\t" & (duration of t div 60) & ":" & text -2 thru -1 of ("0" & (duration of t mod 60 as integer)) & "\\n"',
    'set counter to counter + 1',
    'end repeat',
    'if output is "" then return "No results found."',
    'return output',
    'end tell',
  ];
}

function buildMusicQueue(params: Record<string, unknown>): string[] {
  const track = validateStringParam(params, 'track', 500, true)!;

  return [
    'tell application "Music"',
    `set results to (search playlist "Library" for "${escapeAppleScriptString(track)}")`,
    'if (count of results) > 0 then',
    'set t to item 1 of results',
    // "play ... with once" adds to Up Next without interrupting
    'play t with once',
    'return "Added to Up Next: " & name of t & " by " & artist of t',
    'else',
    `return "No tracks found for: ${escapeAppleScriptString(track)}"`,
    'end if',
    'end tell',
  ];
}

function buildMusicPlaylistList(): string[] {
  return [
    'tell application "Music"',
    'set output to ""',
    'repeat with p in every user playlist',
    'set pName to name of p',
    'set pCount to count of tracks of p',
    'set pDur to duration of p',
    'set output to output & pName & "\\t" & pCount & " tracks\\t" & (pDur div 60) & " min\\n"',
    'end repeat',
    'if output is "" then return "No playlists found."',
    'return output',
    'end tell',
  ];
}

function buildMusicPlaylistPlay(params: Record<string, unknown>): string[] {
  const playlist = validateStringParam(params, 'playlist', 200, true)!;
  const shuffle = validateBooleanParam(params, 'shuffle');

  const lines: string[] = ['tell application "Music"'];
  if (shuffle !== undefined) {
    lines.push(`set shuffling to ${shuffle}`);
  }
  lines.push(`play playlist "${escapeAppleScriptString(playlist)}"`);
  lines.push(`return "Playing playlist: ${escapeAppleScriptString(playlist)}"`);
  lines.push('end tell');
  return lines;
}

function buildMusicShuffle(params: Record<string, unknown>): string[] {
  const enabled = validateBooleanParam(params, 'enabled');

  const lines: string[] = ['tell application "Music"'];
  if (enabled !== undefined) {
    lines.push(`set shuffling to ${enabled}`);
    lines.push(`return "Shuffle: ${enabled}"`);
  } else {
    lines.push('return "Shuffle: " & shuffling');
  }
  lines.push('end tell');
  return lines;
}

function buildMusicRepeat(params: Record<string, unknown>): string[] {
  const mode = validateStringParam(params, 'mode', 10, true)!;
  const validModes: Record<string, string> = {
    off: 'off',
    one: 'one',
    all: 'all',
  };
  const asMode = validModes[mode.toLowerCase()];
  if (!asMode) {
    throw new Error(`Invalid repeat mode: "${mode}". Use: off, one, all`);
  }

  return [
    'tell application "Music"',
    `set song repeat to ${asMode}`,
    `return "Repeat: ${asMode}"`,
    'end tell',
  ];
}

// ---------- Notification ----------

function buildNotification(params: Record<string, unknown>): string[] {
  const message = validateStringParam(params, 'message', 500, true)!;
  const title = validateStringParam(params, 'title', 200, false);
  const subtitle = validateStringParam(params, 'subtitle', 200, false);
  const sound = validateStringParam(params, 'sound', 50, false);

  let script = `display notification "${escapeAppleScriptString(message)}"`;
  if (title) script += ` with title "${escapeAppleScriptString(title)}"`;
  if (subtitle) script += ` subtitle "${escapeAppleScriptString(subtitle)}"`;
  if (sound) script += ` sound name "${escapeAppleScriptString(sound)}"`;

  return [script];
}

// ---------- Main dispatcher ----------

export function buildAppleScript(
  command: string,
  params: Record<string, unknown>,
): string[] {
  switch (command) {
    case 'notification':
      return buildNotification(params);
    case 'reminders_create':
      return buildRemindersCreate(params);
    case 'reminders_list':
      return buildRemindersList(params);
    case 'reminders_complete':
      return buildRemindersComplete(params);
    case 'reminders_delete':
      return buildRemindersDelete(params);
    case 'reminders_list_lists':
      return buildRemindersListLists();
    case 'notes_create':
      return buildNotesCreate(params);
    case 'notes_list':
      return buildNotesList(params);
    case 'notes_get':
      return buildNotesGet(params);
    case 'notes_list_folders':
      return buildNotesListFolders();
    case 'music_play':
      return buildMusicPlay(params);
    case 'music_pause':
      return buildMusicPause();
    case 'music_stop':
      return buildMusicStop();
    case 'music_next':
      return buildMusicNext();
    case 'music_previous':
      return buildMusicPrevious();
    case 'music_status':
      return buildMusicStatus();
    case 'music_volume':
      return buildMusicVolume(params);
    case 'music_search':
      return buildMusicSearch(params);
    case 'music_queue':
      return buildMusicQueue(params);
    case 'music_playlist_list':
      return buildMusicPlaylistList();
    case 'music_playlist_play':
      return buildMusicPlaylistPlay(params);
    case 'music_shuffle':
      return buildMusicShuffle(params);
    case 'music_repeat':
      return buildMusicRepeat(params);
    default:
      throw new Error(`Unknown AppleScript command: ${command}`);
  }
}
