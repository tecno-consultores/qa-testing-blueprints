// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import type * as FsTypes from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type LstatSyncFn = typeof FsTypes.lstatSync;
type RealpathSyncFn = typeof FsTypes.realpathSync;

const mockHooks = vi.hoisted(() => ({
  lstatOverride: null as ((target: FsTypes.PathLike, opts?: unknown) => FsTypes.Stats | undefined) | null,
  realpathOverride: null as ((target: FsTypes.PathLike) => string) | null,
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

import { resolveRealTargetWithSymlinks } from '../src/security/pathRealResolver.js';

describe('pathRealResolver (fallback defensivo de lstatSync/realpathSync)', () => {
  afterEach(() => {
    mockHooks.lstatOverride = null;
    mockHooks.realpathOverride = null;
  });

  it('retorna candidate sin resolver cuando lstatSync devuelve undefined hasta la raíz del sistema', () => {
    mockHooks.lstatOverride = () => undefined;
    const target = '/unmounted-root-probe/sub/leaf';
    expect(resolveRealTargetWithSymlinks(target)).toEqual({
      ok: true,
      resolved: target,
    });
  });

  it('retorna path.resolve(cur) + tail cuando realpathSync falla sobre un nodo que no es symlink', () => {
    const fakeStat = { isSymbolicLink: () => false } as unknown as FsTypes.Stats;
    mockHooks.lstatOverride = (target) => (String(target) === '/tmp/non-link-dir' ? fakeStat : undefined);
    mockHooks.realpathOverride = () => {
      throw new Error('EACCES');
    };

    expect(resolveRealTargetWithSymlinks('/tmp/non-link-dir/nested/file.txt')).toEqual({
      ok: true,
      resolved: path.join(path.resolve('/tmp/non-link-dir'), 'nested', 'file.txt'),
    });
  });
});
