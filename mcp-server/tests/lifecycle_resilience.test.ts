// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, shouldExitInteractiveTty } from '../src/index.js';
import {
  DEFAULT_HEAVY_TRANSFER_TIMEOUT_MS,
  DEFAULT_TELEMETRY_TIMEOUT_MS,
  MAX_TASK_CAPACITY,
  MIN_TASK_CAPACITY,
  TASK_CAPACITY_EXTENSION_URI,
  TaskGuardError,
  TaskStateGuard,
  canRetryTask,
  cleanupZeroByteArtifacts,
  evaluateWorkerExit,
  isTransientTransportError,
  probeTtyExitNonBlocking,
  validateCapacity,
  validateTimeoutMs,
} from '../src/utils/taskStateGuard.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeErrno(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe('TaskStateGuard & Lifecycle Resilience (T1.4)', () => {
  let tmpDir: string;
  let originalForceStdio: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-t14-resilience-'));
    originalForceStdio = process.env.QA_FORCE_STDIO;
  });

  afterEach(() => {
    if (originalForceStdio === undefined) {
      delete process.env.QA_FORCE_STDIO;
    } else {
      process.env.QA_FORCE_STDIO = originalForceStdio;
    }
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('1. Reserva atómica concurrente y validación de capacidad', () => {
    it('valida límites de capacidad (1..32) y timeouts positivos', () => {
      expect(validateCapacity()).toBe(MIN_TASK_CAPACITY);
      expect(validateCapacity(MAX_TASK_CAPACITY)).toBe(MAX_TASK_CAPACITY);
      expect(() => validateCapacity(0)).toThrow(RangeError);
      expect(() => validateCapacity(33)).toThrow(RangeError);
      expect(() => validateCapacity(1.5)).toThrow(RangeError);
      expect(validateTimeoutMs(50, 'custom')).toBe(50);
      expect(() => validateTimeoutMs(0, 'zero')).toThrow(RangeError);
      expect(() => validateTimeoutMs(-10, 'negative')).toThrow(RangeError);
      expect(() => validateTimeoutMs(Number.NaN, 'nan')).toThrow(RangeError);
    });

    it('ejecuta reserva atómica con capacity=1 (AVAILABLE -> BUSY -> AVAILABLE) sin double-booking', async () => {
      const guard = new TaskStateGuard();
      const gate = createDeferred<void>();
      expect(guard.getCapacity()).toBe(1);
      expect(guard.getState()).toBe('AVAILABLE');

      const p1 = guard.executeTask(async () => {
        expect(guard.getState()).toBe('BUSY');
        expect(guard.getActiveCount()).toBe(1);
        await gate.promise;
        return 'first-ok';
      });
      const p2 = guard.executeTask(async () => 'second-should-reject');

      expect(guard.getState()).toBe('BUSY');
      gate.resolve();

      const [r1, r2] = await Promise.all([
        p1,
        p2.catch((err: unknown) => err),
      ]);

      expect(r1).toBe('first-ok');
      expect(r2).toBeInstanceOf(TaskGuardError);
      const busyErr = r2 as TaskGuardError;
      expect(busyErr.statusCode).toBe(409);
      expect(busyErr.code).toBe('GUARD_BUSY');
      expect(busyErr.guardState).toBe('BUSY');
      expect(busyErr.brokenReason).toBeNull();
      expect(guard.getState()).toBe('AVAILABLE');
      expect(guard.getActiveCount()).toBe(0);
    });

    it('soporta capacity=3 concurrente, rechaza 4ta reserva (409) y expone extensión A2A', async () => {
      const guard = new TaskStateGuard({ capacity: 3 });
      const gates = [createDeferred<number>(), createDeferred<number>(), createDeferred<number>()];
      let maxObserved = 0;

      const makeWorker = (idx: number) =>
        guard.executeTask(async () => {
          maxObserved = Math.max(maxObserved, guard.getActiveCount());
          return gates[idx].promise;
        });

      const p1 = makeWorker(0);
      expect(guard.getState()).toBe('AVAILABLE');
      const p2 = makeWorker(1);
      expect(guard.getState()).toBe('AVAILABLE');
      const p3 = makeWorker(2);
      expect(guard.getState()).toBe('BUSY');

      const snap = guard.getSnapshot();
      expect(snap).toEqual({
        state: 'BUSY',
        brokenReason: null,
        capacity: 3,
        activeTasks: 3,
        stuckTasks: 0,
        extensionUri: TASK_CAPACITY_EXTENSION_URI,
      });

      const p4 = guard.executeTask(async () => 99).catch((err: unknown) => err);

      gates[0].resolve(1);
      gates[1].resolve(2);
      gates[2].resolve(3);

      const results = await Promise.all([p1, p2, p3, p4]);
      expect(maxObserved).toBe(3);
      expect(results.slice(0, 3)).toEqual([1, 2, 3]);
      expect(results[3]).toBeInstanceOf(TaskGuardError);
      expect((results[3] as TaskGuardError).statusCode).toBe(409);
      expect(guard.getState()).toBe('AVAILABLE');
    });

    it('permite acquireSlot y release() idempotente', () => {
      const guard = new TaskStateGuard({ capacity: 1 });
      const lease = guard.acquireSlot('manual-lease');
      expect(lease.taskId).toBe('manual-lease');
      expect(lease.signal.aborted).toBe(false);
      expect(guard.getState()).toBe('BUSY');
      expect(() => guard.acquireSlot('second')).toThrowError(TaskGuardError);

      lease.release();
      lease.release();
      expect(guard.getState()).toBe('AVAILABLE');
      expect(guard.getActiveCount()).toBe(0);
    });
  });

  describe('2. Detección de TASK_STUCK, AbortSignal y recuperación determinista', () => {
    it('aborta tarea colgada, transiciona a BROKEN (TASK_STUCK), rechaza 503 y recupera', async () => {
      const guard = new TaskStateGuard({ capacity: 2, defaultTimeoutMs: 30 });
      let observedAborted = false;

      const stuckPromise = guard.executeTask(
        (signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              observedAborted = true;
              reject(signal.reason);
            });
          }),
        { taskId: 'stuck-job' }
      );

      const caught = await stuckPromise.catch((err: unknown) => err);
      expect(caught).toBeInstanceOf(TaskGuardError);
      const stuckErr = caught as TaskGuardError;
      expect(stuckErr.statusCode).toBe(504);
      expect(stuckErr.code).toBe('TASK_STUCK');
      expect(observedAborted).toBe(true);
      expect(guard.getState()).toBe('BROKEN');
      expect(guard.getBrokenReason()).toBe('TASK_STUCK');

      const healthBefore = guard.probeHealth();
      expect(healthBefore.healthy).toBe(false);
      expect(healthBefore.recovered).toBe(false);
      expect(healthBefore.snapshot.stuckTasks).toBe(1);

      const blockedErr = await guard.executeTask(async () => 'nope').catch((err: unknown) => err);
      expect(blockedErr).toBeInstanceOf(TaskGuardError);
      expect((blockedErr as TaskGuardError).statusCode).toBe(503);
      expect((blockedErr as TaskGuardError).code).toBe('GUARD_BROKEN');

      const recovery = guard.recoverStuckTasks();
      expect(recovery).toEqual({
        recoveredCount: 1,
        previousReason: 'TASK_STUCK',
        state: 'AVAILABLE',
      });
      expect(guard.getState()).toBe('AVAILABLE');
      expect(guard.getBrokenReason()).toBeNull();

      const afterRecovery = await guard.executeTask(async () => 'healthy-again');
      expect(afterRecovery).toBe('healthy-again');
    });

    it('soporta autoRecoverStuck en probeHealth() y cancelación de slots activos remanentes', async () => {
      const guard = new TaskStateGuard({ capacity: 2, defaultTimeoutMs: 25 });
      const activeLease = guard.acquireSlot('orphan-active-slot');

      const stuckErr = await guard
        .executeTask(
          () => new Promise<never>(() => undefined),
          { taskId: 'never-resolves', timeoutMs: 25 }
        )
        .catch((err: unknown) => err);
      expect((stuckErr as TaskGuardError).code).toBe('TASK_STUCK');
      expect(activeLease.signal.aborted).toBe(false);

      const health = guard.probeHealth({ autoRecoverStuck: true });
      expect(health.healthy).toBe(true);
      expect(health.recovered).toBe(true);
      expect(health.recoveredCount).toBe(2);
      expect(activeLease.signal.aborted).toBe(true);
      expect(guard.getState()).toBe('AVAILABLE');
    });
  });

  describe('3. Reintento seguro por idempotencia', () => {
    it('reintenta exactamente 1 vez operaciones readOnly/idempotent ante error transitorio', async () => {
      const guard = new TaskStateGuard();
      let callsReadOnly = 0;

      const res1 = await guard.executeTask(
        async () => {
          callsReadOnly += 1;
          if (callsReadOnly === 1) {
            throw makeErrno('socket reset', 'ECONNRESET');
          }
          return 'ok-after-retry';
        },
        { readOnly: true }
      );
      expect(callsReadOnly).toBe(2);
      expect(res1).toBe('ok-after-retry');

      let callsIdempotent = 0;
      const res2 = await guard.executeTask(
        async () => {
          callsIdempotent += 1;
          if (callsIdempotent === 1) {
            throw new Error('stream truncated prematurely');
          }
          return 'ok-idempotent';
        },
        { idempotent: true }
      );
      expect(callsIdempotent).toBe(2);
      expect(res2).toBe('ok-idempotent');

      let doubleFailCalls = 0;
      await expect(
        guard.executeTask(
          async () => {
            doubleFailCalls += 1;
            throw makeErrno('timed out twice', 'ETIMEDOUT');
          },
          { idempotent: true }
        )
      ).rejects.toThrow('timed out twice');
      expect(doubleFailCalls).toBe(2);
    });

    it('prohíbe reintentos en operaciones mutadoras (idempotent: false) o errores no transitorios', async () => {
      const guard = new TaskStateGuard();
      let mutateCalls = 0;

      await expect(
        guard.executeTask(
          async () => {
            mutateCalls += 1;
            throw makeErrno('reset during mutation', 'ECONNRESET');
          },
          { idempotent: false }
        )
      ).rejects.toThrow('reset during mutation');
      expect(mutateCalls).toBe(1);

      let overrideCalls = 0;
      await expect(
        guard.executeTask(
          async () => {
            overrideCalls += 1;
            throw makeErrno('reset with explicit override', 'ECONNRESET');
          },
          { readOnly: true, idempotent: false }
        )
      ).rejects.toThrow('reset with explicit override');
      expect(overrideCalls).toBe(1);

      let domainCalls = 0;
      await expect(
        guard.executeTask(
          async () => {
            domainCalls += 1;
            throw new Error('400 Bad Request validation failure');
          },
          { idempotent: true }
        )
      ).rejects.toThrow('400 Bad Request');
      expect(domainCalls).toBe(1);

      expect(canRetryTask()).toBe(false);
      expect(isTransientTransportError('plain-string-error')).toBe(false);
      expect(isTransientTransportError(new Error('permission denied'))).toBe(false);
    });
  });

  describe('4. Purga de artefactos 0 bytes y perfiles de timeout', () => {
    it('separa perfiles telemetry (<10s) vs heavy_transfer (>=180s) con override explícito', () => {
      const guard = new TaskStateGuard();
      expect(DEFAULT_TELEMETRY_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
      expect(DEFAULT_TELEMETRY_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
      expect(DEFAULT_HEAVY_TRANSFER_TIMEOUT_MS).toBeGreaterThanOrEqual(180_000);

      expect(guard.resolveTimeoutMs()).toBe(DEFAULT_TELEMETRY_TIMEOUT_MS);
      expect(guard.resolveTimeoutMs({ profile: 'telemetry' })).toBe(DEFAULT_TELEMETRY_TIMEOUT_MS);
      expect(guard.resolveTimeoutMs({ profile: 'heavy_transfer' })).toBeGreaterThanOrEqual(180_000);
      expect(guard.resolveTimeoutMs({ profile: 'heavy_transfer', timeoutMs: 250 })).toBe(250);
    });

    it('purga archivos truncados de 0 bytes y conserva archivos válidos > 0 bytes sin errores secundarios', async () => {
      const guard = new TaskStateGuard({ heavyTransferTimeoutMs: 185_000 });
      const zeroByteFile = path.join(tmpDir, 'truncated-download.tar.gz');
      const validFile = path.join(tmpDir, 'valid-artifact.tar.gz');
      const missingFile = path.join(tmpDir, 'never-created.bin');
      const subDir = path.join(tmpDir, 'nested-dir');

      fs.writeFileSync(zeroByteFile, Buffer.alloc(0));
      fs.writeFileSync(validFile, 'valid-payload-bytes', 'utf8');
      fs.mkdirSync(subDir);

      await expect(
        guard.executeTask(
          async () => {
            throw makeErrno('stream closed mid-transfer', 'ERR_STREAM_PREMATURE_CLOSE');
          },
          {
            profile: 'heavy_transfer',
            timeoutMs: 200,
            idempotent: false,
            artifactPaths: [zeroByteFile, validFile, missingFile, subDir],
          }
        )
      ).rejects.toThrow('stream closed mid-transfer');

      expect(fs.existsSync(zeroByteFile)).toBe(false);
      expect(fs.existsSync(validFile)).toBe(true);
      expect(fs.readFileSync(validFile, 'utf8')).toBe('valid-payload-bytes');
      expect(fs.existsSync(subDir)).toBe(true);

      const secondZero = path.join(tmpDir, 'direct-zero.bin');
      fs.writeFileSync(secondZero, '', 'utf8');
      const purged = await cleanupZeroByteArtifacts([secondZero, validFile, missingFile]);
      expect(purged).toEqual([secondZero]);
      expect(fs.existsSync(secondZero)).toBe(false);
      expect(fs.existsSync(validFile)).toBe(true);
    });
  });

  describe('5. Semántica QA-HEALTH-01 y sonda no bloqueante QA-CLI-TTY-01', () => {
    it('evalúa salidas de workers según contrato QA-HEALTH-01', () => {
      expect(evaluateWorkerExit({ optional: true, cancelled: false, error: null })).toEqual({
        healthy: true,
        state: 'AVAILABLE',
        brokenReason: null,
      });
      expect(evaluateWorkerExit({ optional: false, cancelled: true, error: null })).toEqual({
        healthy: true,
        state: 'AVAILABLE',
        brokenReason: null,
      });
      expect(evaluateWorkerExit({ optional: false, cancelled: false, error: null })).toEqual({
        healthy: false,
        state: 'BROKEN',
        brokenReason: 'OFFLINE',
      });

      const guard = new TaskStateGuard();
      const optionalOk = guard.applyWorkerExit({ optional: true, error: null });
      expect(optionalOk.healthy).toBe(true);
      expect(guard.getState()).toBe('AVAILABLE');

      const workerCrash = guard.applyWorkerExit({ optional: true, error: new Error('worker crashed') });
      expect(workerCrash).toEqual({
        healthy: false,
        state: 'BROKEN',
        brokenReason: 'OFFLINE',
      });
      expect(guard.getState()).toBe('BROKEN');
      expect(guard.getBrokenReason()).toBe('OFFLINE');
    });

    it('certifica QA-CLI-TTY-01 con salida rápida exit(0) (<5s) sin colgar en entorno TTY', async () => {
      delete process.env.QA_FORCE_STDIO;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const probe = await probeTtyExitNonBlocking(async (exitFn) => {
        await main([], undefined, exitFn, async () => undefined, true);
      }, 2_000);

      expect(probe.exitCode).toBe(0);
      expect(probe.elapsedMs).toBeLessThan(5_000);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(shouldExitInteractiveTty('stdio-forced', false, true)).toBe(false);

      await expect(
        probeTtyExitNonBlocking(async () => undefined, 200)
      ).rejects.toThrowError(TaskGuardError);
    });
  });
});
