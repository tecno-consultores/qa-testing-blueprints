// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type * as FsTypes from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type LstatSyncFn = typeof FsTypes.lstatSync;
type RealpathSyncFn = typeof FsTypes.realpathSync;
type ReadlinkSyncFn = typeof FsTypes.readlinkSync;

const mockHooks = vi.hoisted(() => ({
  lstatOverride: null as ((target: FsTypes.PathLike, opts?: unknown) => FsTypes.Stats | undefined) | null,
  realpathOverride: null as ((target: FsTypes.PathLike) => string) | null,
  readlinkOverride: null as ((target: FsTypes.PathLike) => string) | null,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FsTypes>();
  return {
    ...actual,
    lstatSync: ((target: FsTypes.PathLike, opts?: unknown) => {
      if (mockHooks.lstatOverride) {
        return mockHooks.lstatOverride(target, opts);
      }
      return actual.lstatSync(target, opts as FsTypes.StatSyncOptions);
    }) as LstatSyncFn,
    readlinkSync: ((target: FsTypes.PathLike) => {
      if (mockHooks.readlinkOverride) {
        return mockHooks.readlinkOverride(target);
      }
      return actual.readlinkSync(target, 'utf8');
    }) as ReadlinkSyncFn,
    realpathSync: Object.assign(
      ((target: FsTypes.PathLike) => {
        if (mockHooks.realpathOverride) {
          return mockHooks.realpathOverride(target);
        }
        return actual.realpathSync(target);
      }) as RealpathSyncFn,
      actual.realpathSync
    ),
  };
});

import { assertNoSymlinkSegments, resolveRealTargetWithSymlinks } from '../src/security/pathRealResolver.js';

describe('pathRealResolver (fallback defensivo de lstatSync/realpathSync)', () => {
  afterEach(() => {
    mockHooks.lstatOverride = null;
    mockHooks.realpathOverride = null;
    mockHooks.readlinkOverride = null;
  });

  it('retorna candidate sin resolver cuando lstatSync devuelve undefined hasta la raíz del sistema', () => {
    mockHooks.lstatOverride = () => undefined;
    const target = '/unmounted-root-probe/sub/leaf';
    expect(resolveRealTargetWithSymlinks(target)).toEqual({
      ok: true,
      resolved: target,
    });
  });

  it('falla cerrado (unresolvable) cuando realpathSync o lstatSync fallan sobre un nodo no symlink', () => {
    const fakeStat = { isSymbolicLink: () => false } as unknown as FsTypes.Stats;
    mockHooks.lstatOverride = (target) => (String(target) === '/tmp/non-link-dir' ? fakeStat : undefined);
    mockHooks.realpathOverride = () => {
      throw new Error('EACCES');
    };

    expect(resolveRealTargetWithSymlinks('/tmp/non-link-dir/nested/file.txt')).toEqual({
      ok: false,
      loopPath: path.resolve('/tmp/non-link-dir'),
      reason: 'unresolvable',
    });

    mockHooks.lstatOverride = (target) => {
      if (String(target) === '/tmp/perm-denied') {
        const err = new Error('EACCES') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return undefined;
    };
    expect(resolveRealTargetWithSymlinks('/tmp/perm-denied/leaf')).toEqual({
      ok: false,
      loopPath: path.resolve('/tmp/perm-denied'),
      reason: 'unresolvable',
    });

    // Symlink relativo donde realpathSync falla sobre directorio padre activa resolveCanonicalParentDir fallback
    const linkStat = { isSymbolicLink: () => true } as unknown as FsTypes.Stats;
    mockHooks.lstatOverride = (target) => (String(target) === '/tmp/rel-dir/sym' ? linkStat : undefined);
    mockHooks.realpathOverride = (target) => {
      if (String(target) === '/tmp/rel-dir/sym' || String(target) === '/tmp/rel-dir') {
        throw new Error('EACCES');
      }
      return String(target);
    };
    mockHooks.readlinkOverride = () => '../resolved-dest';
    expect(() => resolveRealTargetWithSymlinks('/tmp/rel-dir/sym')).not.toThrow();

    // readlinkSync fallido sobre symlink falla cerrado con reason='unresolvable'
    mockHooks.readlinkOverride = () => {
      throw new Error('ENOENT');
    };
    expect(resolveRealTargetWithSymlinks('/tmp/rel-dir/sym')).toEqual({
      ok: false,
      loopPath: path.resolve('/tmp/rel-dir/sym'),
      reason: 'unresolvable',
    });

    // Ruta absoluta que escapa de rootDir es rechazada por assertNoSymlinkSegments
    expect(() => assertNoSymlinkSegments('/tmp/safe-root', '/etc/passwd')).toThrow(/fuera de raíz/i);
  });
});
