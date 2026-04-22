#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const messagesDir = join(__dirname, '..', 'data', 'ipc', 'main', 'messages');
const messageFile = join(messagesDir, `test_${Date.now()}.json`);

const message = {
  type: 'message',
  chatJid: '61412356092@s.whatsapp.net',
  text: `🧪 Test message from NanoClaw - ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Adelaide' })}`,
};

writeFileSync(messageFile, JSON.stringify(message, null, 2));
console.log('✅ Message queued:', messageFile);
console.log('Will be sent shortly by NanoClaw IPC watcher...');
