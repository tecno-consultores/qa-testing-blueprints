// SPDX-License-Identifier: MIT
// Copyright (C) 2026 QA Testing Blueprints Contributors

import { describe, it, expect } from 'vitest';
import {
  stripAnsi,
  parseTailLog,
  parseCoverage,
  parseFailedTests,
  parseLinterAndComplexity,
  parseSecurityAlerts,
  parseMutation,
  parseQaOutput,
} from '../src/parsers/output-parsers.js';

describe('output-parsers', () => {
  describe('stripAnsi', () => {
    it('elimina códigos de color ANSI correctamente', () => {
      const colored = '\x1B[31mError:\x1B[0m Fallo en \x1B[32mtest_auth\x1B[0m';
      expect(stripAnsi(colored)).toBe('Error: Fallo en test_auth');
    });

    it('devuelve la misma cadena si no contiene secuencias ANSI', () => {
      const plain = 'Cadena limpia sin colores';
      expect(stripAnsi(plain)).toBe(plain);
    });
  });

  describe('parseTailLog', () => {
    it('extrae las últimas N líneas limpias y omite líneas vacías', () => {
      const raw = 'linea 1\nlinea 2\n\nlinea 3\nlinea 4\nlinea 5';
      const tail = parseTailLog(raw, 3);
      expect(tail).toBe('linea 3\nlinea 4\nlinea 5');
    });

    it('maneja logs con menos líneas que el máximo solicitado', () => {
      const raw = 'primera\nsegunda';
      expect(parseTailLog(raw, 5)).toBe('primera\nsegunda');
    });
  });

  describe('parseCoverage', () => {
    it('parsea la tabla de cobertura v8 de Vitest con éxito (>= 95%)', () => {
      const vitestTable = `
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   97.76 |    93.08 |   98.38 |   97.76 |                   
 src/server.ts     |     100 |    94.73 |     100 |     100 |                   
 src/tools/bar.ts  |   92.50 |    85.00 |   90.00 |   92.50 | 45-52             
-------------------|---------|----------|---------|---------|-------------------
      `;
      const result = parseCoverage(vitestTable);
      expect(result.detected).toBe(true);
      expect(result.percent).toBe(97.76);
      expect(result.threshold).toBe(95.0);
      expect(result.passed).toBe(true);
      expect(result.uncovered_files.length).toBe(1);
      expect(result.uncovered_files[0].file).toBe('src/tools/bar.ts');
      expect(result.uncovered_files[0].missing_lines).toBe('45-52');
    });

    it('marca passed=false si la cobertura de Vitest está por debajo del umbral (< 95%)', () => {
      const lowCover = `
All files          |   89.50 |    80.00 |   85.00 |   89.50 |
      `;
      const result = parseCoverage(lowCover);
      expect(result.detected).toBe(true);
      expect(result.percent).toBe(89.5);
      expect(result.passed).toBe(false);
    });

    it('parsea tabla de resumen de pytest-cov', () => {
      const pytestOutput = `
---------- coverage: platform linux, python 3.12 -----------
Name                      Stmts   Miss  Cover   Missing
-------------------------------------------------------
src/api/auth.py              50      3    94.0%   45-48
src/core/config.py           20      0   100.0%
-------------------------------------------------------
TOTAL                        70      3    95.7%
      `;
      const result = parseCoverage(pytestOutput);
      expect(result.detected).toBe(true);
      expect(result.percent).toBe(95.7);
      expect(result.passed).toBe(true);
      expect(result.uncovered_files.length).toBe(1);
      expect(result.uncovered_files[0].file).toBe('src/api/auth.py');
    });

    it('parsea formato genérico de kcov', () => {
      const kcovOutput = 'Resumen final: Total coverage: 96.4%';
      const result = parseCoverage(kcovOutput);
      expect(result.detected).toBe(true);
      expect(result.percent).toBe(96.4);
      expect(result.passed).toBe(true);
    });

    it('parsea cobertura de Pest / PHPUnit con PCOV (Lines: X%)', () => {
      const phpOutput = 'Code Coverage Report:\n  Lines: 97.20% (140/144)\n  Classes: 100.00%';
      const result = parseCoverage(phpOutput);
      expect(result.detected).toBe(true);
      expect(result.percent).toBe(97.2);
      expect(result.passed).toBe(true);

      const phpLow = 'Lines: 91.50%';
      const resultLow = parseCoverage(phpLow);
      expect(resultLow.detected).toBe(true);
      expect(resultLow.percent).toBe(91.5);
      expect(resultLow.passed).toBe(false);
    });

    it('retorna detected=false si no hay datos de cobertura', () => {
      const result = parseCoverage('Salida cualquiera sin tablas');
      expect(result.detected).toBe(false);
      expect(result.percent).toBe(0);
      expect(result.passed).toBe(true);
    });
  });

  describe('parseFailedTests', () => {
    it('parsea fallos en formato Pytest', () => {
      const log = `
FAILED tests/test_auth.py::test_login_invalid - AssertionError: 401 != 200
FAILED tests/test_token.py::test_expired
  Token has expired unexpectedly
      `;
      const failures = parseFailedTests(log);
      expect(failures.length).toBe(2);
      expect(failures[0].test_name).toBe('tests/test_auth.py::test_login_invalid');
      expect(failures[0].error_summary).toContain('AssertionError: 401 != 200');
      expect(failures[1].test_name).toBe('tests/test_token.py::test_expired');
      expect(failures[1].error_summary).toContain('Token has expired unexpectedly');
    });

    it('parsea fallos en formato Vitest', () => {
      const log = `
FAIL tests/user.unit.ts > UserService > should create user
  AssertionError: expected false to be true
      `;
      const failures = parseFailedTests(log);
      expect(failures.length).toBe(1);
      expect(failures[0].test_name).toContain('tests/user.unit.ts');
      expect(failures[0].error_summary).toContain('AssertionError');
    });

    it('parsea fallos en formato BATS-core', () => {
      const log = `
not ok 2 - docker daemon is running
# (in test file test.bats, line 24)
#   \`docker info' failed with exit code 1
      `;
      const failures = parseFailedTests(log);
      expect(failures.length).toBe(1);
      expect(failures[0].test_name).toBe('docker daemon is running');
      expect(failures[0].error_summary).toContain('in test file test.bats');
    });

    it('retorna array vacío cuando todas las pruebas pasan', () => {
      expect(parseFailedTests('All 45 tests passed successfully')).toEqual([]);
    });
  });

  describe('parseLinterAndComplexity', () => {
    it('parsea violaciones de Radon, Mypy, Ruff, ESLint y ShellCheck', () => {
      const log = `
src/services/heavy.py:42: C 12 Function process_data - too complex
src/api/users.py:15: error: Argument 1 has incompatible type "int"; expected "str"  [arg-type]
src/core/utils.py:10:1: F401 'sys' imported but unused
/app/src/index.ts:5:10: error: 'unusedVar' is defined but never used [no-unused-vars]
In scripts/deploy.sh line 14:
  tar -czf $ARCHIVE $DIR
           ^------^ SC2086 (info): Double quote to prevent globbing.
      `;
      const issues = parseLinterAndComplexity(log);
      expect(issues.length).toBe(5);

      expect(issues[0].rule).toBe('radon-C');
      expect(issues[0].file).toBe('src/services/heavy.py');
      expect(issues[0].line).toBe(42);

      expect(issues[1].rule).toBe('mypy-arg-type');
      expect(issues[1].file).toBe('src/api/users.py');

      expect(issues[2].rule).toBe('ruff-F401');
      expect(issues[2].file).toBe('src/core/utils.py');

      expect(issues[3].rule).toBe('eslint-no-unused-vars');
      expect(issues[3].file).toBe('/app/src/index.ts');

      expect(issues[4].rule).toBe('shellcheck-SC2086');
      expect(issues[4].file).toBe('scripts/deploy.sh');
    });

    it('parsea violaciones de Psalm y PHPStan para proyectos PHP', () => {
      const log = `
ERROR: MissingReturnType - src/Models/User.php:28:12 - Method User::getName does not have a return type
src/Services/PaymentService.php:54:Call to an undefined method PaymentService::process()
      `;
      const issues = parseLinterAndComplexity(log);
      expect(issues.length).toBe(2);

      expect(issues[0].rule).toBe('psalm-MissingReturnType');
      expect(issues[0].file).toBe('src/Models/User.php');
      expect(issues[0].line).toBe(28);

      expect(issues[1].rule).toBe('phpstan-error');
      expect(issues[1].file).toBe('src/Services/PaymentService.php');
      expect(issues[1].line).toBe(54);
    });
  });

  describe('parseSecurityAlerts', () => {
    it('parsea resumen consolidado de Trivy', () => {
      const log = 'Target: pnpm-lock.yaml Total: 2 (CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 0)';
      const alerts = parseSecurityAlerts(log);
      expect(alerts.critical).toBe(1);
      expect(alerts.high).toBe(1);
    });

    it('parsea formato tabla con CRITICAL | N y HIGH | M', () => {
      const log = 'Vulnerabilities: | CRITICAL | 2 | HIGH | 5 |';
      const alerts = parseSecurityAlerts(log);
      expect(alerts.critical).toBe(2);
      expect(alerts.high).toBe(5);
    });

    it('parsea menciones textuales de severidad en hallazgos', () => {
      const log = 'Found item with CRITICAL severity in component and another with HIGH risk';
      const alerts = parseSecurityAlerts(log);
      expect(alerts.critical).toBe(1);
      expect(alerts.high).toBe(1);
    });

    it('detecta reporte limpio sin vulnerabilidades', () => {
      const log = 'Report Summary: no security findings detected';
      const alerts = parseSecurityAlerts(log);
      expect(alerts.critical).toBe(0);
      expect(alerts.high).toBe(0);
    });
  });

  describe('parseMutation', () => {
    it('parsea resumen de Stryker o Mutmut con score y sobrevivientes', () => {
      const log = 'Mutation score: 88.50%\nMutants survived: 3';
      const mutation = parseMutation(log);
      expect(mutation).not.toBeNull();
      expect(mutation?.mutation_score).toBe(88.5);
      expect(mutation?.mutants_survived).toBe(3);
    });

    it('parsea cuando solo se reporta el score o solo sobrevivientes', () => {
      const logScore = 'Mutation score: 92.0%';
      const mut1 = parseMutation(logScore);
      expect(mut1?.mutation_score).toBe(92.0);
      expect(mut1?.mutants_survived).toBe(0);

      const logSurv = 'Survived: 4';
      const mut2 = parseMutation(logSurv);
      expect(mut2?.mutation_score).toBe(0);
      expect(mut2?.mutants_survived).toBe(4);
    });

    it('parsea reporte de mutación de Infection para PHP', () => {
      const logInfection = 'Mutation Score Indicator (MSI): 86.4%\n5 escaped\n2 mutants were not covered';
      const mut = parseMutation(logInfection);
      expect(mut).not.toBeNull();
      expect(mut?.mutation_score).toBe(86.4);
      expect(mut?.mutants_survived).toBe(5);
    });

    it('devuelve null si no hay datos de mutación', () => {
      expect(parseMutation('Log ordinario de tests')).toBeNull();
    });
  });

  describe('parseQaOutput', () => {
    it('genera resultado PASSED para ejecución nominal', () => {
      const stdout = 'All files | 96.50 | 92.00 | 95.00 | 96.50 |\nTests: 20 passed';
      const result = parseQaOutput(stdout, '', 'unit', 1200, 0);

      expect(result.status).toBe('PASSED');
      expect(result.stage).toBe('unit');
      expect(result.exit_code).toBe(0);
      expect(result.duration_ms).toBe(1200);
      expect(result.coverage.passed).toBe(true);
      expect(result.failed_tests.length).toBe(0);
    });

    it('falla en stage lint si hay issues de linter aunque el exitCode sea 0', () => {
      const stdout = 'src/foo.py:10:1: F401 unused import';
      const result = parseQaOutput(stdout, '', 'lint', 500, 0);
      expect(result.status).toBe('FAILED');
    });

    it('falla en stage all si la cobertura no supera el umbral', () => {
      const stdout = 'All files | 90.00 | 80.00 | 85.00 | 90.00 |';
      const result = parseQaOutput(stdout, '', 'all', 1500, 0);
      expect(result.status).toBe('FAILED');
    });

    it('genera resultado FAILED si la cobertura está por debajo del 95% en stage unit', () => {
      const stdout = 'All files | 91.00 | 85.00 | 90.00 | 91.00 |\nTests: 20 passed';
      const result = parseQaOutput(stdout, '', 'unit', 1500, 0);

      expect(result.status).toBe('FAILED');
      expect(result.coverage.passed).toBe(false);
    });

    it('genera resultado FAILED si el código de salida es distinto de 0 o hay tests fallidos', () => {
      const stdout = 'FAILED tests/test_calc.py::test_sum - AssertionError';
      const result = parseQaOutput(stdout, 'Error ejecutando pytest', 'unit', 800, 1);

      expect(result.status).toBe('FAILED');
      expect(result.exit_code).toBe(1);
      expect(result.failed_tests.length).toBe(1);
    });
  });
});
