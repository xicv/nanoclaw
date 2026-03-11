import { execFile } from 'child_process';
import os from 'os';

import { escapeAppleScriptString } from './applescript-templates.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { Channel } from './types.js';

const envConfig = readEnvFile([
  'NOTIFICATION_TELEGRAM_CHAT_ID',
  'NOTIFICATION_TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'NOTIFICATION_MACOS',
]);

const TELEGRAM_CHAT_ID =
  process.env.NOTIFICATION_TELEGRAM_CHAT_ID ||
  envConfig.NOTIFICATION_TELEGRAM_CHAT_ID ||
  '';

const TELEGRAM_BOT_TOKEN =
  process.env.NOTIFICATION_TELEGRAM_BOT_TOKEN ||
  envConfig.NOTIFICATION_TELEGRAM_BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN ||
  envConfig.TELEGRAM_BOT_TOKEN ||
  '';

const MACOS_ENABLED =
  (process.env.NOTIFICATION_MACOS || envConfig.NOTIFICATION_MACOS || 'true') ===
  'true';

let groupNameResolver: (jid: string) => string = (jid) => jid;

export function setGroupNameResolver(fn: (jid: string) => string): void {
  groupNameResolver = fn;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function notifyTelegram(groupName: string, text: string): Promise<void> {
  if (!TELEGRAM_CHAT_ID || !TELEGRAM_BOT_TOKEN) return;

  const body = truncate(text, 4000);
  const message = `[${groupName}] ${body}`;

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        disable_notification: false,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn({ status: res.status, body }, 'Telegram notification failed');
  }
}

async function notifyMacOS(groupName: string, text: string): Promise<void> {
  if (!MACOS_ENABLED || os.platform() !== 'darwin') return;

  const preview = truncate(text, 100);
  const escaped = escapeAppleScriptString(preview);
  const escapedGroup = escapeAppleScriptString(groupName);

  return new Promise<void>((resolve) => {
    execFile(
      '/usr/bin/osascript',
      [
        '-e',
        `display notification "${escaped}" with title "NanoClaw" subtitle "${escapedGroup}" sound name "Tink"`,
      ],
      (err) => {
        if (err) {
          logger.warn({ err }, 'macOS notification failed');
        }
        resolve();
      },
    );
  });
}

export async function notifyOutbound(
  _channelName: string,
  jid: string,
  text: string,
): Promise<void> {
  const groupName = groupNameResolver(jid);

  await Promise.allSettled([
    notifyTelegram(groupName, text).catch((err) => {
      logger.warn({ err }, 'Telegram notification error');
    }),
    notifyMacOS(groupName, text).catch((err) => {
      logger.warn({ err }, 'macOS notification error');
    }),
  ]);
}

export function wrapChannelWithNotifications(channel: Channel): Channel {
  const wrapped = Object.create(channel) as Channel;

  wrapped.sendMessage = async (jid: string, text: string): Promise<void> => {
    await channel.sendMessage(jid, text);
    // Fire-and-forget — never block message delivery
    notifyOutbound(channel.name, jid, text).catch(() => {});
  };

  return wrapped;
}
