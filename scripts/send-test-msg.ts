#!/usr/bin/env tsx
import { writeFileSync } from 'fs';
import { join } from 'path';

const messagesDir = join(process.cwd(), 'data', 'ipc', 'main', 'messages');
const messageFile = join(messagesDir, `test_${Date.now()}.json`);

const message = {
  type: 'message',
  chatJid: '61412356092@s.whatsapp.net',
  text: `🧪 Test message from NanoClaw - ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Adelaide' })}`,
};

writeFileSync(messageFile, JSON.stringify(message, null, 2));
console.log('✅ Message queued:', messageFile);
console.log('Will be sent shortly by NanoClaw IPC watcher...');
