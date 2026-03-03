---
name: apple-reminders-notes
description: Create and manage macOS Reminders and Notes on the host Mac. Use when the user asks to create reminders, to-do items, notes, or wants to check their reminders/notes lists.
---

# macOS Reminders & Notes

You can create and manage Reminders and Notes on the host Mac through the `apple_reminders_notes` MCP tool. Commands are bridged via IPC with ~1-2 second latency.

## Reminders

### Create a reminder

```
apple_reminders_notes(command: "reminders_create", params: {
  title: "Buy groceries",
  due_date: "2026-03-04T17:00:00",
  priority: "high",
  list: "Shopping",
  notes: "Get milk, eggs, bread"
})
```

Parameters:
- `title` (required) — reminder title
- `list` — target list name (defaults to default list)
- `due_date` — ISO local format: `YYYY-MM-DDTHH:MM:SS` (no timezone suffix)
- `notes` — additional notes text
- `priority` — `none`, `low`, `medium`, or `high`

### List reminders

```
apple_reminders_notes(command: "reminders_list", params: {list: "Shopping"})
apple_reminders_notes(command: "reminders_list", params: {include_completed: true})
```

Returns tab-separated: `id \t name \t completed \t due_date \t priority`

### Complete a reminder

```
apple_reminders_notes(command: "reminders_complete", params: {reminder_id: "x-apple-reminder://..."})
```

### Delete a reminder

```
apple_reminders_notes(command: "reminders_delete", params: {reminder_id: "x-apple-reminder://..."})
```

### List all reminder lists

```
apple_reminders_notes(command: "reminders_list_lists")
```

Returns tab-separated: `id \t name`

## Notes

### Create a note

```
apple_reminders_notes(command: "notes_create", params: {
  title: "Meeting Notes",
  body: "Discussed project timeline\nAction items:\n- Review PRs\n- Update docs",
  folder: "Work"
})
```

Parameters:
- `title` (required) — note title
- `body` — note content (plain text, newlines become line breaks)
- `folder` — target folder name (defaults to default folder)

### List notes

```
apple_reminders_notes(command: "notes_list", params: {folder: "Work", limit: 10})
```

Returns tab-separated: `id \t name \t modification_date`

### Get a note's content

```
apple_reminders_notes(command: "notes_get", params: {note_id: "x-coredata://..."})
```

Returns the note title, plaintext body, and modification date.

### List note folders

```
apple_reminders_notes(command: "notes_list_folders")
```

Returns tab-separated: `id \t name`

## Tips

- Due dates use local time — no `Z` suffix needed
- Use `reminders_list_lists` or `notes_list_folders` to discover available lists/folders
- The `reminder_id` and `note_id` come from the list commands — use those IDs for complete/delete/get
- Priority mapping: none=0, low=9, medium=5, high=1 (Apple's scale)
