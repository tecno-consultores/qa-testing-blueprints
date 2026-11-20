// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)
// Blueprint declarativo de pruebas de carga y SLOs k6 para Python (perfiles: smoke | load | stress).

import http from 'k6/http';
import { check } from 'k6';

const PROFILES = {
  smoke: {
    vus: 1,
    iterations: 4,
    maxDuration: '10s',
  },
  load: {
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 20 },
      { duration: '20s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },
  stress: {
    stages: [
      { duration: '30s', target: 20 },
      { duration: '1m', target: 60 },
      { duration: '30s', target: 60 },
      { duration: '20s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },
};

const ACTIVE_PROFILE = __ENV.K6_PROFILE || 'smoke';
if (!Object.prototype.hasOwnProperty.call(PROFILES, ACTIVE_PROFILE)) {
  throw new Error(
    `Perfil K6_PROFILE inválido '${ACTIVE_PROFILE}'. Use: smoke | load | stress.`,
  );
}

const BASE_URL = (__ENV.API_BASE_URL || 'http://127.0.0.1:18080').replace(/\/+$/, '');
const TENANT_ID = __ENV.QA_TENANT_ID || 'tenant-alpha';
const SUMMARY_PATH = __ENV.K6_SUMMARY_PATH || '/tmp/k6-summary.json';

export const options = Object.assign({}, PROFILES[ACTIVE_PROFILE], {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    checks: ['rate==1.0'],
  },
});

const RUN_PREFIX = Math.floor(Math.random() * 0x100000000)
  .toString(16)
  .padStart(8, '0')
  .slice(-8);
const RUN_TIME_HEX = (Date.now() & 0xffff).toString(16).padStart(4, '0');

function uuidv4(iteration, vu) {
  const vuHex = Number(vu || 1).toString(16).padStart(4, '0').slice(-4);
  const iterHex = Number(iteration || 0).toString(16).padStart(12, '0').slice(-12);
  return `${RUN_PREFIX}-${RUN_TIME_HEX}-4${vuHex.slice(1)}-a${vuHex.slice(1)}-${iterHex}`;
}

function safeJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export default function runPythonLoadBlueprint() {
  const healthRes = http.get(`${BASE_URL}/health`, {
    headers: { 'X-Tenant-ID': TENANT_ID },
  });
  const healthBody = safeJson(healthRes);
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health body ok': () =>
      Boolean(healthBody && (healthBody.status === 'ok' || healthBody.status === 'healthy')),
  });

  const createKey = uuidv4(__ITER * 2 + 1, __VU);
  const createRes = http.post(
    `${BASE_URL}/api/v1/reservations`,
    JSON.stringify({ sku: 'ROUTER-CCR2004', quantity: 1, unitPrice: '149.95' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': createKey,
        'X-Tenant-ID': TENANT_ID,
      },
    },
  );
  const createBody = safeJson(createRes);
  check(createRes, {
    'reservation created 201': (r) => r.status === 201,
    'reservation Decimal string exacto': () =>
      Boolean(createBody && typeof createBody.unitPrice === 'string' && createBody.unitPrice === '149.95'),
    'reservation eco Idempotency-Key': (r) =>
      String(r.headers['Idempotency-Key'] || r.headers['idempotency-key'] || '') === createKey,
  });

  const batchKey = uuidv4(__ITER * 2 + 2, __VU);
  const batchRes = http.post(
    `${BASE_URL}/api/v1/reservations/batch`,
    JSON.stringify({
      items: [
        { sku: 'ROUTER-CCR2004', quantity: 1, unitPrice: '149.95' },
        { sku: 'SWITCH-CRS326', quantity: 1, unitPrice: '199.00' },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': batchKey,
        'X-Tenant-ID': TENANT_ID,
      },
    },
  );
  const batchBody = safeJson(batchRes);
  check(batchRes, {
    'batch status 200': (r) => r.status === 200,
    'batch eco Idempotency-Key': (r) =>
      String(r.headers['Idempotency-Key'] || r.headers['idempotency-key'] || '') === batchKey,
    'batch items all SUCCEEDED (anti-falso-verde)': () =>
      Boolean(
        batchBody &&
          Array.isArray(batchBody.results) &&
          batchBody.results.length > 0 &&
          batchBody.results.every((entry) => entry && entry.status === 'SUCCEEDED'),
      ),
  });
}

function thresholdFailed(metric) {
  if (!metric || !metric.thresholds) {
    return false;
  }
  return Object.values(metric.thresholds).some((entry) => entry && entry.ok === false);
}

export function handleSummary(data) {
  const durationValues = (data.metrics.http_req_duration && data.metrics.http_req_duration.values) || {};
  const failedValues = (data.metrics.http_req_failed && data.metrics.http_req_failed.values) || {};
  const checksValues = (data.metrics.checks && data.metrics.checks.values) || {};
  const thresholdsPassed = !Object.values(data.metrics || {}).some(thresholdFailed);

  const summary = {
    profile: ACTIVE_PROFILE,
    p95Ms: Number((durationValues['p(95)'] || 0).toFixed(2)),
    p99Ms: Number((durationValues['p(99)'] || 0).toFixed(2)),
    errorRatePct: Number(((failedValues.rate || 0) * 100).toFixed(4)),
    checksPassRatePct: Number(((checksValues.rate || 0) * 100).toFixed(2)),
    thresholdsPassed,
  };

  return {
    [SUMMARY_PATH]: JSON.stringify(summary, null, 2) + '\n',
  };
}
