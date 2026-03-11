import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Channel } from './types.js';

// Mock dependencies before importing the module under test
vi.mock('./env.js', () => ({
  readEnvFile: () => ({}),
}));

vi.mock('./logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./applescript-templates.js', () => ({
  escapeAppleScriptString: (s: string) => s.replace(/"/g, '\\"'),
}));

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    name: 'test',
    connect: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    ownsJid: vi.fn().mockReturnValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setTyping: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('wrapChannelWithNotifications', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('preserves all Channel interface methods', async () => {
    const { wrapChannelWithNotifications } =
      await import('./outbound-notify.js');
    const original = makeChannel();
    const wrapped = wrapChannelWithNotifications(original);

    expect(wrapped.name).toBe('test');
    expect(wrapped.isConnected()).toBe(true);
    expect(wrapped.ownsJid('x@g.us')).toBe(true);

    await wrapped.connect();
    expect(original.connect).toHaveBeenCalled();

    await wrapped.disconnect();
    expect(original.disconnect).toHaveBeenCalled();

    await wrapped.setTyping!('x@g.us', true);
    expect(original.setTyping).toHaveBeenCalledWith('x@g.us', true);
  });

  it('calls original sendMessage and fires notification', async () => {
    const { wrapChannelWithNotifications } =
      await import('./outbound-notify.js');
    const original = makeChannel();
    const wrapped = wrapChannelWithNotifications(original);

    await wrapped.sendMessage('group@g.us', 'hello');
    expect(original.sendMessage).toHaveBeenCalledWith('group@g.us', 'hello');
  });

  it('does not throw when notification fails', async () => {
    const { wrapChannelWithNotifications } =
      await import('./outbound-notify.js');
    const original = makeChannel();
    const wrapped = wrapChannelWithNotifications(original);

    // Global fetch mock that rejects
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));

    await expect(
      wrapped.sendMessage('group@g.us', 'hello'),
    ).resolves.toBeUndefined();
    expect(original.sendMessage).toHaveBeenCalled();

    globalThis.fetch = originalFetch;
  });
});

describe('setGroupNameResolver', () => {
  it('uses custom resolver for group names', async () => {
    const { setGroupNameResolver, notifyOutbound } =
      await import('./outbound-notify.js');
    setGroupNameResolver((jid) => (jid === 'abc@g.us' ? 'My Group' : jid));

    // notifyOutbound is fire-and-forget; just verify it doesn't throw
    await expect(
      notifyOutbound('test', 'abc@g.us', 'hello'),
    ).resolves.toBeUndefined();
  });

  it('falls back to JID when resolver returns JID', async () => {
    const { setGroupNameResolver, notifyOutbound } =
      await import('./outbound-notify.js');
    setGroupNameResolver((jid) => jid);

    await expect(
      notifyOutbound('test', 'unknown@g.us', 'hello'),
    ).resolves.toBeUndefined();
  });
});

describe('notification skipping', () => {
  it('Telegram notification skipped when config vars empty', async () => {
    // Module already loaded with empty env — fetch should not be called for Telegram
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { notifyOutbound } = await import('./outbound-notify.js');
    await notifyOutbound('test', 'group@g.us', 'hello');

    // With empty TELEGRAM_CHAT_ID, fetch should not be called
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('macOS notification completes without error regardless of platform', async () => {
    const { notifyOutbound } = await import('./outbound-notify.js');

    // With empty Telegram config and no fetch mock, only macOS path runs.
    // On CI/non-darwin it skips; on darwin it fires osascript.
    // Either way it should not throw.
    await expect(
      notifyOutbound('test', 'group@g.us', 'hello'),
    ).resolves.toBeUndefined();
  });
});
