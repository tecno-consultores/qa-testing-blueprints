// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeDockerHostHealth } from '../src/cli/dockerHealthProbe.js';
import { runDoctorCli } from '../src/cli/doctor.js';
import {
  GLOBAL_CONNECTOR_MAX_BYTES,
  PROJECT_CONNECTOR_MAX_BYTES,
  buildGlobalConnectorBlock,
  buildThinConnectorBlock,
} from '../src/services/agents-connector.js';
import { cleanWorkspace11x } from '../src/tools/clean-workspace.js';
import { runEphemeralQa } from '../src/tools/ephemeral-runner.js';
import {
  EXIT_TEMPFAIL,
  acquireDockerSlotLock,
  defaultIsPidAlive,
  evaluateHostThermalAndMemoryGuard,
  inspectAndRemediateCrashLoops,
  parseMemAvailablePct,
  resolveMaxConcurrentSlots,
  runPreFlightDockerGuards,
  teardownWorkspaceComposeOnAbort,
} from '../src/tools/ephemeral-runner/dockerGuardrails.js';
import { auditSecurityStigOwasp } from '../src/tools/security-auditor.js';

function createHealthyLinuxFs(baseDir: string, memAvailKb = 8_000_000, tempMilli = 52_000): {
  meminfoPath: string;
  thermalBaseDir: string;
} {
  fs.mkdirSync(baseDir, { recursive: true });
  const meminfoPath = path.join(baseDir, 'meminfo');
  fs.writeFileSync(
    meminfoPath,
    `MemTotal:       16000000 kB\nMemFree:         2000000 kB\nMemAvailable:   ${memAvailKb} kB\n`,
    'utf8'
  );
  const thermalBaseDir = path.join(baseDir, 'thermal');
  const zone0 = path.join(thermalBaseDir, 'thermal_zone0');
  fs.mkdirSync(zone0, { recursive: true });
  fs.writeFileSync(path.join(zone0, 'temp'), `${tempMilli}\n`, 'utf8');
  fs.writeFileSync(path.join(zone0, 'trip_point_0_type'), 'critical\n', 'utf8');
  fs.writeFileSync(path.join(zone0, 'trip_point_0_temp'), '100000\n', 'utf8');
  return { meminfoPath, thermalBaseDir };
}

describe('Docker Anti-Saturation Guardrails, FIFO Lock & QA-DOCKER-LOOP-01', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-docker-guard-'));
    fs.writeFileSync(path.join(tmpDir, '.npmrc'), 'ignore-scripts=true\n', 'utf8');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('FIFO slot lock & PID liveness', () => {
    it('clamps max concurrent slots and validates PID liveness', () => {
      expect(resolveMaxConcurrentSlots({ maxConcurrent: 0 })).toBe(1);
      expect(resolveMaxConcurrentSlots({ maxConcurrent: 9 })).toBe(4);
      expect(resolveMaxConcurrentSlots({ maxConcurrent: 2 })).toBe(2);
      expect(defaultIsPidAlive(0)).toBe(false);
      expect(defaultIsPidAlive(-5)).toBe(false);
      expect(defaultIsPidAlive(process.pid)).toBe(true);
      expect(defaultIsPidAlive(999_999_999)).toBe(false);
    });

    it('serializes concurrent callers on slot 1 and releases cleanly', async () => {
      const lockDir = path.join(tmpDir, 'locks');
      const first = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'unit',
        timeoutMs: 1000,
        deps: { lockDir, maxConcurrent: 1, pollIntervalMs: 15 },
      });
      expect(first).not.toBeNull();
      expect(fs.existsSync(first!.lockPath)).toBe(true);

      setTimeout(() => {
        first!.release();
        first!.release();
      }, 35);

      const second = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'lint',
        timeoutMs: 1000,
        deps: { lockDir, maxConcurrent: 1, pollIntervalMs: 15 },
      });
      expect(second).not.toBeNull();
      expect(second!.slot).toBe(1);
      second!.release();
      expect(fs.existsSync(second!.lockPath)).toBe(false);
    });

    it('reclaims stale dead-PID and corrupt lockfiles immediately', async () => {
      const lockDir = path.join(tmpDir, 'stale-locks');
      fs.mkdirSync(lockDir, { recursive: true });
      const slot1 = path.join(lockDir, 'qa-11x-docker-slot-1.lock');
      fs.writeFileSync(slot1, JSON.stringify({ pid: 424242 }), 'utf8');

      const handle = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'unit',
        timeoutMs: 500,
        deps: { lockDir, maxConcurrent: 1, isPidAliveFn: () => false },
      });
      expect(handle).not.toBeNull();
      handle!.release();

      fs.writeFileSync(slot1, 'corrupt-json', 'utf8');
      const handle2 = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'lint',
        timeoutMs: 500,
        deps: { lockDir, maxConcurrent: 1, isPidAliveFn: () => true },
      });
      expect(handle2).not.toBeNull();
      handle2!.release();
    });

    it('returns null on timeout or pre-aborted AbortSignal when slot is busy', async () => {
      const lockDir = path.join(tmpDir, 'busy-locks');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(
        path.join(lockDir, 'qa-11x-docker-slot-1.lock'),
        JSON.stringify({ pid: process.pid }),
        'utf8'
      );

      const timedOut = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'unit',
        timeoutMs: 30,
        deps: { lockDir, maxConcurrent: 1, pollIntervalMs: 10, isPidAliveFn: () => true },
      });
      expect(timedOut).toBeNull();

      const ac = new AbortController();
      ac.abort();
      const aborted = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'unit',
        timeoutMs: 500,
        signal: ac.signal,
        deps: { lockDir, maxConcurrent: 1 },
      });
      expect(aborted).toBeNull();
    });
  });

  describe('Passive Linux thermal & RAM guardrails', () => {
    it('parses /proc/meminfo safely and fails open on non-Linux hosts', () => {
      expect(parseMemAvailablePct('MemTotal: 1000 kB\nMemAvailable: 250 kB\n')).toBe(25);
      expect(parseMemAvailablePct('MemTotal: 0 kB\nMemAvailable: 0 kB\n')).toBeNull();
      expect(parseMemAvailablePct('invalid')).toBeNull();
      expect(evaluateHostThermalAndMemoryGuard({ platform: 'darwin' })).toEqual({ blocked: false });
    });

    it('allows healthy Linux host and blocks low RAM or high/critical-adjacent temperature', () => {
      const ok = createHealthyLinuxFs(path.join(tmpDir, 'ok'), 8_000_000, 54_000);
      expect(
        evaluateHostThermalAndMemoryGuard({ platform: 'linux', ...ok, maxTempC: 85, minFreeMemPct: 12 })
      ).toMatchObject({ blocked: false, maxTempC: 54, availableMemPct: 50 });

      const lowRam = createHealthyLinuxFs(path.join(tmpDir, 'lowram'), 1_200_000, 52_000);
      const ramRes = evaluateHostThermalAndMemoryGuard({
        platform: 'linux',
        ...lowRam,
        maxTempC: 85,
        minFreeMemPct: 12,
      });
      expect(ramRes.blocked).toBe(true);
      expect(ramRes.reason).toContain('RAM disponible');

      const hot = createHealthyLinuxFs(path.join(tmpDir, 'hot'), 8_000_000, 86_000);
      const hotRes = evaluateHostThermalAndMemoryGuard({
        platform: 'linux',
        ...hot,
        maxTempC: 85,
        minFreeMemPct: 12,
      });
      expect(hotRes.blocked).toBe(true);
      expect(hotRes.reason).toContain('Guardrail térmico');

      const nearCrit = createHealthyLinuxFs(path.join(tmpDir, 'nearcrit'), 8_000_000, 89_000);
      const critRes = evaluateHostThermalAndMemoryGuard({
        platform: 'linux',
        ...nearCrit,
        maxTempC: 95,
        minFreeMemPct: 12,
      });
      expect(critRes.blocked).toBe(true);
      expect(critRes.reason).toContain('critical=100°C');
    });
  });

  describe('Pre-flight CrashLoop remediation & teardown in runEphemeralQa', () => {
    it('auto-stops workspace restarting containers and blocks fail-fast on foreign CrashLoops', () => {
      const calls: string[][] = [];
      const mockSync = ((_bin: string, args: readonly string[]) => {
        calls.push([...args]);
        if (args[0] === 'ps') {
          return `cid111|local_worker|app:1|${tmpDir}\n`;
        }
        return '';
      }) as unknown as typeof execFileSync;

      const localRes = inspectAndRemediateCrashLoops(tmpDir, { execFileSyncFn: mockSync });
      expect(localRes.blocked).toBe(false);
      expect(localRes.notes).toHaveLength(1);
      expect(calls.some((c) => c[0] === 'update' && c[1] === '--restart=no' && c[2] === 'cid111')).toBe(true);
      expect(calls.some((c) => c[0] === 'rm' && c[2] === 'cid111')).toBe(true);

      const foreignCalls: string[][] = [];
      const foreignSync = ((_bin: string, args: readonly string[]) => {
        foreignCalls.push([...args]);
        if (args[0] === 'ps') {
          return 'cid999|other_worker|other:1|/other/project\n';
        }
        return '';
      }) as unknown as typeof execFileSync;

      const foreignRes = inspectAndRemediateCrashLoops(tmpDir, { execFileSyncFn: foreignSync });
      expect(foreignRes.blocked).toBe(true);
      expect(foreignRes.exitCode).toBe(EXIT_TEMPFAIL);
      expect(foreignRes.summary).toContain('cid999');
      expect(foreignCalls).toHaveLength(1);
    });

    it('falls back to non-profile compose down when teardown --profile * fails', async () => {
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  qa: {}\n', 'utf8');
      const invoked: string[][] = [];
      const mockExec = ((_bin: string, args: readonly string[], _opts: unknown, cb: (err: Error | null, out: string, errOut: string) => void) => {
        invoked.push([...args]);
        if (args.includes('--profile')) {
          const err = Object.assign(new Error('profile unsupported'), { code: 1 });
          cb(err, '', 'unsupported');
          return;
        }
        cb(null, '', '');
      }) as unknown as typeof execFile;

      await teardownWorkspaceComposeOnAbort(mockExec, tmpDir);
      expect(invoked).toHaveLength(2);
      expect(invoked[0]).toContain('--profile');
      expect(invoked[1]).toEqual(['compose', '-f', 'docker-compose.qa.yml', 'down', '-v', '--remove-orphans']);
    });

    it('blocks runEphemeralQa with exit 75 on thermal overload and triggers teardown on make timeout 124', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'qa-lint:\n\t@echo ok\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.qa.yml'), 'services:\n  qa: {}\n', 'utf8');
      const hot = createHealthyLinuxFs(path.join(tmpDir, 'hot-run'), 8_000_000, 92_000);
      const emptyPs = (() => '') as unknown as typeof execFileSync;

      const blocked = await runEphemeralQa(tmpDir, 'lint', 30, {
        execFileFn: vi.fn() as unknown as typeof execFile,
        guardrails: {
          enabled: true,
          platform: 'linux',
          lockDir: path.join(tmpDir, 'locks-run'),
          execFileSyncFn: emptyPs,
          ...hot,
        },
      });
      expect(blocked.status).toBe('FAILED');
      expect(blocked.exit_code).toBe(EXIT_TEMPFAIL);
      expect(blocked.circuit_breaker).toBeUndefined();

      const ok = createHealthyLinuxFs(path.join(tmpDir, 'ok-run'), 8_000_000, 50_000);
      const execCalls: Array<{ bin: string; args: string[] }> = [];
      const timeoutExec = ((bin: string, args: readonly string[], _opts: unknown, cb: (err: Error | null, out: string, errOut: string) => void) => {
        execCalls.push({ bin, args: [...args] });
        if (bin === 'make') {
          const err = Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' });
          cb(err, '', 'timed out');
          return;
        }
        cb(null, '', '');
      }) as unknown as typeof execFile;

      const timedOut = await runEphemeralQa(tmpDir, 'lint', 30, {
        execFileFn: timeoutExec,
        execFileSyncFn: emptyPs,
        guardrails: {
          enabled: true,
          platform: 'linux',
          lockDir: path.join(tmpDir, 'locks-timeout'),
          execFileSyncFn: emptyPs,
          ...ok,
        },
      });
      expect(timedOut.exit_code).toBe(124);
      expect(execCalls.some((c) => c.bin === 'docker' && c.args.includes('down'))).toBe(true);

      const remediatePs = ((_bin: string, args: readonly string[]) =>
        args[0] === 'ps' ? `cid_ws|ws_crash|app:1|${tmpDir}\n` : '') as unknown as typeof execFileSync;
      const okExec = ((_bin: string, _args: readonly string[], _opts: unknown, cb: (err: Error | null, out: string, errOut: string) => void) => {
        cb(null, 'All checks passed', '');
      }) as unknown as typeof execFile;
      const autoHealed = await runEphemeralQa(tmpDir, 'lint', 30, {
        execFileFn: okExec,
        execFileSyncFn: emptyPs,
        guardrails: {
          enabled: true,
          platform: 'linux',
          lockDir: path.join(tmpDir, 'locks-heal'),
          execFileSyncFn: remediatePs,
          ...ok,
        },
      });
      expect(autoHealed.exit_code).toBe(0);
      expect(autoHealed.tail_log).toContain('Auto-detenido contenedor en CrashLoop del workspace: ws_crash');

      const busyLockDir = path.join(tmpDir, 'locks-busy-run');
      fs.mkdirSync(busyLockDir, { recursive: true });
      fs.writeFileSync(
        path.join(busyLockDir, 'qa-11x-docker-slot-1.lock'),
        JSON.stringify({ pid: process.pid }),
        'utf8'
      );
      const ac = new AbortController();
      ac.abort();
      const slotTimeout = await runEphemeralQa(tmpDir, 'lint', 30, {
        execFileFn: okExec,
        execFileSyncFn: emptyPs,
        signal: ac.signal,
        guardrails: {
          enabled: true,
          platform: 'linux',
          lockDir: busyLockDir,
          isPidAliveFn: () => true,
          execFileSyncFn: emptyPs,
          ...ok,
        },
      });
      expect(slotTimeout.exit_code).toBe(124);
      expect(slotTimeout.tail_log).toContain('cola serializada Docker QA');
    });

    it('returns pass from runPreFlightDockerGuards when Docker and host are healthy', () => {
      const ok = createHealthyLinuxFs(path.join(tmpDir, 'preflight-ok'), 8_000_000, 48_000);
      const res = runPreFlightDockerGuards(tmpDir, {
        platform: 'linux',
        execFileSyncFn: (() => '') as unknown as typeof execFileSync,
        ...ok,
      });
      expect(res).toEqual({ blocked: false, exitCode: 0, notes: [] });
    });
  });

  describe('QA-DOCKER-LOOP-01 static auditor rule (#37)', () => {
    it('flags unbounded restart policies in QA/deploy compose and respects # qa-docker-loop-ok', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.qa.yml'),
        [
          'services:',
          '  api:',
          '    image: app:1',
          '    restart: always',
          '  worker:',
          '    image: app:1',
          '    restart: unless-stopped',
          '  batch:',
          '    image: app:1',
          '    restart: on-failure',
          '  safe_bounded:',
          '    image: app:1',
          '    restart: "on-failure:3"',
          '  safe_no:',
          '    image: app:1',
          '    restart: "no"',
          '  exempt_svc:',
          '    image: app:1',
          '    # qa-docker-loop-ok',
          '    restart: always',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const loopFindings = res.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOOP-01');
      expect(loopFindings).toHaveLength(3);
      expect(loopFindings.every((f) => f.severity === 'HIGH')).toBe(true);
    });

    it('flags deploy.sh missing --rm, unbounded --restart, --wait without --wait-timeout, parallel compose build, and missing qa.yml cleanup', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'deploy.sh'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'cleanup() {',
          '  docker compose -f docker-compose.deploy.yml down --remove-orphans || true',
          '}',
          'make qa-lint',
          'docker run -u 0:0 alpine:3.21 true',
          'docker run --rm --restart=always alpine:3.21 true',
          'docker compose -f docker-compose.deploy.yml build --no-cache --build-arg ENV=ci preview qa-gate deploy',
          'docker compose -f docker-compose.deploy.yml up -d --wait preview',
          'docker compose -f docker-compose.deploy.yml run --rm -T deploy',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const loopFindings = res.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOOP-01');
      expect(loopFindings).toHaveLength(5);
    });

    it('passes hardened deploy.sh with COMPOSE_PARALLEL_LIMIT=1, --rm, --wait-timeout, and dual cleanup', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'deploy.sh'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'export COMPOSE_PARALLEL_LIMIT=1',
          'cleanup() {',
          '  docker compose -f docker-compose.deploy.yml down --remove-orphans || true',
          '  docker compose -f docker-compose.qa.yml down --remove-orphans || true',
          '}',
          'make qa-lint',
          'docker run --rm --restart=no --network none alpine:3.21 true',
          'docker compose -f docker-compose.deploy.yml build --no-cache --build-arg ENV=ci preview qa-gate deploy',
          'docker compose -f docker-compose.deploy.yml up -d --wait --wait-timeout 60 preview',
          'docker compose -f docker-compose.deploy.yml run --rm -T deploy',
        ].join('\n'),
        'utf8'
      );

      const res = await auditSecurityStigOwasp(tmpDir);
      const loopFindings = res.findings.filter((f) => f.rule_id === 'QA-DOCKER-LOOP-01');
      expect(loopFindings).toHaveLength(0);
    });
  });

  describe('dockerHealthProbe, doctor, cleanWorkspace11x & thin connector budgets', () => {
    it('reports CrashLoops, orphan networks, missing NetworkManager rule, and thermal/RAM warnings', async () => {
      const hotLowRam = createHealthyLinuxFs(path.join(tmpDir, 'doc-hot'), 1_200_000, 82_000);
      const nmDir = path.join(tmpDir, 'nm-conf');
      fs.mkdirSync(nmDir, { recursive: true });
      const mockSync = ((_bin: string, args: readonly string[]) => {
        if (args[0] === 'ps') return 'abc123|loop_api|api:1|/repo\n';
        if (args[0] === 'network') {
          return 'bridge|bridge\nhost|host\nnone|none\nn1|bridge\nn2|bridge\nn3|bridge\nn4|bridge\nn5|bridge\n';
        }
        return '';
      }) as unknown as typeof execFileSync;

      const health = probeDockerHostHealth({
        execFileSyncFn: mockSync,
        platform: 'linux',
        nmConfDir: nmDir,
        ...hotLowRam,
      });
      expect(health.restarting_containers).toEqual(['loop_api(abc123)']);
      expect(health.orphan_bridge_networks).toBe(5);
      expect(health.network_manager_unmanaged_ok).toBe(false);
      expect(health.warnings).toHaveLength(5);

      fs.writeFileSync(
        path.join(nmDir, '99-unmanaged-docker.conf'),
        '[keyfile]\nunmanaged-devices=interface-name:veth*;interface-name:br-*\n',
        'utf8'
      );
      const cleanHealth = probeDockerHostHealth({
        execFileSyncFn: (() => '') as unknown as typeof execFileSync,
        platform: 'linux',
        nmConfDir: nmDir,
        ...createHealthyLinuxFs(path.join(tmpDir, 'doc-ok'), 9_000_000, 48_000),
      });
      expect(cleanHealth.network_manager_unmanaged_ok).toBe(true);
      expect(cleanHealth.warnings).toHaveLength(0);

      const doctorOut = await runDoctorCli(['--offline', '--dir', tmpDir], {
        homeDir: tmpDir,
        dockerProbeFn: () => '27.5.1',
        dockerHealthProbeFn: () => health,
      });
      expect(doctorOut.exitCode).toBe(0);
      expect(doctorOut.output).toContain('CrashLoop');
    });

    it('detects and cleans only workspace-scoped containers in cleanWorkspace11x', async () => {
      const dockerCalls: string[][] = [];
      const mockSync = ((_bin: string, args: readonly string[]) => {
        dockerCalls.push([...args]);
        if (args[0] === 'ps') {
          return [
            `c1|ws_loop|restarting|${tmpDir}`,
            `c2|ws_exited|exited|${tmpDir}`,
            'c3|foreign_loop|restarting|/other/repo',
          ].join('\n');
        }
        return '';
      }) as unknown as typeof execFileSync;

      const dry = await cleanWorkspace11x(tmpDir, true, false, { execFileSyncFn: mockSync });
      expect(dry.found_containers).toEqual(['ws_loop(c1)', 'ws_exited(c2)']);
      expect(dry.removed_containers).toEqual([]);

      dockerCalls.length = 0;
      const live = await cleanWorkspace11x(tmpDir, false, false, { execFileSyncFn: mockSync });
      expect(live.removed_containers).toEqual(['ws_loop(c1)', 'ws_exited(c2)']);
      expect(dockerCalls.some((c) => c[0] === 'update' && c[2] === 'c1')).toBe(true);
      expect(dockerCalls.some((c) => c[2] === 'c3')).toBe(false);

      const failingRmSync = ((_bin: string, args: readonly string[]) => {
        if (args[0] === 'ps') return `c1|ws_fail|exited|${tmpDir}\n`;
        throw new Error('daemon busy');
      }) as unknown as typeof execFileSync;
      const partial = await cleanWorkspace11x(tmpDir, false, false, { execFileSyncFn: failingRmSync });
      expect(partial.found_containers).toEqual(['ws_fail(c1)']);
      expect(partial.removed_containers).toEqual([]);

      const customCleaned = await cleanWorkspace11x(tmpDir, false, false, {
        dockerContainerCleaner: () => ({ found: ['custom(c9)'], removed: ['custom(c9)'] }),
      });
      expect(customCleaned.removed_containers).toEqual(['custom(c9)']);
    });

    it('keeps all updated thin connectors within 1,536 byte budget with serialization rules', () => {
      for (const lang of ['auto', 'en', 'es'] as const) {
        const globalBlock = buildGlobalConnectorBlock(lang);
        expect(Buffer.byteLength(globalBlock, 'utf8')).toBeLessThanOrEqual(GLOBAL_CONNECTOR_MAX_BYTES);
        expect(globalBlock).toContain('--restart=no');
      }
      const projBlock = buildThinConnectorBlock('demo-app', ['fastapi', 'vue3'], 'auto');
      expect(Buffer.byteLength(projBlock, 'utf8')).toBeLessThanOrEqual(PROJECT_CONNECTOR_MAX_BYTES);
      expect(projBlock).toContain('--restart=no');
    });

    it('handles fault-tolerant catch paths in dockerHealthProbe and dockerGuardrails', async () => {
      const nmNotADir = path.join(tmpDir, 'nm-file');
      fs.writeFileSync(nmNotADir, 'not-a-directory', 'utf8');
      const health = probeDockerHostHealth({
        platform: 'linux',
        nmConfDir: nmNotADir,
        execFileSyncFn: (() => {
          throw new Error('docker unavailable');
        }) as unknown as typeof execFileSync,
      });
      expect(health.restarting_containers).toEqual([]);
      expect(health.orphan_bridge_networks).toBe(0);
      expect(health.network_manager_unmanaged_ok).toBeNull();

      const nmMixedDir = path.join(tmpDir, 'nm-mixed');
      fs.mkdirSync(nmMixedDir, { recursive: true });
      fs.writeFileSync(path.join(nmMixedDir, 'README.txt'), 'ignored', 'utf8');
      fs.writeFileSync(
        path.join(nmMixedDir, '99-docker.conf'),
        '[keyfile]\nunmanaged-devices=interface-name:veth*\n',
        'utf8'
      );
      const healthyProbe = probeDockerHostHealth({
        platform: 'linux',
        nmConfDir: nmMixedDir,
        execFileSyncFn: (() => '') as unknown as typeof execFileSync,
        ...createHealthyLinuxFs(path.join(tmpDir, 'probe-ok'), 8_000_000, 48_000),
      });
      expect(healthyProbe.network_manager_unmanaged_ok).toBe(true);
      expect(healthyProbe.warnings).toEqual([]);

      const darwinProbe = probeDockerHostHealth({
        platform: 'darwin',
        execFileSyncFn: (() => '') as unknown as typeof execFileSync,
      });
      expect(darwinProbe.network_manager_unmanaged_ok).toBeNull();

      const lockDir = path.join(tmpDir, 'locks-faults');
      const handle = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'unit',
        timeoutMs: 1_000,
        deps: { lockDir, maxConcurrent: 1 },
      });
      expect(handle).not.toBeNull();
      fs.unlinkSync(handle!.lockPath);
      expect(() => handle!.release()).not.toThrow();

      const dirCollisionLockDir = path.join(tmpDir, 'locks-dir-collision');
      fs.mkdirSync(path.join(dirCollisionLockDir, 'qa-11x-docker-slot-1.lock'), { recursive: true });
      const ac = new AbortController();
      const blockedByDir = await acquireDockerSlotLock({
        resolvedPath: tmpDir,
        stage: 'unit',
        timeoutMs: 1_000,
        signal: ac.signal,
        deps: {
          lockDir: dirCollisionLockDir,
          maxConcurrent: 1,
          isPidAliveFn: () => false,
          sleepFn: () => {
            ac.abort();
            return Promise.resolve();
          },
        },
      });
      expect(blockedByDir).toBeNull();

      const roLockDir = path.join(tmpDir, 'locks-ro');
      fs.mkdirSync(roLockDir, { recursive: true });
      fs.chmodSync(roLockDir, 0o500);
      try {
        await expect(
          acquireDockerSlotLock({
            resolvedPath: tmpDir,
            stage: 'unit',
            timeoutMs: 1_000,
            deps: { lockDir: roLockDir, maxConcurrent: 1 },
          })
        ).rejects.toThrow();
      } finally {
        fs.chmodSync(roLockDir, 0o700);
      }

      const thermalBase = path.join(tmpDir, 'thermal-exec-only');
      const zoneDir = path.join(thermalBase, 'thermal_zone0');
      fs.mkdirSync(zoneDir, { recursive: true });
      fs.writeFileSync(path.join(zoneDir, 'temp'), '60000\n', 'utf8');
      const memFile = path.join(tmpDir, 'meminfo-ok');
      fs.writeFileSync(memFile, 'MemTotal: 16000000 kB\nMemAvailable: 8000000 kB\n', 'utf8');
      fs.chmodSync(zoneDir, 0o100);
      try {
        const thermalRes = evaluateHostThermalAndMemoryGuard({
          platform: 'linux',
          meminfoPath: memFile,
          thermalBaseDir: thermalBase,
        });
        expect(thermalRes.blocked).toBe(false);
        expect(thermalRes.maxTempC).toBe(60);
      } finally {
        fs.chmodSync(zoneDir, 0o700);
      }

      const failRemediate = inspectAndRemediateCrashLoops(tmpDir, {
        execFileSyncFn: ((_bin: string, args: readonly string[]) => {
          if (args[0] === 'ps') return `ws99|ws_stuck|img:1|${tmpDir}\n`;
          throw new Error('docker update failed');
        }) as unknown as typeof execFileSync,
      });
      expect(failRemediate.blocked).toBe(true);
      expect(failRemediate.exitCode).toBe(EXIT_TEMPFAIL);
      expect(failRemediate.summary).toContain('ws_stuck(ws99:img:1)');
    });
  });
});
