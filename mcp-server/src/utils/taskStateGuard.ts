// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fsPromises from 'node:fs/promises';

export const TASK_CAPACITY_EXTENSION_URI = 'urn:quaia:extensions:task-capacity:v1' as const;
export const MIN_TASK_CAPACITY = 1;
export const MAX_TASK_CAPACITY = 32;
export const DEFAULT_TELEMETRY_TIMEOUT_MS = 8_000;
export const DEFAULT_HEAVY_TRANSFER_TIMEOUT_MS = 180_000;
export const DEFAULT_TTY_PROBE_TIMEOUT_MS = 4_000;

const STATE_AVAILABLE = 'AVAILABLE' as const;
const STATE_BUSY = 'BUSY' as const;
const STATE_BROKEN = 'BROKEN' as const;
const REASON_OFFLINE = 'OFFLINE' as const;
const REASON_TASK_STUCK = 'TASK_STUCK' as const;
const PROFILE_HEAVY_TRANSFER = 'heavy_transfer' as const;
const CODE_GUARD_BUSY = 'GUARD_BUSY' as const;
const CODE_GUARD_BROKEN = 'GUARD_BROKEN' as const;
const CODE_TASK_STUCK = 'TASK_STUCK' as const;

const TRANSIENT_ERROR_CODES = new Set<string>([
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_SOCKET',
]);

const TRANSIENT_MESSAGE_RE =
  /\b(?:econnreset|etimedout|premature close|truncated|socket hang up|network timeout)\b/i;

export type GuardLifecycleState =
  | typeof STATE_AVAILABLE
  | typeof STATE_BUSY
  | typeof STATE_BROKEN;

export type GuardBrokenReason = typeof REASON_OFFLINE | typeof REASON_TASK_STUCK | null;
export type TimeoutProfile = 'telemetry' | typeof PROFILE_HEAVY_TRANSFER;
export type GuardErrorCode =
  | typeof CODE_GUARD_BUSY
  | typeof CODE_GUARD_BROKEN
  | typeof CODE_TASK_STUCK;

export interface TaskStateGuardOptions {
  capacity?: number;
  defaultTimeoutMs?: number;
  heavyTransferTimeoutMs?: number;
}

export interface ExecuteTaskOptions {
  taskId?: string;
  profile?: TimeoutProfile;
  timeoutMs?: number;
  idempotent?: boolean;
  readOnly?: boolean;
  artifactPaths?: readonly string[];
}

export interface TaskSlotLease {
  readonly taskId: string;
  readonly signal: AbortSignal;
  release: () => void;
}

export interface GuardStateSnapshot {
  state: GuardLifecycleState;
  brokenReason: GuardBrokenReason;
  capacity: number;
  activeTasks: number;
  stuckTasks: number;
  extensionUri: typeof TASK_CAPACITY_EXTENSION_URI;
}

export interface RecoveryReport {
  recoveredCount: number;
  previousReason: GuardBrokenReason;
  state: GuardLifecycleState;
}

export interface HealthProbeReport {
  healthy: boolean;
  recovered: boolean;
  recoveredCount: number;
  snapshot: GuardStateSnapshot;
}

export interface WorkerExitInput {
  optional?: boolean;
  cancelled?: boolean;
  error?: unknown;
}

export interface WorkerExitEvaluation {
  healthy: boolean;
  state: GuardLifecycleState;
  brokenReason: GuardBrokenReason;
}

export interface TtyProbeResult {
  exitCode: number;
  elapsedMs: number;
}

interface ActiveTaskRecord {
  readonly taskId: string;
  readonly controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  timedOut: boolean;
}

export class TaskGuardError extends Error {
  readonly statusCode: 409 | 503 | 504;
  readonly code: GuardErrorCode;
  readonly guardState: GuardLifecycleState;
  readonly brokenReason: GuardBrokenReason;

  constructor(
    statusCode: 409 | 503 | 504,
    code: GuardErrorCode,
    message: string,
    guardState: GuardLifecycleState,
    brokenReason: GuardBrokenReason
  ) {
    super(message);
    this.name = 'TaskGuardError';
    this.statusCode = statusCode;
    this.code = code;
    this.guardState = guardState;
    this.brokenReason = brokenReason;
  }
}

function createGuardBusyError(capacity: number): TaskGuardError {
  return new TaskGuardError(
    409,
    CODE_GUARD_BUSY,
    `409 BUSY: capacidad máxima alcanzada (${capacity} slots activos).`,
    STATE_BUSY,
    null
  );
}

function createGuardBrokenError(reason: GuardBrokenReason): TaskGuardError {
  return new TaskGuardError(
    503,
    CODE_GUARD_BROKEN,
    `503 BROKEN: guardián inoperativo (${reason}).`,
    STATE_BROKEN,
    reason
  );
}

function createTaskStuckError(taskId: string, timeoutMs: number): TaskGuardError {
  return new TaskGuardError(
    504,
    CODE_TASK_STUCK,
    `TASK_STUCK: tarea '${taskId}' abortada tras exceder ${timeoutMs} ms.`,
    STATE_BROKEN,
    REASON_TASK_STUCK
  );
}

function isValidCapacity(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TASK_CAPACITY && value <= MAX_TASK_CAPACITY;
}

export function validateCapacity(capacity: number = MIN_TASK_CAPACITY): number {
  if (!isValidCapacity(capacity)) {
    throw new RangeError(
      `Capacidad inválida (${capacity}): debe ser un entero entre ${MIN_TASK_CAPACITY} y ${MAX_TASK_CAPACITY}.`
    );
  }
  return capacity;
}

export function validateTimeoutMs(timeoutMs: number, label: string): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(`Timeout inválido en '${label}': debe ser > 0 ms.`);
  }
  return timeoutMs;
}

function hasTransientCode(error: Error): boolean {
  const candidate = (error as Error & { code?: unknown }).code;
  return typeof candidate === 'string' && TRANSIENT_ERROR_CODES.has(candidate);
}

export function isTransientTransportError(error: unknown): boolean {
  if (!(error instanceof Error) || error instanceof TaskGuardError) {
    return false;
  }
  return hasTransientCode(error) || TRANSIENT_MESSAGE_RE.test(error.message);
}

export function canRetryTask(options?: ExecuteTaskOptions): boolean {
  if (!options || options.idempotent === false) {
    return false;
  }
  return Boolean(options.idempotent) || Boolean(options.readOnly);
}

async function purgeSingleZeroByteFile(targetPath: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(targetPath);
    if (!stats.isFile() || stats.size !== 0) {
      return false;
    }
    await fsPromises.rm(targetPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function cleanupZeroByteArtifacts(
  targetPaths: readonly string[]
): Promise<string[]> {
  const purged: string[] = [];
  for (const targetPath of targetPaths) {
    if (await purgeSingleZeroByteFile(targetPath)) {
      purged.push(targetPath);
    }
  }
  return purged;
}

async function cleanupArtifactsSafe(artifactPaths?: readonly string[]): Promise<void> {
  if (!artifactPaths || artifactPaths.length === 0) {
    return;
  }
  await cleanupZeroByteArtifacts(artifactPaths);
}

export function evaluateWorkerExit(input: WorkerExitInput): WorkerExitEvaluation {
  if (input.error !== undefined && input.error !== null) {
    return { healthy: false, state: STATE_BROKEN, brokenReason: REASON_OFFLINE };
  }
  if (Boolean(input.cancelled) || Boolean(input.optional)) {
    return { healthy: true, state: STATE_AVAILABLE, brokenReason: null };
  }
  return { healthy: false, state: STATE_BROKEN, brokenReason: REASON_OFFLINE };
}

export async function probeTtyExitNonBlocking(
  invokeCli: (exitFn: (code: number) => void) => Promise<void>,
  timeoutMs: number = DEFAULT_TTY_PROBE_TIMEOUT_MS
): Promise<TtyProbeResult> {
  const probeGuard = new TaskStateGuard({ defaultTimeoutMs: timeoutMs });
  let capturedExitCode: number | null = null;
  const startedAt = Date.now();
  await probeGuard.executeTask(
    async () => {
      await invokeCli((code) => {
        capturedExitCode = code;
      });
    },
    { taskId: 'qa-cli-tty-01-probe', timeoutMs, readOnly: true }
  );
  if (capturedExitCode === null) {
    throw createTaskStuckError('qa-cli-tty-01-probe', timeoutMs);
  }
  return {
    exitCode: capturedExitCode,
    elapsedMs: Date.now() - startedAt,
  };
}

export class TaskStateGuard {
  private state: GuardLifecycleState = STATE_AVAILABLE;
  private brokenReason: GuardBrokenReason = null;
  private readonly capacity: number;
  private readonly defaultTimeoutMs: number;
  private readonly heavyTransferTimeoutMs: number;
  private sequence = 0;
  private readonly activeTasks = new Map<string, ActiveTaskRecord>();
  private readonly stuckTasks = new Map<string, ActiveTaskRecord>();

  constructor(options: TaskStateGuardOptions = {}) {
    this.capacity = validateCapacity(options.capacity ?? MIN_TASK_CAPACITY);
    this.defaultTimeoutMs = validateTimeoutMs(
      options.defaultTimeoutMs ?? DEFAULT_TELEMETRY_TIMEOUT_MS,
      'defaultTimeoutMs'
    );
    this.heavyTransferTimeoutMs = validateTimeoutMs(
      options.heavyTransferTimeoutMs ?? DEFAULT_HEAVY_TRANSFER_TIMEOUT_MS,
      'heavyTransferTimeoutMs'
    );
  }

  getState(): GuardLifecycleState {
    return this.state;
  }

  getBrokenReason(): GuardBrokenReason {
    return this.brokenReason;
  }

  getCapacity(): number {
    return this.capacity;
  }

  getActiveCount(): number {
    return this.activeTasks.size;
  }

  getSnapshot(): GuardStateSnapshot {
    return {
      state: this.state,
      brokenReason: this.brokenReason,
      capacity: this.capacity,
      activeTasks: this.activeTasks.size,
      stuckTasks: this.stuckTasks.size,
      extensionUri: TASK_CAPACITY_EXTENSION_URI,
    };
  }

  resolveTimeoutMs(options?: ExecuteTaskOptions): number {
    if (options?.timeoutMs !== undefined) {
      return validateTimeoutMs(options.timeoutMs, 'timeoutMs');
    }
    return options?.profile === PROFILE_HEAVY_TRANSFER
      ? this.heavyTransferTimeoutMs
      : this.defaultTimeoutMs;
  }

  acquireSlot(taskId?: string): TaskSlotLease {
    const record = this.acquireRecord(taskId);
    return {
      taskId: record.taskId,
      signal: record.controller.signal,
      release: () => {
        this.releaseSlotById(record.taskId);
      },
    };
  }

  async executeTask<T>(
    taskFn: (signal: AbortSignal) => Promise<T>,
    options?: ExecuteTaskOptions
  ): Promise<T> {
    const timeoutMs = this.resolveTimeoutMs(options);
    try {
      return await this.runSingleAttempt(taskFn, timeoutMs, options);
    } catch (error) {
      if (!this.shouldRetryAttempt(error, options)) {
        throw error;
      }
      return this.runSingleAttempt(taskFn, timeoutMs, options);
    }
  }

  recoverStuckTasks(): RecoveryReport {
    const previousReason = this.brokenReason;
    const recoveredCount =
      this.abortAndClearMap(this.stuckTasks) + this.abortAndClearMap(this.activeTasks);
    this.state = STATE_AVAILABLE;
    this.brokenReason = null;
    return {
      recoveredCount,
      previousReason,
      state: this.state,
    };
  }

  probeHealth(options?: { autoRecoverStuck?: boolean }): HealthProbeReport {
    if (options?.autoRecoverStuck && this.isStuckBroken()) {
      const report = this.recoverStuckTasks();
      return {
        healthy: true,
        recovered: true,
        recoveredCount: report.recoveredCount,
        snapshot: this.getSnapshot(),
      };
    }
    return {
      healthy: this.state !== STATE_BROKEN,
      recovered: false,
      recoveredCount: 0,
      snapshot: this.getSnapshot(),
    };
  }

  applyWorkerExit(input: WorkerExitInput): WorkerExitEvaluation {
    const evaluation = evaluateWorkerExit(input);
    if (!evaluation.healthy) {
      this.markBroken(REASON_OFFLINE);
    }
    return evaluation;
  }

  private assertReservable(): void {
    if (this.state === STATE_BROKEN) {
      throw createGuardBrokenError(this.brokenReason);
    }
    if (this.activeTasks.size >= this.capacity) {
      throw createGuardBusyError(this.capacity);
    }
  }

  private acquireRecord(taskId?: string): ActiveTaskRecord {
    this.assertReservable();
    this.sequence += 1;
    const resolvedId = taskId ?? `task-${this.sequence}`;
    const record: ActiveTaskRecord = {
      taskId: resolvedId,
      controller: new AbortController(),
      timedOut: false,
    };
    this.activeTasks.set(resolvedId, record);
    this.syncOperationalState();
    return record;
  }

  private releaseSlotById(taskId: string): void {
    const record = this.activeTasks.get(taskId);
    if (!record) {
      return;
    }
    this.releaseRecord(record);
  }

  private releaseRecord(record: ActiveTaskRecord): void {
    this.clearRecordTimer(record);
    this.activeTasks.delete(record.taskId);
    this.syncOperationalState();
  }

  private clearRecordTimer(record: ActiveTaskRecord): void {
    if (record.timer !== undefined) {
      clearTimeout(record.timer);
      record.timer = undefined;
    }
  }

  private syncOperationalState(): void {
    if (this.state === STATE_BROKEN) {
      return;
    }
    this.state = this.activeTasks.size >= this.capacity ? STATE_BUSY : STATE_AVAILABLE;
  }

  private markBroken(reason: GuardBrokenReason): void {
    this.state = STATE_BROKEN;
    this.brokenReason = reason;
  }

  private isStuckBroken(): boolean {
    return this.state === STATE_BROKEN && this.brokenReason === REASON_TASK_STUCK;
  }

  private shouldRetryAttempt(error: unknown, options?: ExecuteTaskOptions): boolean {
    if (this.state === STATE_BROKEN) {
      return false;
    }
    return canRetryTask(options) && isTransientTransportError(error);
  }

  private async runSingleAttempt<T>(
    taskFn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    options?: ExecuteTaskOptions
  ): Promise<T> {
    const record = this.acquireRecord(options?.taskId);
    try {
      return await this.raceRecordWithTimeout(record, taskFn, timeoutMs);
    } finally {
      this.releaseRecord(record);
      await cleanupArtifactsSafe(options?.artifactPaths);
    }
  }

  private raceRecordWithTimeout<T>(
    record: ActiveTaskRecord,
    taskFn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      record.timer = setTimeout(() => {
        this.handleTaskTimeout(record, timeoutMs, reject);
      }, timeoutMs);
      record.timer.unref();
    });
    return Promise.race([taskFn(record.controller.signal), timeoutPromise]);
  }

  private handleTaskTimeout(
    record: ActiveTaskRecord,
    timeoutMs: number,
    reject: (reason?: unknown) => void
  ): void {
    record.timedOut = true;
    this.activeTasks.delete(record.taskId);
    this.stuckTasks.set(record.taskId, record);
    this.markBroken(REASON_TASK_STUCK);
    const stuckError = createTaskStuckError(record.taskId, timeoutMs);
    record.controller.abort(stuckError);
    reject(stuckError);
  }

  private abortAndClearMap(records: Map<string, ActiveTaskRecord>): number {
    let count = 0;
    for (const record of records.values()) {
      this.clearRecordTimer(record);
      if (!record.controller.signal.aborted) {
        record.controller.abort(createTaskStuckError(record.taskId, 0));
      }
      count += 1;
    }
    records.clear();
    return count;
  }
}
