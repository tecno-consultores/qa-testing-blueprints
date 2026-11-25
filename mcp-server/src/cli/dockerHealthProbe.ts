// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_MAX_TEMP_C,
  DEFAULT_MIN_FREE_MEM_PCT,
  evaluateHostThermalAndMemoryGuard,
  parseRestartingContainers,
} from '../tools/ephemeral-runner/dockerGuardrails.js';
import { reportDebugCatchError } from '../utils/diagnosticFormatter.js';

const DEFAULT_DOCKER_NETWORKS = new Set(['bridge', 'host', 'none']);
const NM_CONF_DIR = '/etc/NetworkManager/conf.d';
const DOCKER_PROBE_TIMEOUT_MS = 1_500;
const WARN_TEMP_C = DEFAULT_MAX_TEMP_C - 5;
const WARN_MIN_MEM_PCT = DEFAULT_MIN_FREE_MEM_PCT + 3;

export interface DockerHostHealth {
  readonly restarting_containers: readonly string[];
  readonly orphan_bridge_networks: number;
  readonly network_manager_unmanaged_ok: boolean | null;
  readonly max_temp_c: number | null;
  readonly available_mem_pct: number | null;
  readonly warnings: readonly string[];
}

export interface DockerHealthProbeDeps {
  readonly execFileSyncFn?: typeof execFileSync;
  readonly platform?: NodeJS.Platform;
  readonly nmConfDir?: string;
  readonly meminfoPath?: string;
  readonly thermalBaseDir?: string;
}

function probeRestartingNames(execSyncFn: typeof execFileSync): string[] {
  try {
    const raw = execSyncFn(
      'docker',
      [
        'ps',
        '-a',
        '--filter',
        'status=restarting',
        '--format',
        '{{.ID}}|{{.Names}}|{{.Image}}|{{.Label "com.docker.compose.project.working_dir"}}',
      ],
      { timeout: DOCKER_PROBE_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return parseRestartingContainers(String(raw)).map((c) => `${c.name}(${c.id})`);
  } catch (err: unknown) {
    reportDebugCatchError('dockerHealthProbe.probeRestartingNames', err);
    return [];
  }
}

function probeOrphanBridgeNetworkCount(execSyncFn: typeof execFileSync): number {
  try {
    const raw = execSyncFn('docker', ['network', 'ls', '--format', '{{.Name}}|{{.Driver}}'], {
      timeout: DOCKER_PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let count = 0;
    for (const line of String(raw).split(/\r?\n/)) {
      const [name = '', driver = ''] = line.trim().split('|');
      if (name && driver === 'bridge' && !DEFAULT_DOCKER_NETWORKS.has(name)) {
        count += 1;
      }
    }
    return count;
  } catch (err: unknown) {
    reportDebugCatchError('dockerHealthProbe.probeOrphanBridgeNetworkCount', err);
    return 0;
  }
}

function checkNetworkManagerDockerRule(platform: NodeJS.Platform, nmConfDir: string): boolean | null {
  if (platform !== 'linux' || !fs.existsSync(nmConfDir)) return null;
  try {
    for (const entry of fs.readdirSync(nmConfDir)) {
      if (!entry.endsWith('.conf')) continue;
      const content = fs.readFileSync(path.join(nmConfDir, entry), 'utf8');
      if (/unmanaged-devices\s*=[^\n]*veth\*/i.test(content)) {
        return true;
      }
    }
    return false;
  } catch (err: unknown) {
    reportDebugCatchError('dockerHealthProbe.checkNetworkManagerDockerRule', err);
    return null;
  }
}

function buildHealthWarnings(input: {
  restarting: readonly string[];
  orphanNets: number;
  nmUnmanagedOk: boolean | null;
  maxTempC: number | null;
  availMemPct: number | null;
}): string[] {
  const warnings: string[] = [];
  if (input.restarting.length > 0) {
    warnings.push(
      `Contenedores en CrashLoop (status=restarting): ${input.restarting.join(', ')}. Ejecuta docker update --restart=no <ID> && docker rm -fv <ID>.`
    );
  }
  if (input.orphanNets >= 5) {
    warnings.push(
      `Detectadas ${input.orphanNets} redes bridge personalizadas en Docker (poda segura recomendada: docker network prune -f).`
    );
  }
  if (input.nmUnmanagedOk === false) {
    warnings.push(
      'NetworkManager activo sin regla unmanaged-devices para veth*/br-* (/etc/NetworkManager/conf.d/99-unmanaged-docker.conf); riesgo de picos CPU/Tailscale.'
    );
  }
  if (input.maxTempC !== null && input.maxTempC >= WARN_TEMP_C) {
    warnings.push(
      `Temperatura de host elevada (${input.maxTempC}°C >= ${WARN_TEMP_C}°C); evita lanzar suites Docker pesadas en paralelo.`
    );
  }
  if (input.availMemPct !== null && input.availMemPct < WARN_MIN_MEM_PCT) {
    warnings.push(
      `RAM disponible baja (${input.availMemPct}% < ${WARN_MIN_MEM_PCT}%); cierra contenedores o procesos antes de ejecutar QA.`
    );
  }
  return warnings;
}

export function probeDockerHostHealth(deps: DockerHealthProbeDeps = {}): DockerHostHealth {
  const execSyncFn = deps.execFileSyncFn ?? execFileSync;
  const platform = deps.platform ?? process.platform;
  const restarting = probeRestartingNames(execSyncFn);
  const orphanNets = probeOrphanBridgeNetworkCount(execSyncFn);
  const nmUnmanagedOk = checkNetworkManagerDockerRule(platform, deps.nmConfDir ?? NM_CONF_DIR);
  const thermalMem = evaluateHostThermalAndMemoryGuard({
    platform,
    meminfoPath: deps.meminfoPath,
    thermalBaseDir: deps.thermalBaseDir,
  });
  const maxTempC = thermalMem.maxTempC ?? null;
  const availMemPct = thermalMem.availableMemPct ?? null;
  const warnings = buildHealthWarnings({
    restarting,
    orphanNets,
    nmUnmanagedOk,
    maxTempC,
    availMemPct,
  });
  return {
    restarting_containers: restarting,
    orphan_bridge_networks: orphanNets,
    network_manager_unmanaged_ok: nmUnmanagedOk,
    max_temp_c: maxTempC,
    available_mem_pct: availMemPct,
    warnings,
  };
}
