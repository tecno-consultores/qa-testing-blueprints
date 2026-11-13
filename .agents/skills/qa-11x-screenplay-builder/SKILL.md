---
name: qa-11x-screenplay-builder
description: >-
  Proportional E2E and acceptance architecture sub-skill for Standard 11X. Enforces the Screenplay Pattern
  (Actors, Abilities, Tasks, Interactions, Questions) on multi-role RBAC, multi-tenant, and hybrid UI+API+Mobile
  flows, lightweight composed POM on small single-role apps (<= 10 tests, <= 3 pages), semantic self-healing
  ARIA locators, Anti-JSDOM geometry, Anti-Silo cross-module Questions, and 3-phase temporal assertions.
---

# QA 11X Screenplay Builder (`qa-11x-screenplay-builder`)

> **OUTPUT LANGUAGE & DYNAMIC MIRRORING:** Unless the target repository's `AGENTS.md` explicitly mandates a fixed output language, respond and explain reasoning in the **user's prompt language**, and write commit messages / human-facing documentation matching the **existing language of `README.md` and `CHANGELOG.md`** (explicitly ignoring `AGENTS.md` and `.agents/**`, which remain in concise English for token economy; default to the prompt language on empty repos).

Proportional E2E and acceptance test architecture sub-skill for Standard 11X (`qa-11x-architect`), preventing brittle God Page Objects and unnecessary enterprise boilerplate by matching pattern complexity to domain scope while enforcing real-browser geometry, semantic locators, Anti-Silo verification, and 3-phase temporal assertions.

---

## 1. Proportional Architecture Selection Matrix (Anti-Overengineering)

Select the E2E abstraction layer strictly by application complexity—never force heavy Screenplay factories onto trivial CRUD apps, and never deploy raw POMs into multi-role RBAC systems:

| Criteria | **Screenplay Pattern (Mandatory)** | **Lightweight Composed POM (Permitted)** |
| :--- | :--- | :--- |
| **Scale & Roles** | `>= 2` RBAC roles/tenants (Admin, Approver, Operator), `> 10` specs, or `> 3` pages. | Single-role CRUD app with `<= 10` E2E tests and `<= 3` pages. |
| **Channels** | Hybrid UI + API + live DB + mobile (`mobile-appium/`), MCP `ApprovalRequest` flows. | Single web UI surface (`vue3` / `react-frontend`). |
| **Core Building Blocks** | `Actor` + `Ability` (`BrowseTheWeb`, `CallAnApi`, `InteractWithMobile`) + OCP `Task` + `Interaction` + `Question`. | Flat page class composing reusable UI widgets (`HeaderComponent`, `DataTableComponent`). |
| **Extensibility Rule** | Open-Closed Principle (OCP): add new `Task` classes without editing existing actors or pages. | Zero inheritance chains; compose max 2 levels (`Page -> Component`). |

### Screenplay Core Taxonomy (Enterprise & Multi-Role)
- **`Actor`:** Represents a concrete business persona (`adminActor`, `approverActor`, `tenantBViewer`) carrying isolated session storage, JWT claims, and tenant context.
- **`Ability`:** Grants channel capability (`BrowseTheWeb` wrapping Playwright `Page`, `CallAnApi` wrapping typed HTTP/Karate clients with dynamic `Idempotency-Key` UUIDs, `InteractWithMobile` wrapping Appium sessions in `mobile-appium/`).
- **`Task`:** Atomic, domain-named business intent (`SubmitChangeProposal`, `ApproveChangeRequest`, `RotateTenantVaultKey`) composed of low-level `Interactions`; **MUST contain zero assertions**.
- **`Interaction`:** Single UI/API primitive (`ClickAccessibleAction`, `FillLabeledField`, `TriggerDualRefresh`) delegating exclusively to semantic locators.
- **`Question`:** Side-effect-free state query (`DisplayedEventBadge`, `AuditTrailActorName`, `ConsumerModuleMetric`, `HorizontalOverflowPixels`) evaluated explicitly inside test assertions (`await actor.asks(...)`).

---

## 2. Strictly Forbidden 11X E2E Anti-Patterns

Reject any PR or test suite exhibiting these structural defects:

1. **God Page Objects:** Any page class exceeding `>= 50` methods or `>= 100` locators. Decompose immediately into Screenplay `Tasks` + `Questions` or bounded widget components.
2. **Deep Inheritance Chains:** Hierarchies like `BasePage -> AuthenticatedPage -> TenantPage -> AdminUserPage` (brittle fragile-base-class coupling). Replace with composition (`Abilities` or flat widget components).
3. **Hidden Assertions Inside `Tasks` or Page Objects:** `expect(...)` inside `Task.performAs()` or `Page.submitForm()` prevents negative-path reuse (e.g., testing `403 Forbidden` or `409 Conflict`). All assertions MUST live in the test spec via `actor.asks(Question)`.
4. **Leaky Abstractions:** Raw CSS selectors (`.btn-primary:nth-child(3)`), brittle XPath (`/html/body/div[2]/...`), or direct `page.locator(...)` calls inside `.spec.ts` / `.feature` files.
5. **Arbitrary Timing Bandaids:** `page.waitForTimeout(N)`, `Thread.sleep()`, or `time.sleep()`. Synchronize deterministically on Playwright auto-waiting assertions, API `waitForResponse`, or WebSocket/DOM state transitions.

---

## 3. Semantic Self-Healing Locators & Anti-JSDOM Geometry (`UI-11X-01`)

### 3.1. Resilient Locator Resolution Priority
Resolve DOM targets strictly by accessibility semantics and business intent so layout refactors never break acceptance specs:
1. **`getByRole(role, { name })` (Primary):** `button`, `link`, `textbox`, `combobox`, `row`, `alert`, `status`, `dialog` paired with accessible names.
2. **`getByLabel(...)` / `getByPlaceholder(...)`:** Form controls bound via `<label for>` or `aria-labelledby`.
3. **`getByText(...)` (Scoped):** Static semantic copy scoped inside landmark containers (`main`, `dialog`, `table`).
4. **`data-testid` (Last Resort Only):** Permitted exclusively for `<canvas>`, WebGL, complex SVG topology maps, or icon-only controls lacking text labels—never as default substitution for missing ARIA roles.

### 3.2. Real-Browser Geometry & WCAG 2.1 AA Ergonomics (Anti-JSDOM)
Because JSDOM always reports `0x0` bounding boxes and skips layout engines, validate geometry inside ephemeral real Chromium (`sinfallas/base-node-ionic:26` + Playwright):
- **3-Viewport Sweep:** Assert `document.documentElement.scrollWidth <= window.innerWidth` (zero horizontal overflow) and `CLS = 0` at `375x667` (mobile), `768x1024` (tablet), and `1440x900` (desktop).
- **In-Flow Footer Invariant (`UI-11X-01`):** Forbid `position: fixed` or `position: sticky` bottom footers covering form inputs/tables; enforce in-flow `<footer>` inside `<main>` with `margin-top: auto`.
- **Tabular & Contrast Polish:** Enforce `font-variant-numeric: tabular-nums` on telemetry/KPI columns and `0` violations from `@axe-core/playwright` (WCAG 2.1 AA) + Lighthouse CI (`Performance >= 90`, `Accessibility >= 95`).

---

## 4. Anti-Silo Cross-Module `Questions` & 3-Phase Temporal Lifecycle

Every state-mutating workflow MUST verify end-to-end reality without intermediate mocks or isolated silos:

1. **Cross-Module Propagation (`Actor A` Mutates -> `Actor B` Verifies Live State):**
   - After `Actor A` executes a mutating `Task` (`POST`/`PUT`/`PATCH`/`DELETE` carrying a fresh dynamic `Idempotency-Key` UUID per mutation), query Consumer Module B views, KPIs, and `GET` endpoints via `Question`s against the live test database (never stubbed stores).
   - Verify dual UI synchronization: reactive updates (`WebSocket` / `setInterval` with `onUnmounted` `clearInterval`) AND explicit manual **`[ 🔄 Refrescar ]`** trigger (`?refresh=true`).
2. **Batch Item Granularity & Semantic Event Integrity (`UI-11X-02`):**
   - For batch endpoints returning `HTTP 200 OK`, assert `Question` inspection over every `results[].status` entry—never equate `HTTP 200` with uniform item success.
   - Verify rendered event badges map to real categories (`CAÍDA`, `MANTENIMIENTO`, `RESPALDO`, `SEGURIDAD`, `OPERACIÓN`) without catch-all `else` fallbacks, and assert `actor_username` / `resource_display_name` render human names (never raw UUID v4 strings).
3. **3-Phase Temporal Lifecycle Verification:**
   - **Phase 1 — Pending ($t < t_0$):** Verify schedule creation shows `Programada` / `Pending` without premature enforcement or side effects.
   - **Phase 2 — Active ($t_0 \le t \le t_1$):** Advance/verify real scheduler state showing `En Curso` / `Activa`, active locks/rules, and cross-role visibility.
   - **Phase 3 — Expired / Reverted ($t > t_1$ or Cancelled):** Verify automatic restoration of baseline state, removal of temporary privileges/locks, and persisted WORM audit entry.

---

## 5. Reference TypeScript Screenplay Template (Multi-Role RBAC)

```typescript
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

export interface Question<T> {
  answeredBy(actor: Actor): Promise<T>;
}

export interface Task {
  performAs(actor: Actor): Promise<void>;
}

export class BrowseTheWeb {
  constructor(public readonly page: Page) {}
}

export class CallAnApi {
  constructor(public readonly request: APIRequestContext) {}
}

export class Actor {
  private readonly abilities = new Map<Function, unknown>();
  constructor(public readonly name: string) {}

  whoCan<T extends object>(ability: T): this {
    this.abilities.set(ability.constructor, ability);
    return this;
  }

  abilityTo<T>(AbilityType: new (...args: never[]) => T): T {
    const found = this.abilities.get(AbilityType);
    if (!found) throw new Error(`${this.name} lacks ability ${AbilityType.name}`);
    return found as T;
  }

  async attemptsTo(...tasks: Task[]): Promise<void> {
    for (const task of tasks) await task.performAs(this);
  }

  async asks<T>(question: Question<T>): Promise<T> {
    return question.answeredBy(this);
  }
}

export class SubmitMaintenanceWindow implements Task {
  constructor(private readonly resourceLabel: string) {}
  async performAs(actor: Actor): Promise<void> {
    const { page } = actor.abilityTo(BrowseTheWeb);
    await page.getByLabel('Target Resource').fill(this.resourceLabel);
    await page.getByRole('button', { name: 'Schedule Maintenance' }).click();
  }
}

export class ConsumerDashboardBanner implements Question<string> {
  async answeredBy(actor: Actor): Promise<string> {
    const { page } = actor.abilityTo(BrowseTheWeb);
    await page.getByRole('button', { name: /Refrescar/i }).click();
    return (await page.getByRole('status').innerText()).trim();
  }
}

test('multi-role Anti-Silo propagation from Operator to Auditor', async ({ browser }) => {
  const opCtx = await browser.newContext();
  const audCtx = await browser.newContext();
  const operator = new Actor('Operator').whoCan(new BrowseTheWeb(await opCtx.newPage()));
  const auditor = new Actor('Auditor').whoCan(new BrowseTheWeb(await audCtx.newPage()));

  await operator.attemptsTo(new SubmitMaintenanceWindow('core-edge-01'));
  const banner = await auditor.asks(new ConsumerDashboardBanner());
  expect(banner).toContain('MANTENIMIENTO');
  await opCtx.close();
  await audCtx.close();
});
```
