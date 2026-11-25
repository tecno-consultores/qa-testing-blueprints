// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { type execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { reportDebugCatchError } from '../../utils/diagnosticFormatter.js';
import { execCommand } from './composeFallback.js';
import { COMPOSE_QA_FILE, DOCKER_BINARY, type DockerGuardrailDeps } from './coverageHarvest.js';

export type { DockerGuardrailDeps };

export const EXIT_TEMPFAIL = 75;
export const DEFAULT_MAX_CONCURRENT_CONTAINERS = 1;
export const MAX_ALLOWED_CONCURRENT_CONTAINERS = 4;
export const DEFAULT_MAX_TEMP_C = 85;
export const CRITICAL_TEMP_MARGIN_C = 12;
export const DEFAULT_MIN_FREE_MEM_PCT = 12;
const DEFAULT_SLOT_POLL_MS = 200;
const CRASHLOOP_PROBE_TIMEOUT_MS = 2_000;
const TEARDOWN_TIMEOUT_MS = 15_000;
const LOCK_FILE_PREFIX = 'qa-11x-docker-slot-';
const PROC_MEMINFO_PATH = '/proc/meminfo';
const THERMAL_SYS_DIR = '/sys/class/thermal';

export interface CrashLoopContainerInfo {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly workingDir: string;
}

export interface ThermalMemProbeResult {
  readonly blocked: boolean;
  readonly reason?: string;
  readonly maxTempC?: number;
  readonly availableMemPct?: number;
}

export interface AcquiredSlotHandle {
  readonly lockPath: string;
  readonly slot: number;
  readonly release: () => void;
}

export interface PreFlightGuardResult {
  readonly blocked: boolean;
  readonly exitCode: number;
  readonly summary?: string;
  readonly notes: string[];
}

export interface SlotAcquireInput {
  readonly resolvedPath: string;
  readonly stage: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly deps?: DockerGuardrailDeps;
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function resolveMaxConcurrentSlots(deps?: DockerGuardrailDeps): number {
  if (typeof deps?.maxConcurrent === 'number') {
    return parseBoundedInt(
      String(deps.maxConcurrent),
      DEFAULT_MAX_CONCURRENT_CONTAINERS,
      1,
      MAX_ALLOWED_CONCURRENT_CONTAINERS
    );
  }
  return parseBoundedInt(
    process.env.QA_MAX_CONCURRENT_CONTAINERS,
    DEFAULT_MAX_CONCURRENT_CONTAINERS,
    1,
    MAX_ALLOWED_CONCURRENT_CONTAINERS
  );
}

function resolveLockDirectory(deps?: DockerGuardrailDeps): string {
  return deps?.lockDir ?? process.env.XDG_RUNTIME_DIR ?? os.tmpdir();
}

export function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function readLockPid(lockPath: string): number | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: unknown };
    return typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return null;
  }
}

function tryRemoveStaleLock(lockPath: string, isPidAlive: (pid: number) => boolean): boolean {
  const ownerPid = readLockPid(lockPath);
  if (ownerPid !== null && isPidAlive(ownerPid)) return false;
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function writeExclusiveLock(lockPath: string, payload: string, slot: number): AcquiredSlotHandle | null {
  try {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try {
      fs.writeSync(fd, payload);
    } finally {
      fs.closeSync(fd);
    }
    let released = false;
    return {
      lockPath,
      slot,
      release: () => {
        if (released) return;
        released = true;
        try {
          fs.unlinkSync(lockPath);
        } catch (err: unknown) {
          reportDebugCatchError('dockerGuardrails.releaseSlotLock', err);
        }
      },
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw err;
  }
}

function tryAcquireSlotPass(
  lockDir: string,
  maxSlots: number,
  payload: string,
  isPidAlive: (pid: number) => boolean
): AcquiredSlotHandle | null {
  for (let slot = 1; slot <= maxSlots; slot += 1) {
    const lockPath = path.join(lockDir, `${LOCK_FILE_PREFIX}${slot}.lock`);
    const acquired = writeExclusiveLock(lockPath, payload, slot);
    if (acquired) return acquired;
    if (tryRemoveStaleLock(lockPath, isPidAlive)) {
      const retried = writeExclusiveLock(lockPath, payload, slot);
      if (retried) return retried;
    }
  }
  return null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireDockerSlotLock(
  input: SlotAcquireInput
): Promise<AcquiredSlotHandle | null> {
  const { resolvedPath, stage, timeoutMs, signal, deps } = input;
  const lockDir = resolveLockDirectory(deps);
  fs.mkdirSync(lockDir, { recursive: true });
  const maxSlots = resolveMaxConcurrentSlots(deps);
  const isPidAlive = deps?.isPidAliveFn ?? defaultIsPidAlive;
  const sleep = deps?.sleepFn ?? defaultSleep;
  const pollMs = Math.max(10, deps?.pollIntervalMs ?? DEFAULT_SLOT_POLL_MS);
  const payload = JSON.stringify({
    pid: process.pid,
    project_path: resolvedPath,
    stage,
    acquired_at_utc: new Date().toISOString(),
  });
  const deadline = Date.now() + Math.max(1, timeoutMs);

  while (!signal?.aborted) {
    const handle = tryAcquireSlotPass(lockDir, maxSlots, payload, isPidAlive);
    if (handle) return handle;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await sleep(Math.min(pollMs, remaining));
  }
  return null;
}

export function parseMemAvailablePct(meminfoContent: string): number | null {
  const totalMatch = /^MemTotal:\s+(\d+)\s+kB/m.exec(meminfoContent);
  const availMatch = /^MemAvailable:\s+(\d+)\s+kB/m.exec(meminfoContent);
  if (!totalMatch?.[1] || !availMatch?.[1]) return null;
  const totalKb = Number.parseInt(totalMatch[1], 10);
  const availKb = Number.parseInt(availMatch[1], 10);
  if (totalKb <= 0 || Number.isNaN(availKb)) return null;
  return Math.round((availKb / totalKb) * 1000) / 10;
}

function readMillisFileAsCelsius(filePath: string): number | null {
  if (!fs.existsSync(filePath)) return null;
  const parsed = Number.parseInt(fs.readFileSync(filePath, 'utf8').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round((parsed / 1000) * 10) / 10 : null;
}

function readZoneCriticalCelsius(zonePath: string): number | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(zonePath);
  } catch {
    return null;
  }
  for (const name of entries) {
    const match = /^trip_point_(\d+)_type$/.exec(name);
    if (!match?.[1]) continue;
    const kind = fs.readFileSync(path.join(zonePath, name), 'utf8').trim().toLowerCase();
    if (kind === 'critical') {
      return readMillisFileAsCelsius(path.join(zonePath, `trip_point_${match[1]}_temp`));
    }
  }
  return null;
}

interface ThermalZoneReading {
  readonly zone: string;
  readonly tempC: number;
  readonly criticalC: number | null;
}

function collectThermalReadings(thermalBaseDir: string): ThermalZoneReading[] {
  if (!fs.existsSync(thermalBaseDir)) return [];
  const readings: ThermalZoneReading[] = [];
  for (const entry of fs.readdirSync(thermalBaseDir)) {
    if (!entry.startsWith('thermal_zone')) continue;
    const zonePath = path.join(thermalBaseDir, entry);
    const tempC = readMillisFileAsCelsius(path.join(zonePath, 'temp'));
    if (tempC === null) continue;
    readings.push({ zone: entry, tempC, criticalC: readZoneCriticalCelsius(zonePath) });
  }
  return readings;
}

function findThermalBreach(
  readings: readonly ThermalZoneReading[],
  maxTempC: number
): string | null {
  for (const item of readings) {
    const critLimit = item.criticalC !== null ? item.criticalC - CRITICAL_TEMP_MARGIN_C : maxTempC;
    const effectiveLimit = Math.min(maxTempC, critLimit);
    if (item.tempC >= effectiveLimit) {
      const critSuffix = item.criticalC !== null ? `, critical=${item.criticalC}°C` : '';
      return `Guardrail térmico activo (${item.zone}: ${item.tempC}°C >= límite seguro ${effectiveLimit}°C${critSuffix}). Espera enfriamiento o ajusta QA_MAX_TEMP_C.`;
    }
  }
  return null;
}

function readAvailableMemPctSafe(meminfoPath: string): number | null {
  if (!fs.existsSync(meminfoPath)) return null;
  return parseMemAvailablePct(fs.readFileSync(meminfoPath, 'utf8'));
}

function resolveHostGuardLimits(deps?: DockerGuardrailDeps): { minFreePct: number; maxTempC: number } {
  const minFreePct =
    deps?.minFreeMemPct ??
    parseBoundedInt(process.env.QA_MIN_FREE_MEM_PCT, DEFAULT_MIN_FREE_MEM_PCT, 1, 90);
  const maxTempC =
    deps?.maxTempC ?? parseBoundedInt(process.env.QA_MAX_TEMP_C, DEFAULT_MAX_TEMP_C, 50, 105);
  return { minFreePct, maxTempC };
}

export function evaluateHostThermalAndMemoryGuard(
  deps?: DockerGuardrailDeps
): ThermalMemProbeResult {
  const platform = deps?.platform ?? process.platform;
  if (platform !== 'linux') return { blocked: false };

  const { minFreePct, maxTempC } = resolveHostGuardLimits(deps);
  const availableMemPct = readAvailableMemPctSafe(deps?.meminfoPath ?? PROC_MEMINFO_PATH);
  const readings = collectThermalReadings(deps?.thermalBaseDir ?? THERMAL_SYS_DIR);
  const maxTempObserved =
    readings.length > 0 ? Math.max(...readings.map((r) => r.tempC)) : undefined;
  const memValue = availableMemPct ?? undefined;

  if (availableMemPct !== null && availableMemPct < minFreePct) {
    return {
      blocked: true,
      availableMemPct,
      maxTempC: maxTempObserved,
      reason: `Guardrail de memoria activo: RAM disponible ${availableMemPct}% < mínimo seguro ${minFreePct}%. Libera contenedores/procesos o ajusta QA_MIN_FREE_MEM_PCT.`,
    };
  }

  const thermalReason = findThermalBreach(readings, maxTempC);
  if (thermalReason) {
    return { blocked: true, availableMemPct: memValue, maxTempC: maxTempObserved, reason: thermalReason };
  }
  return { blocked: false, availableMemPct: memValue, maxTempC: maxTempObserved };
}

export function parseRestartingContainers(rawOutput: string): CrashLoopContainerInfo[] {
  const result: CrashLoopContainerInfo[] = [];
  for (const rawLine of rawOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [id = '', name = '', image = '', workingDir = ''] = line.split('|');
    if (id) {
      result.push({ id, name, image, workingDir });
    }
  }
  return result;
}

export function isWorkspaceScopedContainer(workingDir: string, resolvedPath: string): boolean {
  if (!workingDir || workingDir === '<no value>') return false;
  const normWork = path.resolve(workingDir);
  const normRoot = path.resolve(resolvedPath);
  return normWork === normRoot || normWork.startsWith(`${normRoot}${path.sep}`);
}

function stopWorkspaceCrashLoopContainer(
  container: CrashLoopContainerInfo,
  execSyncFn: typeof execFileSync
): boolean {
  try {
    execSyncFn(DOCKER_BINARY, ['update', '--restart=no', container.id], {
      timeout: CRASHLOOP_PROBE_TIMEOUT_MS,
      stdio: 'ignore',
    });
    execSyncFn(DOCKER_BINARY, ['rm', '-fv', container.id], {
      timeout: CRASHLOOP_PROBE_TIMEOUT_MS,
      stdio: 'ignore',
    });
    return true;
  } catch (err: unknown) {
    reportDebugCatchError('dockerGuardrails.stopWorkspaceCrashLoopContainer', err);
    return false;
  }
}

function listRestartingContainers(execSyncFn: typeof execFileSync): CrashLoopContainerInfo[] {
  try {
    const raw = execSyncFn(
      DOCKER_BINARY,
      [
        'ps',
        '-a',
        '--filter',
        'status=restarting',
        '--format',
        '{{.ID}}|{{.Names}}|{{.Image}}|{{.Label "com.docker.compose.project.working_dir"}}',
      ],
      { timeout: CRASHLOOP_PROBE_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return parseRestartingContainers(String(raw));
  } catch (err: unknown) {
    reportDebugCatchError('dockerGuardrails.listRestartingContainers', err);
    return [];
  }
}

export function inspectAndRemediateCrashLoops(
  resolvedPath: string,
  deps?: DockerGuardrailDeps
): PreFlightGuardResult {
  const execSyncFn = deps?.execFileSyncFn ?? execFileSync;
  const containers = listRestartingContainers(execSyncFn);
  if (containers.length === 0) return { blocked: false, exitCode: 0, notes: [] };

  const notes: string[] = [];
  const foreign: CrashLoopContainerInfo[] = [];

  for (const item of containers) {
    if (isWorkspaceScopedContainer(item.workingDir, resolvedPath)) {
      const stopped = stopWorkspaceCrashLoopContainer(item, execSyncFn);
      if (stopped) {
        notes.push(
          `[QA-DOCKER-LOOP-01] Auto-detenido contenedor en CrashLoop del workspace: ${item.name} (${item.id}).`
        );
      } else {
        foreign.push(item);
      }
    } else {
      foreign.push(item);
    }
  }

  if (foreign.length > 0) {
    const ids = foreign.map((c) => c.id).join(' ');
    const details = foreign.map((c) => `${c.name}(${c.id}:${c.image})`).join(', ');
    return {
      blocked: true,
      exitCode: EXIT_TEMPFAIL,
      notes,
      summary:
        `Pre-flight bloqueado por contenedores externos en CrashLoop (${details}). ` +
        `No se destruyen contenedores ajenos automáticamente; detén el bucle primero con: ` +
        `docker update --restart=no ${ids} && docker rm -fv ${ids}`,
    };
  }
  return { blocked: false, exitCode: 0, notes };
}

export function runPreFlightDockerGuards(
  resolvedPath: string,
  deps?: DockerGuardrailDeps
): PreFlightGuardResult {
  const crashLoop = inspectAndRemediateCrashLoops(resolvedPath, deps);
  if (crashLoop.blocked) return crashLoop;

  const thermalMem = evaluateHostThermalAndMemoryGuard(deps);
  if (thermalMem.blocked) {
    return {
      blocked: true,
      exitCode: EXIT_TEMPFAIL,
      summary: thermalMem.reason,
      notes: crashLoop.notes,
    };
  }
  return { blocked: false, exitCode: 0, notes: crashLoop.notes };
}

export async function teardownWorkspaceComposeOnAbort(
  executor: typeof execFile,
  resolvedPath: string
): Promise<void> {
  if (!fs.existsSync(path.join(resolvedPath, COMPOSE_QA_FILE))) return;
  const withProfiles = await execCommand({
    executor,
    binary: DOCKER_BINARY,
    args: ['compose', '-f', COMPOSE_QA_FILE, '--profile', '*', 'down', '-v', '--remove-orphans'],
    cwd: resolvedPath,
    timeoutMs: TEARDOWN_TIMEOUT_MS,
  });
  if (withProfiles.exitCode !== 0) {
    await execCommand({
      executor,
      binary: DOCKER_BINARY,
      args: ['compose', '-f', COMPOSE_QA_FILE, 'down', '-v', '--remove-orphans'],
      cwd: resolvedPath,
      timeoutMs: TEARDOWN_TIMEOUT_MS,
    });
  }
}
