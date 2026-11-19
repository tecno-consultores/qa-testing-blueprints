// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkspacePathValidationError,
  resolveSafeProjectPath,
} from '../src/security/workspacePathValidator.js';

describe('workspacePathValidator (F2.5 SEC-PATH-01)', () => {
  let tmpSubDir: string;
  let origVitest: string | undefined;
  let origNodeEnv: string | undefined;
  let origWorkspaceRoots: string | undefined;

  beforeEach(() => {
    tmpSubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-path-val-'));
    origVitest = process.env.VITEST;
    origNodeEnv = process.env.NODE_ENV;
    origWorkspaceRoots = process.env.QA11X_WORKSPACE_ROOTS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (origVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = origVitest;
    }
    if (origNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = origNodeEnv;
    }
    if (origWorkspaceRoots === undefined) {
      delete process.env.QA11X_WORKSPACE_ROOTS;
    } else {
      process.env.QA11X_WORKSPACE_ROOTS = origWorkspaceRoots;
    }
    fs.rmSync(tmpSubDir, { recursive: true, force: true });
  });

  it('rechaza entradas vacías, bytes NUL y segmentos de traversal .. (incluyendo NFKC y backslash)', () => {
    for (const invalid of [
      '',
      '   ',
      'proj\0evil',
      '..',
      '../outside',
      'sub/../outside',
      'sub\\..\\outside',
      'sub/..',
      '\uFF0E\uFF0E/outside',
    ]) {
      expect(() => resolveSafeProjectPath(invalid)).toThrow(WorkspacePathValidationError);
    }

    const err = new WorkspacePathValidationError('custom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('WorkspacePathValidationError');
  });

  it('permite nombres legítimos con puntos que no son segmentos ..', () => {
    const dotDir = path.join(tmpSubDir, 'my..project');
    fs.mkdirSync(dotDir, { recursive: true });
    expect(resolveSafeProjectPath(dotDir)).toBe(fs.realpathSync(dotDir));

    const hiddenDot = path.join(tmpSubDir, '..hidden');
    fs.mkdirSync(hiddenDot, { recursive: true });
    expect(resolveSafeProjectPath(hiddenDot)).toBe(fs.realpathSync(hiddenDot));
  });

  it('rechaza rutas críticas del sistema, raíz /, raíz de tmpdir y raíz $HOME', () => {
    for (const sysPath of [
      '/',
      '/etc',
      '/etc/passwd',
      '/usr/bin',
      '/var/log/syslog',
      '/bin',
      '/sbin',
      '/proc',
      '/sys',
      '/dev',
      '/boot',
      '/root',
      '/lib',
      '/lib64',
      '/System/Library',
      '/Library/Preferences',
      os.tmpdir(),
      `${os.tmpdir()}/`,
      os.homedir(),
    ]) {
      expect(() => resolveSafeProjectPath(sysPath)).toThrow(WorkspacePathValidationError);
    }
  });

  it('rechaza colisiones de prefijo como /tmp-evil y permite subdirectorios bajo tmpdir estilo macOS (/var/tmp)', () => {
    expect(() => resolveSafeProjectPath('/tmp-evil/project')).toThrow(WorkspacePathValidationError);

    vi.spyOn(os, 'tmpdir').mockReturnValue('/var/tmp');
    const resolvedMacLike = resolveSafeProjectPath('/var/tmp/macos-like-proj');
    expect(resolvedMacLike).toBe(path.join(fs.realpathSync('/var/tmp'), 'macos-like-proj'));
    expect(() => resolveSafeProjectPath('/var/tmp')).toThrow(WorkspacePathValidationError);
    expect(() => resolveSafeProjectPath('/var/log')).toThrow(WorkspacePathValidationError);
  });

  it('tolera fallos o cadena vacía de os.homedir() sin romper la validación', () => {
    vi.spyOn(os, 'homedir').mockReturnValueOnce('/home/qa-validator-home');
    expect(() => resolveSafeProjectPath('/home/qa-validator-home')).toThrow(
      WorkspacePathValidationError
    );

    vi.spyOn(os, 'homedir').mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(resolveSafeProjectPath(tmpSubDir)).toBe(fs.realpathSync(tmpSubDir));

    vi.spyOn(os, 'homedir').mockReturnValueOnce('');
    expect(resolveSafeProjectPath(tmpSubDir)).toBe(fs.realpathSync(tmpSubDir));
  });

  it('aplica contención estricta en cwd, QA11X_WORKSPACE_ROOTS y solo tmpdir en tests', () => {
    expect(resolveSafeProjectPath(process.cwd())).toBe(fs.realpathSync(process.cwd()));

    // Padre de mcp-server (cuando cwd es mcp-server) NO está permitido sin QA11X_WORKSPACE_ROOTS
    const parentOfCwd = path.dirname(fs.realpathSync(process.cwd()));
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    delete process.env.QA11X_WORKSPACE_ROOTS;

    expect(() => resolveSafeProjectPath(parentOfCwd)).toThrow(WorkspacePathValidationError);
    expect(() => resolveSafeProjectPath(tmpSubDir)).toThrow(WorkspacePathValidationError);

    // NODE_ENV=test sin VITEST sí habilita subdirectorios bajo tmpdir
    process.env.NODE_ENV = 'test';
    expect(resolveSafeProjectPath(tmpSubDir)).toBe(fs.realpathSync(tmpSubDir));

    // VITEST=true con NODE_ENV=production también habilita subdirectorios bajo tmpdir
    process.env.VITEST = 'true';
    process.env.NODE_ENV = 'production';
    expect(resolveSafeProjectPath(tmpSubDir)).toBe(fs.realpathSync(tmpSubDir));

    // En producción, QA11X_WORKSPACE_ROOTS habilita raíces válidas e ignora inexistentes
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    const nonexistentRoot = path.join(tmpSubDir, 'does-not-exist-root');
    process.env.QA11X_WORKSPACE_ROOTS = ` ${nonexistentRoot} ${path.delimiter} ${tmpSubDir} `;
    const nested = path.join(tmpSubDir, 'allowed-nested');
    fs.mkdirSync(nested, { recursive: true });
    expect(resolveSafeProjectPath(nested)).toBe(fs.realpathSync(nested));

    process.env.QA11X_WORKSPACE_ROOTS = '/';
    expect(() => resolveSafeProjectPath('/custom-workspace-leaf')).toThrow(WorkspacePathValidationError);
  });

  it('resuelve symlinks y bloquea escapes por symlink o hojas inexistentes cuando allowNonExistentLeaf=false', () => {
    const symlinkToEtc = path.join(tmpSubDir, 'link-etc');
    fs.symlinkSync('/etc', symlinkToEtc);
    expect(() => resolveSafeProjectPath(symlinkToEtc)).toThrow(WorkspacePathValidationError);
    expect(() => resolveSafeProjectPath(path.join(symlinkToEtc, 'nonexistent-leaf'))).toThrow(
      WorkspacePathValidationError
    );

    const missingLeaf = path.join(tmpSubDir, 'missing', 'leaf');
    expect(resolveSafeProjectPath(missingLeaf)).toBe(
      path.join(fs.realpathSync(tmpSubDir), 'missing', 'leaf')
    );
    expect(() => resolveSafeProjectPath(missingLeaf, { allowNonExistentLeaf: false })).toThrow(
      WorkspacePathValidationError
    );
    expect(resolveSafeProjectPath(tmpSubDir, { allowNonExistentLeaf: false })).toBe(
      fs.realpathSync(tmpSubDir)
    );
  });

  it('cubre fallback cuando fs.existsSync devuelve false hasta la raíz del sistema', () => {
    const existsSpy = vi.spyOn(fs, 'existsSync');
    existsSpy.mockReturnValue(false);
    expect(() => resolveSafeProjectPath('/unmounted/missing/path')).toThrow(
      WorkspacePathValidationError
    );

    const lockedParent = path.join(tmpSubDir, 'locked-parent');
    const lockedTmp = path.join(lockedParent, 'nested-tmp');
    const tmpLeaf = path.join(lockedParent, 'unresolvable-node');
    fs.mkdirSync(tmpLeaf, { recursive: true });
    fs.mkdirSync(lockedTmp, { recursive: true });
    const prevTmpDir = process.env.TMPDIR;
    fs.chmodSync(lockedParent, 0o600);
    process.env.TMPDIR = lockedTmp;
    try {
      expect(() => resolveSafeProjectPath(tmpLeaf)).toThrow(/No se pudo resolver de forma segura/);
    } finally {
      if (prevTmpDir === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = prevTmpDir;
      }
      fs.chmodSync(lockedParent, 0o700);
    }
  });

  it('excluye cwd "/" de raíces permitidas, tolera realpathSync fallido e indica QA11X_WORKSPACE_ROOTS en error', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    delete process.env.QA11X_WORKSPACE_ROOTS;

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/');
    expect(() => resolveSafeProjectPath('/opt/outside-project')).toThrow(/QA11X_WORKSPACE_ROOTS/);

    cwdSpy.mockReturnValue('/nonexistent-cwd-11x');
    expect(() => resolveSafeProjectPath('/opt/outside-project')).toThrow(
      WorkspacePathValidationError
    );
  });

  it('detecta y bloquea enlaces simbólicos colgantes fuera del límite y ciclos ELOOP', () => {
    const danglingLink = path.join(tmpSubDir, 'dangling-etc-link');
    fs.symlinkSync('/etc/nonexistent-qa11x-target', danglingLink);
    expect(() => resolveSafeProjectPath(danglingLink)).toThrow(WorkspacePathValidationError);
    expect(() => resolveSafeProjectPath(path.join(danglingLink, 'nested'))).toThrow(
      WorkspacePathValidationError
    );

    const loopA = path.join(tmpSubDir, 'loop-a');
    const loopB = path.join(tmpSubDir, 'loop-b');
    fs.symlinkSync(loopB, loopA);
    fs.symlinkSync(loopA, loopB);
    expect(() => resolveSafeProjectPath(loopA)).toThrow(/ELOOP/i);

    const prevTmpDir = process.env.TMPDIR;
    process.env.TMPDIR = loopA;
    try {
      expect(resolveSafeProjectPath(process.cwd())).toBe(fs.realpathSync(process.cwd()));
    } finally {
      if (prevTmpDir === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = prevTmpDir;
      }
    }
  });
});
