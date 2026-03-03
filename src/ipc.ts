import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import { DATA_DIR, IPC_POLL_INTERVAL, TIMEZONE } from './config.js';
import {
  ALLOWED_APPLESCRIPT_COMMANDS,
  buildAppleScript,
} from './applescript-templates.js';
import { AvailableGroup } from './container-runner.js';
import { createTask, deleteTask, getTaskById, updateTask } from './db.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

// Peekaboo command timeout (30 seconds)
const PEEKABOO_TIMEOUT = 30_000;

// AppleScript command timeout (30 seconds)
const APPLESCRIPT_TIMEOUT = 30_000;

// Allowed peekaboo subcommands (whitelist for security)
const ALLOWED_PEEKABOO_COMMANDS = new Set([
  'see',
  'image',
  'click',
  'type',
  'press',
  'hotkey',
  'paste',
  'scroll',
  'swipe',
  'drag',
  'move',
  'window',
  'space',
  'menu',
  'menubar',
  'app',
  'open',
  'dock',
  'dialog',
  'list',
  'sleep',
  'capture',
  'permissions',
]);

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredGroups = deps.registeredGroups();

    // Build folder→isMain lookup from registered groups
    const folderIsMain = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) folderIsMain.set(group.folder, true);
    }

    for (const sourceGroup of groupFolders) {
      const isMain = folderIsMain.get(sourceGroup) === true;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await deps.sendMessage(data.chatJid, data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }

      // Process Peekaboo requests from this group's IPC directory
      const peekabooRequestsDir = path.join(
        ipcBaseDir,
        sourceGroup,
        'peekaboo',
        'requests',
      );
      try {
        if (fs.existsSync(peekabooRequestsDir)) {
          const requestFiles = fs
            .readdirSync(peekabooRequestsDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of requestFiles) {
            const filePath = path.join(peekabooRequestsDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              fs.unlinkSync(filePath);
              // Process asynchronously — don't block the poll loop
              processPeekabooRequest(
                data,
                sourceGroup,
                path.join(ipcBaseDir, sourceGroup, 'peekaboo', 'responses'),
              );
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error reading Peekaboo request',
              );
              try {
                fs.unlinkSync(filePath);
              } catch {
                // ignore cleanup error
              }
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading Peekaboo requests directory',
        );
      }

      // Process AppleScript requests from this group's IPC directory
      const applescriptRequestsDir = path.join(
        ipcBaseDir,
        sourceGroup,
        'applescript',
        'requests',
      );
      try {
        if (fs.existsSync(applescriptRequestsDir)) {
          const requestFiles = fs
            .readdirSync(applescriptRequestsDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of requestFiles) {
            const filePath = path.join(applescriptRequestsDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              fs.unlinkSync(filePath);
              // Process asynchronously — don't block the poll loop
              processAppleScriptRequest(
                data,
                sourceGroup,
                path.join(ipcBaseDir, sourceGroup, 'applescript', 'responses'),
              );
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error reading AppleScript request',
              );
              try {
                fs.unlinkSync(filePath);
              } catch {
                // ignore cleanup error
              }
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading AppleScript requests directory',
        );
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

function processPeekabooRequest(
  data: { requestId: string; command: string; args?: string[] },
  sourceGroup: string,
  responsesDir: string,
): void {
  const { requestId, command, args = [] } = data;

  if (!requestId || !command) {
    logger.warn({ sourceGroup, data }, 'Invalid Peekaboo request — missing fields');
    return;
  }

  // Security: only allow whitelisted subcommands
  if (!ALLOWED_PEEKABOO_COMMANDS.has(command)) {
    logger.warn(
      { sourceGroup, command },
      'Blocked disallowed Peekaboo command',
    );
    writeResponse(responsesDir, requestId, {
      requestId,
      status: 'error',
      error: `Command "${command}" is not allowed. Allowed: ${[...ALLOWED_PEEKABOO_COMMANDS].join(', ')}`,
    });
    return;
  }

  // Security: reject args containing shell metacharacters
  for (const arg of args) {
    if (/[;&|`$(){}]/.test(arg)) {
      logger.warn(
        { sourceGroup, command, arg },
        'Blocked Peekaboo arg with shell metacharacters',
      );
      writeResponse(responsesDir, requestId, {
        requestId,
        status: 'error',
        error: `Argument contains disallowed characters: ${arg}`,
      });
      return;
    }
  }

  logger.info(
    { sourceGroup, command, args },
    'Executing Peekaboo command on host',
  );

  // Always request JSON output for structured responses
  const fullArgs = [command, ...args];
  if (!fullArgs.includes('--json') && !fullArgs.includes('--json-output')) {
    fullArgs.push('--json');
  }

  execFile('peekaboo', fullArgs, { timeout: PEEKABOO_TIMEOUT }, (err, stdout, stderr) => {
    // Peekaboo writes errors to stdout as JSON (not stderr).
    // Some commands exit non-zero but still produce valid output.
    // Check stdout for structured error info before falling back to stderr.
    if (err) {
      // If stdout has JSON output, it may contain useful data or error details
      if (stdout && stdout.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.success === false && parsed.error) {
            logger.warn(
              { sourceGroup, command, error: parsed.error },
              'Peekaboo command returned error',
            );
            writeResponse(responsesDir, requestId, {
              requestId,
              status: 'error',
              error: parsed.error.message || JSON.stringify(parsed.error),
            });
            return;
          }
          // Non-zero exit but has valid output — treat as success
          logger.info(
            { sourceGroup, command, outputLength: stdout.length },
            'Peekaboo command completed (non-zero exit, valid output)',
          );
          writeResponse(responsesDir, requestId, {
            requestId,
            status: 'success',
            output: stdout,
          });
          return;
        } catch {
          // JSON parse failed, fall through to generic error
        }
      }

      logger.error(
        { sourceGroup, command, err, stderr, stdoutPreview: stdout.slice(0, 500) },
        'Peekaboo command failed',
      );
      writeResponse(responsesDir, requestId, {
        requestId,
        status: 'error',
        error: stderr || stdout.slice(0, 500) || (err instanceof Error ? err.message : String(err)),
      });
      return;
    }

    logger.info(
      { sourceGroup, command, outputLength: stdout.length },
      'Peekaboo command completed',
    );
    writeResponse(responsesDir, requestId, {
      requestId,
      status: 'success',
      output: stdout,
    });
  });
}

function processAppleScriptRequest(
  data: { requestId: string; command: string; params?: Record<string, unknown> },
  sourceGroup: string,
  responsesDir: string,
): void {
  const { requestId, command, params = {} } = data;

  if (!requestId || !command) {
    logger.warn({ sourceGroup, data }, 'Invalid AppleScript request — missing fields');
    return;
  }

  // Security: only allow whitelisted commands
  if (!ALLOWED_APPLESCRIPT_COMMANDS.has(command)) {
    logger.warn(
      { sourceGroup, command },
      'Blocked disallowed AppleScript command',
    );
    writeResponse(responsesDir, requestId, {
      requestId,
      status: 'error',
      error: `Command "${command}" is not allowed. Allowed: ${[...ALLOWED_APPLESCRIPT_COMMANDS].join(', ')}`,
    });
    return;
  }

  let scriptLines: string[];
  try {
    scriptLines = buildAppleScript(command, params);
  } catch (err) {
    logger.warn(
      { sourceGroup, command, err },
      'AppleScript template build failed',
    );
    writeResponse(responsesDir, requestId, {
      requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  logger.info(
    { sourceGroup, command },
    'Executing AppleScript command on host',
  );

  // Build -e args: one per line of AppleScript
  const osascriptArgs = scriptLines.flatMap((line) => ['-e', line]);

  execFile(
    '/usr/bin/osascript',
    osascriptArgs,
    { timeout: APPLESCRIPT_TIMEOUT },
    (err, stdout, stderr) => {
      if (err) {
        logger.error(
          { sourceGroup, command, err, stderr },
          'AppleScript command failed',
        );
        writeResponse(responsesDir, requestId, {
          requestId,
          status: 'error',
          error: stderr || (err instanceof Error ? err.message : String(err)),
        });
        return;
      }

      logger.info(
        { sourceGroup, command, outputLength: stdout.length },
        'AppleScript command completed',
      );
      writeResponse(responsesDir, requestId, {
        requestId,
        status: 'success',
        output: stdout,
      });
    },
  );
}

function writeResponse(
  responsesDir: string,
  requestId: string,
  data: object,
): void {
  fs.mkdirSync(responsesDir, { recursive: true });
  const tempPath = path.join(responsesDir, `${requestId}.json.tmp`);
  const finalPath = path.join(responsesDir, `${requestId}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, finalPath);
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        // Write updated snapshot immediately
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        // Defense in depth: agent cannot set isMain via IPC
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
