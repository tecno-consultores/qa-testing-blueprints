// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

/**
 * Patron Screenplay multi-rol RBAC y multi-tenant para React (Estandar QA-11X).
 * Compatible con Playwright, Vitest Browser y TypeScript estricto sin dependencias obligatorias.
 */

export type RbacRole = 'admin' | 'operator' | 'auditor' | 'viewer' | (string & {});

export interface ActorIdentity {
  readonly name: string;
  readonly role: RbacRole;
  readonly tenantId: string;
  readonly permissions: readonly string[];
}

export interface Ability {
  readonly abilityName: string;
}

export type AbilityClass<T extends Ability = Ability> = abstract new (...args: never[]) => T;

export class MissingAbilityError extends Error {
  readonly actorName: string;
  readonly abilityName: string;

  constructor(actorName: string, abilityName: string) {
    super(`El actor "${actorName}" carece de la habilidad requerida: ${abilityName}`);
    this.name = 'MissingAbilityError';
    this.actorName = actorName;
    this.abilityName = abilityName;
  }
}

export type SemanticLocator =
  | { readonly strategy: 'role'; readonly role: string; readonly name?: string | RegExp }
  | { readonly strategy: 'label'; readonly label: string | RegExp }
  | { readonly strategy: 'text'; readonly text: string | RegExp }
  | { readonly strategy: 'testid'; readonly testId: string };

export function ByRole(role: string, name?: string | RegExp): SemanticLocator {
  return name === undefined ? { strategy: 'role', role } : { strategy: 'role', role, name };
}

export function ByLabel(label: string | RegExp): SemanticLocator {
  return { strategy: 'label', label };
}

export function ByText(text: string | RegExp): SemanticLocator {
  return { strategy: 'text', text };
}

export function ByTestId(testId: string): SemanticLocator {
  return { strategy: 'testid', testId };
}

export interface SemanticElementPort {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  textContent(): Promise<string | null>;
  isVisible(): Promise<boolean>;
}

export interface WebDriverPort {
  goto(url: string): Promise<void>;
  currentUrl(): string;
  locate(locator: SemanticLocator): SemanticElementPort;
}

export class BrowseTheWeb implements Ability {
  readonly abilityName = 'BrowseTheWeb';
  private readonly driver: WebDriverPort;

  constructor(driver: WebDriverPort) {
    this.driver = driver;
  }

  static using(driver: WebDriverPort): BrowseTheWeb {
    return new BrowseTheWeb(driver);
  }

  async navigateTo(url: string): Promise<void> {
    await this.driver.goto(url);
  }

  currentUrl(): string {
    return this.driver.currentUrl();
  }

  element(locator: SemanticLocator): SemanticElementPort {
    return this.driver.locate(locator);
  }

  async readText(locator: SemanticLocator): Promise<string> {
    const content = await this.driver.locate(locator).textContent();
    return (content ?? '').trim();
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestSpec {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export interface ApiResponsePayload<T = unknown> {
  readonly status: number;
  readonly data: T;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface BatchItemResult {
  readonly id: string;
  readonly status: string;
  readonly detail?: string;
}

export interface BatchExecutionEnvelope {
  readonly results: readonly BatchItemResult[];
}

export interface BatchInspectionSummary {
  readonly httpStatus: number;
  readonly totalItems: number;
  readonly succeededIds: readonly string[];
  readonly failedIds: readonly string[];
  readonly allSucceeded: boolean;
}

export interface ApiClientPort {
  send<T = unknown>(spec: ApiRequestSpec): Promise<ApiResponsePayload<T>>;
}

const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BATCH_OK_STATUSES: ReadonlySet<string> = new Set(['ok', 'success', 'succeeded', 'completed']);

function buildActorHeaders(
  actor: Actor,
  spec: ApiRequestSpec,
): Readonly<Record<string, string>> {
  const merged: Record<string, string> = {
    ...(spec.headers ?? {}),
    'X-Tenant-ID': actor.identity.tenantId,
    'X-Actor-Role': actor.identity.role,
  };
  if (MUTATING_METHODS.has(spec.method)) {
    merged['Idempotency-Key'] = spec.idempotencyKey ?? globalThis.crypto.randomUUID();
  }
  return merged;
}

export class CallAnApi implements Ability {
  readonly abilityName = 'CallAnApi';
  private readonly client: ApiClientPort;

  constructor(client: ApiClientPort) {
    this.client = client;
  }

  static using(client: ApiClientPort): CallAnApi {
    return new CallAnApi(client);
  }

  async request<T = unknown>(actor: Actor, spec: ApiRequestSpec): Promise<ApiResponsePayload<T>> {
    const headers = buildActorHeaders(actor, spec);
    return this.client.send<T>({ ...spec, headers });
  }

  inspectBatchResponse(
    response: ApiResponsePayload<BatchExecutionEnvelope>,
  ): BatchInspectionSummary {
    const items = response.data.results;
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    for (const item of items) {
      if (BATCH_OK_STATUSES.has(item.status.toLowerCase())) {
        succeededIds.push(item.id);
      } else {
        failedIds.push(item.id);
      }
    }
    const isOkHttp = response.status >= 200 && response.status < 300;
    return {
      httpStatus: response.status,
      totalItems: items.length,
      succeededIds: Object.freeze(succeededIds),
      failedIds: Object.freeze(failedIds),
      allSucceeded: isOkHttp && items.length > 0 && failedIds.length === 0,
    };
  }
}

export interface ReactTransitionPort {
  isTransitionPending(): boolean;
  flushTransitions(): Promise<void>;
  renderedTenantId(): string;
  readHookSnapshot<T = unknown>(hookName: string): T | undefined;
}

export class InspectReactState implements Ability {
  readonly abilityName = 'InspectReactState';
  private readonly port: ReactTransitionPort;

  constructor(port: ReactTransitionPort) {
    this.port = port;
  }

  static using(port: ReactTransitionPort): InspectReactState {
    return new InspectReactState(port);
  }

  isTransitionPending(): boolean {
    return this.port.isTransitionPending();
  }

  async flushTransitions(): Promise<void> {
    await this.port.flushTransitions();
  }

  renderedTenantId(): string {
    return this.port.renderedTenantId();
  }

  readHookSnapshot<T = unknown>(hookName: string): T | undefined {
    return this.port.readHookSnapshot<T>(hookName);
  }
}

export interface Performable {
  readonly description: string;
  performAs(actor: Actor): Promise<void>;
}

export type Interaction = Performable;
export type Task = Performable;

export function defineTask(
  description: string,
  fn: (actor: Actor) => Promise<void>,
): Task {
  return {
    description,
    performAs: fn,
  };
}

export interface Question<T> {
  readonly description: string;
  answeredBy(actor: Actor): Promise<T> | T;
}

export function defineQuestion<T>(
  description: string,
  answeredBy: (actor: Actor) => Promise<T> | T,
): Question<T> {
  return {
    description,
    answeredBy,
  };
}

export interface RecordedStep {
  readonly kind: 'task' | 'question';
  readonly description: string;
  readonly actorName: string;
  readonly role: RbacRole;
  readonly tenantId: string;
  readonly timestampMs: number;
}

function normalizeIdentity(
  name: string,
  partial?: Partial<Omit<ActorIdentity, 'name'>>,
): ActorIdentity {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new Error('ActorIdentity.name es obligatorio y no puede estar vacio');
  }
  const tenantId = partial?.tenantId === undefined ? 'default-tenant' : partial.tenantId.trim();
  if (tenantId.length === 0) {
    throw new Error('ActorIdentity.tenantId es obligatorio para aislamiento multi-tenant');
  }
  return {
    name: trimmedName,
    role: partial?.role ?? 'viewer',
    tenantId,
    permissions: Object.freeze([...(partial?.permissions ?? [])]),
  };
}

export class Actor {
  readonly name: string;
  readonly identity: ActorIdentity;
  private readonly abilities: Map<AbilityClass, Ability>;
  private readonly memory: Map<string, unknown>;
  private readonly steps: RecordedStep[];

  private constructor(identity: ActorIdentity) {
    this.name = identity.name;
    this.identity = identity;
    this.abilities = new Map();
    this.memory = new Map();
    this.steps = [];
  }

  static named(name: string, identity?: Partial<Omit<ActorIdentity, 'name'>>): Actor {
    return new Actor(normalizeIdentity(name, identity));
  }

  whoCan(...abilities: readonly Ability[]): this {
    for (const ability of abilities) {
      this.abilities.set(ability.constructor as AbilityClass, ability);
    }
    return this;
  }

  abilityTo<T extends Ability>(AbilityType: AbilityClass<T>): T {
    const found = this.abilities.get(AbilityType);
    if (!found) {
      throw new MissingAbilityError(this.name, AbilityType.name);
    }
    return found as T;
  }

  hasPermission(permission: string): boolean {
    return this.identity.permissions.includes(permission);
  }

  remember<T>(key: string, value: T): this {
    this.memory.set(key, value);
    return this;
  }

  recall<T>(key: string): T | undefined {
    return this.memory.get(key) as T | undefined;
  }

  async attemptsTo(...performables: readonly Performable[]): Promise<void> {
    for (const performable of performables) {
      await performable.performAs(this);
      this.recordStep('task', performable.description);
    }
  }

  async asks<T>(question: Question<T>): Promise<T> {
    const result = await question.answeredBy(this);
    this.recordStep('question', question.description);
    return result;
  }

  getRecordedSteps(): readonly RecordedStep[] {
    return Object.freeze([...this.steps]);
  }

  private recordStep(kind: 'task' | 'question', description: string): void {
    this.steps.push({
      kind,
      description,
      actorName: this.name,
      role: this.identity.role,
      tenantId: this.identity.tenantId,
      timestampMs: Date.now(),
    });
  }
}

function appendRefreshQueryParam(rawPath: string): string {
  if (/[?&]refresh=true(?:&|$)/.test(rawPath)) {
    return rawPath;
  }
  return rawPath.includes('?') ? `${rawPath}&refresh=true` : `${rawPath}?refresh=true`;
}

export function ClickSemantic(locator: SemanticLocator, targetLabel?: string): Interaction {
  return {
    description: `Click semantico sobre ${targetLabel ?? locator.strategy}`,
    async performAs(actor: Actor): Promise<void> {
      await actor.abilityTo(BrowseTheWeb).element(locator).click();
    },
  };
}

export function FillField(
  locator: SemanticLocator,
  value: string,
  fieldLabel?: string,
): Interaction {
  return {
    description: `Completar campo ${fieldLabel ?? locator.strategy}`,
    async performAs(actor: Actor): Promise<void> {
      await actor.abilityTo(BrowseTheWeb).element(locator).fill(value);
    },
  };
}

export function RefreshView(
  options?: { readonly path?: string; readonly refreshButtonName?: string | RegExp },
): Interaction {
  const buttonName = options?.refreshButtonName ?? /Refrescar/i;
  return {
    description: `Doble refresco de vista (${options?.path ?? 'actual'}) con ?refresh=true`,
    async performAs(actor: Actor): Promise<void> {
      const web = actor.abilityTo(BrowseTheWeb);
      if (options?.path) {
        await web.navigateTo(appendRefreshQueryParam(options.path));
      }
      await web.element(ByRole('button', buttonName)).click();
    },
  };
}

export type TemporalLifecycleState = 'pending' | 'active' | 'expired';

export interface TemporalWindow {
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  readonly nowMs: number;
  readonly cancelled?: boolean;
}

export function resolveTemporalLifecycleState(window: TemporalWindow): TemporalLifecycleState {
  if (window.cancelled === true || window.nowMs > window.endsAtMs) {
    return 'expired';
  }
  if (window.nowMs < window.startsAtMs) {
    return 'pending';
  }
  return 'active';
}

export function TemporalLifecycleQuestion(
  source: TemporalWindow | ((actor: Actor) => Promise<TemporalWindow> | TemporalWindow),
): Question<TemporalLifecycleState> {
  return {
    description: 'Evaluar fase temporal 11X (pending | active | expired)',
    async answeredBy(actor: Actor): Promise<TemporalLifecycleState> {
      const window = typeof source === 'function' ? await source(actor) : source;
      return resolveTemporalLifecycleState(window);
    },
  };
}

export interface AntiSiloParityReport {
  readonly uiValue: string;
  readonly apiValue: string;
  readonly tenantId: string;
  readonly inSync: boolean;
}

export function AntiSiloParityQuestion(
  locator: SemanticLocator,
  apiPath: string,
  extractApiText: (data: unknown) => string,
): Question<AntiSiloParityReport> {
  return {
    description: `Verificar paridad Antisilosis UI <-> GET ${apiPath}`,
    async answeredBy(actor: Actor): Promise<AntiSiloParityReport> {
      const uiValue = await actor.abilityTo(BrowseTheWeb).readText(locator);
      const res = await actor.abilityTo(CallAnApi).request(actor, { method: 'GET', path: apiPath });
      const apiValue = extractApiText(res.data).trim();
      const okHttp = res.status >= 200 && res.status < 300;
      return {
        uiValue,
        apiValue,
        tenantId: actor.identity.tenantId,
        inSync: okHttp && uiValue === apiValue,
      };
    },
  };
}

export function InspectBatchExecutionQuestion(
  response: ApiResponsePayload<BatchExecutionEnvelope>,
): Question<BatchInspectionSummary> {
  return {
    description: 'Inspeccionar results[].status por item en respuesta batch HTTP 200 OK',
    answeredBy(actor: Actor): BatchInspectionSummary {
      return actor.abilityTo(CallAnApi).inspectBatchResponse(response);
    },
  };
}

export function WaitForReactTransition(label = 'transicion React'): Interaction {
  return {
    description: `Esperar asentamiento asincrono de ${label}`,
    async performAs(actor: Actor): Promise<void> {
      await actor.abilityTo(InspectReactState).flushTransitions();
    },
  };
}

export interface ReactTenantIsolationReport {
  readonly actorTenantId: string;
  readonly renderedTenantId: string;
  readonly transitionSettled: boolean;
  readonly hookSnapshot: unknown;
  readonly tenantIsolated: boolean;
}

export function VerifyReactTenantIsolation(
  hookName: string,
): Question<ReactTenantIsolationReport> {
  return {
    description: `Verificar aislamiento multi-tenant React y estado de hook ${hookName}`,
    async answeredBy(actor: Actor): Promise<ReactTenantIsolationReport> {
      const react = actor.abilityTo(InspectReactState);
      await react.flushTransitions();
      const transitionSettled = !react.isTransitionPending();
      const renderedTenantId = react.renderedTenantId();
      const hookSnapshot = react.readHookSnapshot(hookName);
      return {
        actorTenantId: actor.identity.tenantId,
        renderedTenantId,
        transitionSettled,
        hookSnapshot,
        tenantIsolated: transitionSettled && renderedTenantId === actor.identity.tenantId,
      };
    },
  };
}
