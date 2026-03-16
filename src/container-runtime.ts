/**
 * Container runtime abstraction for NanoClaw.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

import { logger } from './logger.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'container';

/**
 * Hostname/IP containers use to reach the host machine.
 * Docker Desktop: host.docker.internal (resolved by VM networking).
 * Apple Container: bridge100 IP (host.docker.internal is not supported,
 *   and --add-host is not available).
 * Linux: host.docker.internal (added via --add-host in hostGatewayArgs).
 *
 * Lazy-detected: bridge100 only exists after `container system start`,
 * so we detect on first access rather than at import time.
 */
let _cachedHostGateway: string | null = null;

export function getContainerHostGateway(): string {
  if (_cachedHostGateway) return _cachedHostGateway;
  _cachedHostGateway = detectHostGateway();
  return _cachedHostGateway;
}

/** @deprecated Use getContainerHostGateway() — kept for backwards compat */
export const CONTAINER_HOST_GATEWAY = 'host.docker.internal';

/** Default vmnet gateway used by Apple Container (visible inside the VM). */
const APPLE_CONTAINER_GATEWAY = '192.168.64.1';

function detectHostGateway(): string {
  if (os.platform() === 'darwin' && CONTAINER_RUNTIME_BIN === 'container') {
    // Apple Container: vmnet gateway is always 192.168.64.1.
    // The host has no visible interface for this IP — vmnet handles it internally.
    return APPLE_CONTAINER_GATEWAY;
  }
  return 'host.docker.internal';
}

/**
 * Address the credential proxy binds to.
 * Docker Desktop (macOS): 127.0.0.1 — the VM routes host.docker.internal to loopback.
 * Apple Container (macOS): bridge100 IP — containers reach the host via the vmnet bridge.
 * Docker (Linux): bind to the docker0 bridge IP so only containers can reach it,
 *   falling back to 0.0.0.0 if the interface isn't found.
 */
let _cachedProxyBindHost: string | null = null;

export function getProxyBindHost(): string {
  if (_cachedProxyBindHost) return _cachedProxyBindHost;
  _cachedProxyBindHost =
    process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();
  return _cachedProxyBindHost;
}

/** @deprecated Use getProxyBindHost() — kept for backwards compat */
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || '127.0.0.1';

function detectProxyBindHost(): string {
  if (os.platform() === 'darwin') {
    // Apple Container: vmnet gateway (192.168.64.1) is not a real host interface,
    // so we must bind to 0.0.0.0 for the container to reach us.
    if (CONTAINER_RUNTIME_BIN === 'container') {
      return '0.0.0.0';
    }
    // Docker Desktop: loopback works via host.docker.internal VM routing
    return '127.0.0.1';
  }

  // WSL uses Docker Desktop (same VM routing as macOS) — loopback is correct.
  // Check /proc filesystem, not env vars — WSL_DISTRO_NAME isn't set under systemd.
  if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) return '127.0.0.1';

  // Bare-metal Linux: bind to the docker0 bridge IP instead of 0.0.0.0
  const ifaces = os.networkInterfaces();
  const docker0 = ifaces['docker0'];
  if (docker0) {
    const ipv4 = docker0.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '0.0.0.0';
}

/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  // On Linux, host.docker.internal isn't built-in — add it explicitly
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return [
    '--mount',
    `type=bind,source=${hostPath},target=${containerPath},readonly`,
  ];
}

/** Returns args for execFile to stop a container by name (no shell). */
export function stopContainerArgs(name: string): [string, string[]] {
  return [CONTAINER_RUNTIME_BIN, ['stop', '-t', '1', name]];
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  try {
    execSync(`${CONTAINER_RUNTIME_BIN} system status`, { stdio: 'pipe' });
    logger.debug('Container runtime already running');
  } catch {
    logger.info('Starting container runtime...');
    try {
      execSync(`${CONTAINER_RUNTIME_BIN} system start`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      logger.info('Container runtime started');
    } catch (err) {
      logger.error({ err }, 'Failed to start container runtime');
      console.error(
        '\n╔════════════════════════════════════════════════════════════════╗',
      );
      console.error(
        '║  FATAL: Container runtime failed to start                      ║',
      );
      console.error(
        '║                                                                ║',
      );
      console.error(
        '║  Agents cannot run without a container runtime. To fix:        ║',
      );
      console.error(
        '║  1. Ensure Apple Container is installed                        ║',
      );
      console.error(
        '║  2. Run: container system start                                ║',
      );
      console.error(
        '║  3. Restart NanoClaw                                           ║',
      );
      console.error(
        '╚════════════════════════════════════════════════════════════════╝\n',
      );
      throw new Error('Container runtime is required but failed to start');
    }
  }
}

/** Kill orphaned NanoClaw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    const output = execSync(`${CONTAINER_RUNTIME_BIN} ls --format json`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    const containers: { status: string; configuration: { id: string } }[] =
      JSON.parse(output || '[]');
    const orphans = containers
      .filter(
        (c) =>
          c.status === 'running' && c.configuration.id.startsWith('nanoclaw-'),
      )
      .map((c) => c.configuration.id);
    for (const name of orphans) {
      try {
        const [bin, args] = stopContainerArgs(name);
        execFileSync(bin, args, { stdio: 'pipe' });
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        'Stopped orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}
