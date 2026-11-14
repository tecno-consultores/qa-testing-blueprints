// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_TASK_CAPACITY_URI,
  COMPAT_TASK_CAPACITY_URI,
  DEFAULT_AGENT_CARD_RELATIVE_PATH,
  DEFAULT_TASK_CAPACITY,
  GIT_CLOSURE_HUMAN_GATE_ID,
  QA_11X_V2_SKILLS,
  buildAgentCard,
  evaluateCapacityStatus,
  isSupportedTaskCapacityUri,
  validateTaskCapacity,
  validateTaskCapacityUri,
  writeAgentCardFile,
} from '../src/a2a/agentCard.js';
import { TaskStateGuard } from '../src/utils/taskStateGuard.js';

const tempDirs: string[] = [];

async function makeTempWorkspace(): Promise<string> {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'qa11x-a2a-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fsPromises.rm(dir, { recursive: true, force: true })));
});

describe('Agent2Agent Card Generator (buildAgentCard)', () => {
  it('genera el manifiesto por defecto con las 10 skills v2.0, extensión task-capacity y seguridad 11X', () => {
    const card = buildAgentCard();

    expect(card.name).toBe('qa-11x-mcp-agent');
    expect(card.version).toBe('2.20.3');
    expect(card.protocolVersion).toBe('0.2.1');
    expect(card.standardVersion).toBe('QA-11X v2.0');
    expect(card.activeModel).toBe('local-or-frontier-hybrid');
    expect(card.description).toContain(card.activeModel);
    expect(card.description).toContain('QA-11X v2.0');
    expect(card.description).toContain('qa-11x-architect');
    expect(card.capabilities).toEqual({
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    });
    expect(card.skills).toHaveLength(10);
    expect(card.skills.map((s) => s.id)).toEqual(QA_11X_V2_SKILLS.map((s) => s.id));
    expect(card.extensions).toHaveLength(1);
    expect(card.extensions[0]?.uri).toBe(CANONICAL_TASK_CAPACITY_URI);
    expect(card.extensions[0]?.params).toEqual({
      capacity: DEFAULT_TASK_CAPACITY,
      minCapacity: 1,
      maxCapacity: 32,
      compatibleUris: [CANONICAL_TASK_CAPACITY_URI, COMPAT_TASK_CAPACITY_URI],
    });
    expect(card.securityProfile).toEqual({
      promptGuard: true,
      ruleZeroEphemeralDocker: true,
      gitClosureHumanGate: GIT_CLOSURE_HUMAN_GATE_ID,
    });
  });

  it('soporta personalización completa, compatibilidad urn:quaia y clonación defensiva', () => {
    const customSkills = [
      {
        id: 'custom-skill',
        name: 'Custom Skill',
        description: 'Validación focalizada de dominio.',
        tags: ['custom', 'qa'],
      },
    ];
    const card = buildAgentCard({
      name: 'rosgrid-a2a-worker',
      description: 'Worker especializado de telemetría QA.',
      version: '3.1.0',
      url: 'https://agent.local/a2a',
      protocolVersion: '0.3.0',
      standardVersion: 'QA-11X v2.0',
      activeModel: 'qwen3.8-32b-instruct',
      capacity: 16,
      taskCapacityExtensionUri: COMPAT_TASK_CAPACITY_URI,
      capabilities: { streaming: true, pushNotifications: true },
      skills: customSkills,
      securityProfile: { promptGuard: true, ruleZeroEphemeralDocker: true, gitClosureHumanGate: 'QA-GIT-GATE-01' },
    });

    customSkills[0].tags.push('mutated');
    expect(card.name).toBe('rosgrid-a2a-worker');
    expect(card.description).toBe('Worker especializado de telemetría QA.');
    expect(card.activeModel).toBe('qwen3.8-32b-instruct');
    expect(card.capabilities).toEqual({
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true,
    });
    expect(card.extensions[0]?.uri).toBe(COMPAT_TASK_CAPACITY_URI);
    expect(card.extensions[0]?.params.capacity).toBe(16);
    expect(card.skills[0]?.tags).toEqual(['custom', 'qa']);
  });

  it('valida límites exactos de capacity (1..32) y URIs soportadas', () => {
    expect(validateTaskCapacity()).toBe(DEFAULT_TASK_CAPACITY);
    expect(validateTaskCapacity(1)).toBe(1);
    expect(validateTaskCapacity(32)).toBe(32);
    expect(isSupportedTaskCapacityUri(CANONICAL_TASK_CAPACITY_URI)).toBe(true);
    expect(isSupportedTaskCapacityUri(COMPAT_TASK_CAPACITY_URI)).toBe(true);
    expect(isSupportedTaskCapacityUri('urn:unknown:task-capacity:v1')).toBe(false);
    expect(validateTaskCapacityUri(CANONICAL_TASK_CAPACITY_URI)).toBe(CANONICAL_TASK_CAPACITY_URI);

    for (const invalidCapacity of [0, 33, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildAgentCard({ capacity: invalidCapacity })).toThrowError(RangeError);
    }

    expect(() => buildAgentCard({ taskCapacityExtensionUri: 'urn:evil:ext:v9' })).toThrowError(
      /A2A_UNSUPPORTED_EXTENSION_URI/
    );
    expect(() => buildAgentCard({ name: '   ' })).toThrowError(/A2A_INVALID_INPUT/);
    expect(() => buildAgentCard({ description: 'bad\0desc' })).toThrowError(/A2A_INVALID_INPUT/);
  });
});

describe('Agent2Agent Capacity Evaluation (evaluateCapacityStatus)', () => {
  it('transiciona deterministamente AVAILABLE -> BUSY al agotar los slots concurrentes', () => {
    expect(evaluateCapacityStatus(0)).toEqual({
      state: 'AVAILABLE',
      runningTasks: 0,
      capacity: 4,
      availableSlots: 4,
      saturated: false,
    });

    expect(evaluateCapacityStatus(3, 4)).toEqual({
      state: 'AVAILABLE',
      runningTasks: 3,
      capacity: 4,
      availableSlots: 1,
      saturated: false,
    });

    expect(evaluateCapacityStatus(4, 4)).toEqual({
      state: 'BUSY',
      runningTasks: 4,
      capacity: 4,
      availableSlots: 0,
      saturated: true,
    });

    expect(evaluateCapacityStatus(5, 4)).toEqual({
      state: 'BUSY',
      runningTasks: 5,
      capacity: 4,
      availableSlots: 0,
      saturated: true,
    });

    expect(evaluateCapacityStatus(0, 1).state).toBe('AVAILABLE');
    expect(evaluateCapacityStatus(1, 1).state).toBe('BUSY');
    expect(evaluateCapacityStatus(31, 32).availableSlots).toBe(1);
    expect(evaluateCapacityStatus(32, 32).state).toBe('BUSY');
  });

  it('mantiene paridad de estado con TaskStateGuard y rechaza contadores inválidos', async () => {
    const guard = new TaskStateGuard({ capacity: 2 });
    expect(evaluateCapacityStatus(guard.getActiveCount(), guard.getCapacity()).state).toBe('AVAILABLE');

    const lease1 = guard.acquireSlot('t-1');
    expect(evaluateCapacityStatus(guard.getActiveCount(), guard.getCapacity())).toMatchObject({
      state: 'AVAILABLE',
      availableSlots: 1,
    });

    const lease2 = guard.acquireSlot('t-2');
    expect(evaluateCapacityStatus(guard.getActiveCount(), guard.getCapacity())).toMatchObject({
      state: 'BUSY',
      availableSlots: 0,
    });

    lease1.release();
    lease2.release();
    expect(evaluateCapacityStatus(guard.getActiveCount(), guard.getCapacity()).state).toBe('AVAILABLE');

    expect(() => evaluateCapacityStatus(-1, 4)).toThrowError(RangeError);
    expect(() => evaluateCapacityStatus(1.2, 4)).toThrowError(RangeError);
    expect(() => evaluateCapacityStatus(0, 33)).toThrowError(RangeError);
  });
});

describe('Agent2Agent Card File Writer (writeAgentCardFile)', () => {
  it('escribe atómicamente .well-known/agent-card.json dentro de un workspace temporal', async () => {
    const workspace = await makeTempWorkspace();
    const result = await writeAgentCardFile(workspace, undefined, {
      capacity: 8,
      activeModel: 'qwen3.8-14b-ollama',
    });

    expect(result.relativePath).toBe(DEFAULT_AGENT_CARD_RELATIVE_PATH);
    expect(result.bytesWritten).toBeGreaterThan(100);
    const persisted = JSON.parse(await fsPromises.readFile(result.outputPath, 'utf-8'));
    expect(persisted.activeModel).toBe('qwen3.8-14b-ollama');
    expect(persisted.extensions[0].params.capacity).toBe(8);

    // Sobrescritura atómica en ruta relativa directa al root
    const customWrite = await writeAgentCardFile(workspace, 'custom-card.json', { capacity: 1 });
    expect(customWrite.relativePath).toBe('custom-card.json');
    const customJson = JSON.parse(await fsPromises.readFile(customWrite.outputPath, 'utf-8'));
    expect(customJson.extensions[0].params.capacity).toBe(1);
  });

  it('bloquea Path Traversal, rutas absolutas, symlinks escapados y destinos inválidos', async () => {
    const workspace = await makeTempWorkspace();
    const outsideDir = await makeTempWorkspace();

    await expect(writeAgentCardFile(workspace, '../../etc/passwd')).rejects.toThrowError(
      /A2A_PATH_TRAVERSAL/
    );
    await expect(writeAgentCardFile(workspace, '/etc/passwd')).rejects.toThrowError(
      /A2A_PATH_TRAVERSAL/
    );
    await expect(writeAgentCardFile(workspace, '.')).rejects.toThrowError(/A2A_PATH_TRAVERSAL/);
    await expect(writeAgentCardFile(workspace, '   ')).rejects.toThrowError(/A2A_INVALID_INPUT/);

    // Bloqueo de escape por symlink en directorio intermedio
    const symlinkDir = path.join(workspace, 'linked-out');
    await fsPromises.symlink(outsideDir, symlinkDir);
    await expect(writeAgentCardFile(workspace, 'linked-out/card.json')).rejects.toThrowError(
      /A2A_PATH_TRAVERSAL/
    );

    // Bloqueo si el archivo destino ya es un symlink o directorio
    const targetSubdir = path.join(workspace, 'dir-as-target');
    await fsPromises.mkdir(targetSubdir);
    await expect(writeAgentCardFile(workspace, 'dir-as-target')).rejects.toThrowError(
      /A2A_UNSAFE_TARGET/
    );

    const outsideFile = path.join(outsideDir, 'target.json');
    await fsPromises.writeFile(outsideFile, '{}', 'utf-8');
    await fsPromises.symlink(outsideFile, path.join(workspace, 'sym-file.json'));
    await expect(writeAgentCardFile(workspace, 'sym-file.json')).rejects.toThrowError(
      /A2A_UNSAFE_TARGET/
    );

    // Bloqueo si workspaceRoot es un archivo en vez de directorio
    await expect(writeAgentCardFile(outsideFile)).rejects.toThrowError(/A2A_INVALID_ROOT/);
  });
});
