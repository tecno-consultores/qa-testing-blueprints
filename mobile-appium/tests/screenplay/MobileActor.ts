// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

/**
 * Patron Screenplay multi-rol RBAC y multi-tenant para Appium 3 (Nativo + Hibrido Ionic/RN).
 * Estandar QA-11X: 0 any, CC <= 5, 0 aserciones internas, anti-XPath y anti-Deep-Link Hijacking.
 */

export type MobileRbacRole = 'admin' | 'operator' | 'auditor' | 'viewer' | (string & {});
export type MobilePlatform = 'android' | 'ios';
export type HybridShellKind = 'ionic-capacitor' | 'react-native' | 'native';
export type MobileNetworkState = 'online' | 'offline';
export type BiometricMethod = 'faceId' | 'touchId' | 'fingerprint';
export type TemporalLifecyclePhase = 'pending' | 'active' | 'expired';

export interface MobileActorIdentity {
  readonly name: string;
  readonly role: MobileRbacRole;
  readonly tenantId: string;
  readonly platform: MobilePlatform;
  readonly hybridShell?: HybridShellKind;
  readonly permissions: readonly string[];
}

export interface MobileActorOptions {
  readonly role?: MobileRbacRole;
  readonly tenantId: string;
  readonly platform?: MobilePlatform;
  readonly hybridShell?: HybridShellKind;
  readonly permissions?: readonly string[];
}

export interface MobileAbility {
  readonly abilityName: string;
}

export type MobileAbilityClass<T extends MobileAbility = MobileAbility> = (abstract new (
  ...args: never[]
) => T) & {
  readonly abilityName?: string;
};

export class MissingMobileAbilityError extends Error {
  readonly actorName: string;
  readonly abilityName: string;

  constructor(actorName: string, abilityName: string) {
    super(`El actor movil "${actorName}" carece de la habilidad requerida: ${abilityName}`);
    this.name = 'MissingMobileAbilityError';
    this.actorName = actorName;
    this.abilityName = abilityName;
  }
}

export class MobileContextNotFoundError extends Error {
  readonly requestedContext: string;
  readonly availableContexts: readonly string[];

  constructor(requestedContext: string, availableContexts: readonly string[]) {
    super(
      `Contexto movil "${requestedContext}" inexistente. ` +
        `Disponibles: [${availableContexts.join(', ')}]`,
    );
    this.name = 'MobileContextNotFoundError';
    this.requestedContext = requestedContext;
    this.availableContexts = availableContexts;
  }
}

export class UnsafeDeepLinkError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`Deep link rechazado ("${url}"): ${reason}`);
    this.name = 'UnsafeDeepLinkError';
    this.url = url;
    this.reason = reason;
  }
}

export class CollapsedMobileGeometryError extends Error {
  readonly locatorSummary: string;
  readonly bounds: MobileElementBounds;

  constructor(locatorSummary: string, bounds: MobileElementBounds) {
    super(
      `Elemento movil con geometria colapsada (${bounds.width}x${bounds.height}) ` +
        `para ${locatorSummary}`,
    );
    this.name = 'CollapsedMobileGeometryError';
    this.locatorSummary = locatorSummary;
    this.bounds = bounds;
  }
}

export class HiddenMobileElementError extends Error {
  readonly locatorSummary: string;

  constructor(locatorSummary: string) {
    super(`Elemento movil no visible para ${locatorSummary}`);
    this.name = 'HiddenMobileElementError';
    this.locatorSummary = locatorSummary;
  }
}

export interface MobileElementBounds {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
}

export type MobileLocator =
  | { readonly strategy: 'accessibilityId'; readonly value: string }
  | { readonly strategy: 'iosPredicate'; readonly value: string }
  | { readonly strategy: 'androidUiAutomator'; readonly value: string }
  | { readonly strategy: 'webviewRole'; readonly role: string; readonly name?: string };

function isRawXpathLocator(trimmed: string): boolean {
  const normalized = trimmed.replace(/^\(+/, '').trimStart().toLowerCase();
  return (
    normalized.startsWith('xpath=') ||
    normalized.startsWith('//') ||
    /^\/[a-z*]/.test(normalized)
  );
}

function ensureSafeMobileLocatorValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`El selector movil ${label} no puede estar vacio.`);
  }
  if (isRawXpathLocator(trimmed)) {
    throw new Error(
      `Selector prohibido (${label}): los selectores XPath crudos estan vetados en QA-11X.`,
    );
  }
  return trimmed;
}

export function ByAccessibilityId(id: string): MobileLocator {
  const trimmed = id.trim();
  const stripped = trimmed.replace(/^~+/, '');
  if (stripped.length === 0) {
    throw new Error('El selector accessibilityId no puede estar vacio tras remover "~".');
  }
  return {
    strategy: 'accessibilityId',
    value: ensureSafeMobileLocatorValue(stripped, 'accessibilityId'),
  };
}

export function ByIosPredicate(predicate: string): MobileLocator {
  return {
    strategy: 'iosPredicate',
    value: ensureSafeMobileLocatorValue(predicate, 'iosPredicate'),
  };
}

export function ByAndroidUiAutomator(expression: string): MobileLocator {
  return {
    strategy: 'androidUiAutomator',
    value: ensureSafeMobileLocatorValue(expression, 'androidUiAutomator'),
  };
}

export function ByWebviewRole(role: string, name?: string): MobileLocator {
  const cleanRole = ensureSafeMobileLocatorValue(role, 'webviewRole');
  return name === undefined
    ? { strategy: 'webviewRole', role: cleanRole }
    : { strategy: 'webviewRole', role: cleanRole, name: name.trim() };
}

export function formatMobileLocator(locator: MobileLocator): string {
  if (locator.strategy === 'accessibilityId') {
    return `~${locator.value}`;
  }
  if (locator.strategy === 'webviewRole') {
    return locator.name === undefined
      ? `role=${locator.role}`
      : `role=${locator.role}[name="${locator.name}"]`;
  }
  return `${locator.strategy}:${locator.value}`;
}

export interface MobileElementPort {
  tap(): Promise<void>;
  typeText(value: string): Promise<void>;
  readText(): Promise<string | null>;
  isVisible(): Promise<boolean>;
  readBounds(): Promise<MobileElementBounds>;
}

export interface MobileDriverPort {
  locate(locator: MobileLocator): MobileElementPort;
  getContexts(): Promise<readonly string[]>;
  getCurrentContext(): Promise<string>;
  switchContext(targetContext: string): Promise<void>;
  openDeepLink(url: string): Promise<void>;
  authenticateBiometric(matched: boolean, method: BiometricMethod): Promise<boolean>;
  setNetworkState(state: MobileNetworkState): Promise<void>;
  getNetworkState(): Promise<MobileNetworkState>;
}

export interface DeepLinkPolicy {
  readonly allowedSchemes: readonly string[];
  readonly allowedHosts?: readonly string[];
}

const FORBIDDEN_DEEP_LINK_SCHEMES: ReadonlySet<string> = new Set([
  'javascript',
  'file',
  'data',
  'vbscript',
  'content',
]);

const DEFAULT_DEEP_LINK_POLICY: DeepLinkPolicy = {
  allowedSchemes: ['sinfallas', 'myapp', 'https'],
  allowedHosts: ['app.sinfallas.local', 'auth.sinfallas.local'],
};

function parseRawUrl(trimmed: string, rawUrl: string): URL {
  try {
    return new URL(trimmed);
  } catch {
    throw new UnsafeDeepLinkError(rawUrl, 'Formato URI invalido.');
  }
}

function assertSafeDeepLinkScheme(parsed: URL, rawUrl: string, policy: DeepLinkPolicy): void {
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (FORBIDDEN_DEEP_LINK_SCHEMES.has(scheme)) {
    throw new UnsafeDeepLinkError(rawUrl, `Esquema peligroso bloqueado (${scheme}:).`);
  }
  const allowedSchemes = policy.allowedSchemes.map((s) => s.toLowerCase());
  if (!allowedSchemes.includes(scheme)) {
    throw new UnsafeDeepLinkError(rawUrl, `Esquema "${scheme}" fuera de lista blanca.`);
  }
}

function parseValidatedDeepLink(rawUrl: string, policy: DeepLinkPolicy): URL {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || /[\r\n\0]/.test(trimmed)) {
    throw new UnsafeDeepLinkError(rawUrl, 'URL vacia o con caracteres de control.');
  }
  const parsed = parseRawUrl(trimmed, rawUrl);
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new UnsafeDeepLinkError(rawUrl, 'Credenciales userinfo prohibidas en Deep Link.');
  }
  assertSafeDeepLinkScheme(parsed, rawUrl, policy);
  return parsed;
}

function requireAllowedHosts(policy: DeepLinkPolicy, rawUrl: string): readonly string[] {
  if (!policy.allowedHosts || policy.allowedHosts.length === 0) {
    throw new UnsafeDeepLinkError(
      rawUrl,
      'Lista allowedHosts vacia; bloqueado por politica Fail-Closed ' +
        'contra Intent/Deep-Link Hijacking.',
    );
  }
  return policy.allowedHosts.map((h) => h.toLowerCase());
}

function validateDeepLinkHost(parsed: URL, rawUrl: string, policy: DeepLinkPolicy): void {
  const allowedHosts = requireAllowedHosts(policy, rawUrl);
  const host = parsed.hostname.toLowerCase();
  if (!host || !allowedHosts.includes(host)) {
    throw new UnsafeDeepLinkError(
      rawUrl,
      `Host "${host || '(vacio)'}" no autorizado contra Intent/Deep-Link Hijacking.`,
    );
  }
}

export class InteractWithMobile implements MobileAbility {
  static readonly abilityName = 'InteractWithMobile';
  readonly abilityName = InteractWithMobile.abilityName;
  private readonly driver: MobileDriverPort;
  private readonly deepLinkPolicy: DeepLinkPolicy;

  constructor(driver: MobileDriverPort, deepLinkPolicy: DeepLinkPolicy = DEFAULT_DEEP_LINK_POLICY) {
    this.driver = driver;
    this.deepLinkPolicy = deepLinkPolicy;
  }

  static using(
    driver: MobileDriverPort,
    deepLinkPolicy: DeepLinkPolicy = DEFAULT_DEEP_LINK_POLICY,
  ): InteractWithMobile {
    return new InteractWithMobile(driver, deepLinkPolicy);
  }

  private async requireVisibleWithBounds(
    locator: MobileLocator,
  ): Promise<{ readonly element: MobileElementPort; readonly bounds: MobileElementBounds }> {
    const element = this.driver.locate(locator);
    const [visible, bounds] = await Promise.all([
      element.isVisible(),
      element.readBounds(),
    ]);
    if (!visible) {
      throw new HiddenMobileElementError(formatMobileLocator(locator));
    }
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new CollapsedMobileGeometryError(formatMobileLocator(locator), bounds);
    }
    return { element, bounds };
  }

  async requireVisibleElement(locator: MobileLocator): Promise<MobileElementPort> {
    return (await this.requireVisibleWithBounds(locator)).element;
  }

  async tap(locator: MobileLocator): Promise<void> {
    const element = await this.requireVisibleElement(locator);
    await element.tap();
  }

  async typeText(locator: MobileLocator, value: string): Promise<void> {
    const element = await this.requireVisibleElement(locator);
    await element.typeText(value);
  }

  async readText(locator: MobileLocator): Promise<string> {
    const element = await this.requireVisibleElement(locator);
    const raw = await element.readText();
    return (raw ?? '').trim();
  }

  async readBounds(locator: MobileLocator): Promise<MobileElementBounds> {
    return (await this.requireVisibleWithBounds(locator)).bounds;
  }

  async getCurrentContext(): Promise<string> {
    return this.driver.getCurrentContext();
  }

  async switchContext(targetContext: string): Promise<void> {
    const available = await this.driver.getContexts();
    if (!available.includes(targetContext)) {
      throw new MobileContextNotFoundError(targetContext, available);
    }
    await this.driver.switchContext(targetContext);
  }

  async openVerifiedDeepLink(rawUrl: string): Promise<void> {
    const parsed = parseValidatedDeepLink(rawUrl, this.deepLinkPolicy);
    validateDeepLinkHost(parsed, rawUrl, this.deepLinkPolicy);
    await this.driver.openDeepLink(parsed.toString());
  }

  async authenticateBiometric(matched: boolean, method: BiometricMethod): Promise<boolean> {
    return this.driver.authenticateBiometric(matched, method);
  }

  async setNetworkState(state: MobileNetworkState): Promise<void> {
    await this.driver.setNetworkState(state);
  }

  async getNetworkState(): Promise<MobileNetworkState> {
    return this.driver.getNetworkState();
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MobileApiRequestSpec {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export interface MobileApiResponsePayload<T = unknown> {
  readonly status: number;
  readonly data: T;
}

export interface MobileApiClientPort {
  send<T = unknown>(spec: MobileApiRequestSpec): Promise<MobileApiResponsePayload<T>>;
}

export interface MobileBatchItemResult {
  readonly id: string;
  readonly status: string;
}

export interface MobileBatchSyncEnvelope {
  readonly results: readonly MobileBatchItemResult[];
}

export interface MobileBatchSyncSummary {
  readonly httpStatus: number;
  readonly totalItems: number;
  readonly succeededIds: readonly string[];
  readonly failedIds: readonly string[];
  readonly allSucceeded: boolean;
}

const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BATCH_OK_STATUSES: ReadonlySet<string> = new Set(['ok', 'success', 'succeeded', 'completed']);

const IDENTITY_HEADER_KEYS = new Set(['x-tenant-id', 'x-actor-role', 'x-mobile-platform']);

function findHeaderIgnoreCase(
  headers: Readonly<Record<string, string>>,
  targetLower: string,
): { readonly key: string; readonly value: string } | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === targetLower && v.trim().length > 0) {
      return { key: k, value: v };
    }
  }
  return undefined;
}

function copyNonIdentityHeaders(
  callerHeaders: Readonly<Record<string, string>>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, val] of Object.entries(callerHeaders)) {
    if (!IDENTITY_HEADER_KEYS.has(key.toLowerCase())) {
      merged[key] = val;
    }
  }
  return merged;
}

function applyIdempotencyHeader(merged: Record<string, string>, spec: MobileApiRequestSpec): void {
  const existingIdem = findHeaderIgnoreCase(merged, 'idempotency-key');
  if (spec.idempotencyKey !== undefined) {
    if (existingIdem !== undefined && existingIdem.key !== 'Idempotency-Key') {
      delete merged[existingIdem.key];
    }
    merged['Idempotency-Key'] = spec.idempotencyKey;
    return;
  }
  if (existingIdem === undefined) {
    merged['Idempotency-Key'] = globalThis.crypto.randomUUID();
  }
}

function buildMobileApiHeaders(
  actor: MobileActor,
  spec: MobileApiRequestSpec,
): Readonly<Record<string, string>> {
  const merged = copyNonIdentityHeaders(spec.headers ?? {});
  merged['X-Tenant-ID'] = actor.identity.tenantId;
  merged['X-Actor-Role'] = actor.identity.role;
  merged['X-Mobile-Platform'] = actor.identity.platform;
  if (MUTATING_METHODS.has(spec.method)) {
    applyIdempotencyHeader(merged, spec);
  }
  return merged;
}

function partitionBatchItemIds(
  items: readonly MobileBatchItemResult[],
): { readonly succeededIds: string[]; readonly failedIds: string[] } {
  const succeededIds: string[] = [];
  const failedIds: string[] = [];
  for (const item of items) {
    const target = BATCH_OK_STATUSES.has(item.status.toLowerCase()) ? succeededIds : failedIds;
    target.push(item.id);
  }
  return { succeededIds, failedIds };
}

export class CallMobileApi implements MobileAbility {
  static readonly abilityName = 'CallMobileApi';
  readonly abilityName = CallMobileApi.abilityName;
  private readonly client: MobileApiClientPort;

  constructor(client: MobileApiClientPort) {
    this.client = client;
  }

  static using(client: MobileApiClientPort): CallMobileApi {
    return new CallMobileApi(client);
  }

  async request<T = unknown>(
    actor: MobileActor,
    spec: MobileApiRequestSpec,
  ): Promise<MobileApiResponsePayload<T>> {
    const headers = buildMobileApiHeaders(actor, spec);
    return this.client.send<T>({ ...spec, headers });
  }

  inspectBatchSync(
    response: MobileApiResponsePayload<MobileBatchSyncEnvelope>,
  ): MobileBatchSyncSummary {
    const items = response.data.results;
    const { succeededIds, failedIds } = partitionBatchItemIds(items);
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

export interface MobilePerformable {
  readonly description: string;
  performAs(actor: MobileActor): Promise<void>;
}

export interface MobileQuestion<T> {
  readonly description: string;
  answeredBy(actor: MobileActor): Promise<T> | T;
}

export function defineMobileTask(
  description: string,
  execute: (actor: MobileActor) => Promise<void>,
): MobilePerformable {
  return { description, performAs: execute };
}

export function defineMobileQuestion<T>(
  description: string,
  evaluate: (actor: MobileActor) => Promise<T> | T,
): MobileQuestion<T> {
  return { description, answeredBy: evaluate };
}

export function TapAccessibilityId(idOrLocator: string | MobileLocator): MobilePerformable {
  const locator = typeof idOrLocator === 'string' ? ByAccessibilityId(idOrLocator) : idOrLocator;
  return {
    description: `Tocar elemento movil ${formatMobileLocator(locator)}`,
    async performAs(actor: MobileActor): Promise<void> {
      await actor.abilityTo(InteractWithMobile).tap(locator);
    },
  };
}

export function TypeInMobileField(
  locator: MobileLocator,
  value: string,
): MobilePerformable {
  return {
    description: `Ingresar texto en campo movil ${formatMobileLocator(locator)}`,
    async performAs(actor: MobileActor): Promise<void> {
      await actor.abilityTo(InteractWithMobile).typeText(locator, value);
    },
  };
}

export function SwitchMobileContext(targetContext: string): MobilePerformable {
  return {
    description: `Conmutar contexto movil a "${targetContext}"`,
    async performAs(actor: MobileActor): Promise<void> {
      await actor.abilityTo(InteractWithMobile).switchContext(targetContext);
    },
  };
}

export function OpenVerifiedDeepLink(url: string): MobilePerformable {
  return {
    description: `Abrir deep link validado "${url}"`,
    async performAs(actor: MobileActor): Promise<void> {
      await actor.abilityTo(InteractWithMobile).openVerifiedDeepLink(url);
    },
  };
}

export function SimulateBiometricPrompt(options: {
  readonly matched: boolean;
  readonly method?: BiometricMethod;
  readonly memoryKey?: string;
}): MobilePerformable {
  const method = options.method ?? 'faceId';
  return {
    description: `Simular biometria ${method} (matched=${String(options.matched)})`,
    async performAs(actor: MobileActor): Promise<void> {
      const outcome = await actor
        .abilityTo(InteractWithMobile)
        .authenticateBiometric(options.matched, method);
      if (options.memoryKey) {
        actor.remember(options.memoryKey, outcome);
      }
    },
  };
}

export function SetMobileNetworkState(state: MobileNetworkState): MobilePerformable {
  return {
    description: `Establecer conectividad movil en "${state}"`,
    async performAs(actor: MobileActor): Promise<void> {
      await actor.abilityTo(InteractWithMobile).setNetworkState(state);
    },
  };
}

export function ActiveMobileContext(): MobileQuestion<string> {
  return {
    description: 'Consultar el contexto Appium activo (NATIVE_APP o WEBVIEW_*)',
    async answeredBy(actor: MobileActor): Promise<string> {
      return actor.abilityTo(InteractWithMobile).getCurrentContext();
    },
  };
}

export function VisibleMobileBounds(locator: MobileLocator): MobileQuestion<MobileElementBounds> {
  return {
    description: `Consultar geometria visible para ${formatMobileLocator(locator)}`,
    async answeredBy(actor: MobileActor): Promise<MobileElementBounds> {
      return actor.abilityTo(InteractWithMobile).readBounds(locator);
    },
  };
}

export interface MobileTemporalWindowSpec {
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  readonly nowMs: number;
  readonly cancelled?: boolean;
}

export function MobileTemporalLifecycleState(
  spec: MobileTemporalWindowSpec,
): MobileQuestion<TemporalLifecyclePhase> {
  return {
    description: 'Evaluar ciclo temporal movil de 3 fases (pending -> active -> expired)',
    answeredBy(): TemporalLifecyclePhase {
      if (spec.endsAtMs < spec.startsAtMs) {
        throw new RangeError('Ventana temporal movil invalida: endsAtMs < startsAtMs');
      }
      if (spec.cancelled || spec.nowMs > spec.endsAtMs) {
        return 'expired';
      }
      if (spec.nowMs < spec.startsAtMs) {
        return 'pending';
      }
      return 'active';
    },
  };
}

export interface OfflineSyncParityReport {
  readonly uiValue: string;
  readonly apiValue: string;
  readonly networkState: MobileNetworkState;
  readonly tenantId: string;
  readonly inSync: boolean;
}

export function VerifyOfflineSyncParity(
  locator: MobileLocator,
  apiPath: string,
  extractApiText: (data: unknown) => string,
): MobileQuestion<OfflineSyncParityReport> {
  return {
    description: `Verificar paridad Antisilosis post-reconexion movil <-> GET ${apiPath}`,
    async answeredBy(actor: MobileActor): Promise<OfflineSyncParityReport> {
      const mobile = actor.abilityTo(InteractWithMobile);
      const networkState = await mobile.getNetworkState();
      const uiValue = await mobile.readText(locator);
      const res = await actor
        .abilityTo(CallMobileApi)
        .request(actor, { method: 'GET', path: apiPath });
      const apiValue = extractApiText(res.data).trim();
      const okHttp = res.status >= 200 && res.status < 300;
      return {
        uiValue,
        apiValue,
        networkState,
        tenantId: actor.identity.tenantId,
        inSync: networkState === 'online' && okHttp && uiValue === apiValue,
      };
    },
  };
}

function requireNonEmptyIdentityField(raw: string, errorMessage: string): string {
  const cleaned = raw.trim();
  if (cleaned.length === 0) {
    throw new Error(errorMessage);
  }
  return cleaned;
}

function validateMobileIdentity(name: string, options: MobileActorOptions): MobileActorIdentity {
  return {
    name: requireNonEmptyIdentityField(name, 'MobileActor requiere un nombre no vacio.'),
    role: options.role ?? 'operator',
    tenantId: requireNonEmptyIdentityField(
      options.tenantId,
      'MobileActor requiere tenantId obligatorio.',
    ),
    platform: options.platform ?? 'android',
    hybridShell: options.hybridShell ?? 'native',
    permissions: Object.freeze([...(options.permissions ?? [])]),
  };
}

export class MobileActor {
  readonly identity: MobileActorIdentity;
  private readonly abilities = new Map<string, MobileAbility>();
  private readonly memory = new Map<string, unknown>();
  private readonly recordedSteps: string[] = [];

  private constructor(identity: MobileActorIdentity) {
    this.identity = identity;
  }

  static named(name: string, options: MobileActorOptions): MobileActor {
    return new MobileActor(validateMobileIdentity(name, options));
  }

  whoCan(...abilities: readonly MobileAbility[]): this {
    for (const ability of abilities) {
      const ctor = ability.constructor as { readonly abilityName?: string };
      const key = ctor.abilityName ?? ability.abilityName ?? ability.constructor.name;
      this.abilities.set(key, ability);
    }
    return this;
  }

  abilityTo<T extends MobileAbility>(AbilityClass: MobileAbilityClass<T>): T {
    const key = AbilityClass.abilityName ?? AbilityClass.name;
    const found = this.abilities.get(key);
    if (!found) {
      throw new MissingMobileAbilityError(this.identity.name, key);
    }
    return found as T;
  }

  hasPermission(permission: string): boolean {
    return this.identity.permissions.includes(permission);
  }

  remember(key: string, value: unknown): this {
    this.memory.set(key, value);
    return this;
  }

  recall<T>(key: string): T | undefined {
    return this.memory.get(key) as T | undefined;
  }

  async attemptsTo(...tasks: readonly MobilePerformable[]): Promise<void> {
    for (const task of tasks) {
      this.recordedSteps.push(`${this.identity.name}:${task.description}`);
      await task.performAs(this);
    }
  }

  async asks<T>(question: MobileQuestion<T>): Promise<T> {
    this.recordedSteps.push(`${this.identity.name}?${question.description}`);
    return await question.answeredBy(this);
  }

  getRecordedSteps(): readonly string[] {
    return Object.freeze([...this.recordedSteps]);
  }
}
