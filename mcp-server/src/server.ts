// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jesus Palencia <sinfallas@gmail.com> (Creado en Tecno Consultores)

import { McpServer, type ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ReadResourceRequestSchema,
  type ReadResourceRequest,
  type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import { BlueprintResources } from './resources/blueprint-resources.js';
import { parseResourceUriAndLang, runWithResourceLang } from './resources/resourceLang.js';
import {
  CORE_REGISTERED_TOOL_NAMES,
  registerCoreAnalysisTools,
  registerQaGovernanceTools,
} from './server/coreToolsRegistry.js';
import {
  REGISTERED_RESOURCE_URIS,
  registerCoreResources,
  registerExtensionResources,
} from './server/resourcesRegistry.js';
import {
  V2_TOOL_REGISTRATIONS,
  registerV2Tools,
  validateV2ToolWorkspaceArgs,
  type V2ToolExecutionExtra,
  type V2ToolRegistration,
} from './server/v2Registry.js';
import { GitHubFetcher, MCP_SERVER_VERSION } from './services/github-fetcher.js';
import { SurgicalMerger } from './services/surgical-merger.js';

export {
  TOOL_ANNOTATIONS,
  ensureStructuredToolResult,
  getToolAnnotations,
  getToolExecutionHints,
  toJsonToolResult,
  toSingleResourceResult,
  toStructuredRecord,
  type ToolExecutionHints,
} from './server/toolResults.js';
export {
  V2_TOOL_REGISTRATIONS,
  validateV2ToolWorkspaceArgs,
  type V2ToolExecutionExtra,
  type V2ToolRegistration,
};

export type RawGenericHandler = (request: unknown, extra: unknown) => unknown;

export interface ServerSurfaceRegistry {
  readonly toolNames: ReadonlySet<string>;
  readonly resourceUris: ReadonlySet<string>;
}

const SERVER_SURFACE_REGISTRY = new WeakMap<McpServer, ServerSurfaceRegistry>();
const SERVER_DISPATCHER_REGISTRY = new WeakMap<McpServer, Map<string, RawGenericHandler>>();
const WRAPPED_READ_HANDLERS = new WeakSet<RawGenericHandler>();

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Extracts the JSON-RPC method literal name from a Zod v3 MCP request schema. */
export function extractMethodName(requestSchema: unknown): string | undefined {
  if (!isRecordObject(requestSchema) || !isRecordObject(requestSchema.shape)) {
    return undefined;
  }
  const methodField = requestSchema.shape.method;
  if (!isRecordObject(methodField)) {
    return undefined;
  }
  if (typeof methodField.value === 'string') {
    return methodField.value;
  }
  if (isRecordObject(methodField._def) && typeof methodField._def.value === 'string') {
    return methodField._def.value;
  }
  return undefined;
}

/** Idempotently attaches setRequestHandler/removeRequestHandler tracking to an McpServer. */
export function attachDispatcherTracking(server: McpServer): Map<string, RawGenericHandler> {
  const existingRegistry = SERVER_DISPATCHER_REGISTRY.get(server);
  if (existingRegistry) {
    return existingRegistry;
  }

  const registry = new Map<string, RawGenericHandler>();
  SERVER_DISPATCHER_REGISTRY.set(server, registry);

  const rawServer = server.server;
  const origSetRequestHandler = rawServer.setRequestHandler.bind(rawServer);
  const origRemoveRequestHandler = rawServer.removeRequestHandler.bind(rawServer);

  rawServer.setRequestHandler = ((
    requestSchema: Parameters<typeof origSetRequestHandler>[0],
    handler: Parameters<typeof origSetRequestHandler>[1]
  ) => {
    const method = extractMethodName(requestSchema);
    if (method !== undefined) {
      registry.set(method, handler as unknown as RawGenericHandler);
    }
    return origSetRequestHandler(requestSchema, handler);
  }) as typeof rawServer.setRequestHandler;

  rawServer.removeRequestHandler = (method: string) => {
    registry.delete(method);
    return origRemoveRequestHandler(method);
  };

  return registry;
}

/** Returns captured public setRequestHandler dispatcher map for an McpServer instance. */
export function getServerDispatcherRegistry(
  mcpServer: McpServer
): Map<string, RawGenericHandler> | undefined {
  return SERVER_DISPATCHER_REGISTRY.get(mcpServer);
}

/** Idempotently wraps resources/read so ?lang=es|en works across static resources and templates. */
export function wrapReadResourceDispatcher(mcpServer: McpServer): void {
  const registry = getServerDispatcherRegistry(mcpServer);
  if (!registry) {
    return;
  }
  const methodName = ReadResourceRequestSchema.shape.method.value;
  const existing = registry.get(methodName);
  if (typeof existing !== 'function' || WRAPPED_READ_HANDLERS.has(existing)) {
    return;
  }

  const wrappedHandler = async (
    request: ReadResourceRequest,
    extra: unknown
  ): Promise<ReadResourceResult> => {
    const requestedUri = request.params.uri;
    const { baseUri, lang } = parseResourceUriAndLang(requestedUri);
    const rewrittenRequest =
      baseUri === requestedUri
        ? request
        : { ...request, params: { ...request.params, uri: baseUri } };
    const result = (await runWithResourceLang(lang, () =>
      existing(rewrittenRequest, extra)
    )) as ReadResourceResult;
    if (baseUri !== requestedUri && Array.isArray(result.contents)) {
      return {
        ...result,
        contents: result.contents.map((item) => ({ ...item, uri: requestedUri })),
      };
    }
    return result;
  };

  WRAPPED_READ_HANDLERS.add(wrappedHandler as unknown as RawGenericHandler);
  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, wrappedHandler);
}

function extractRegisteredResourceUri(uriOrTemplate: string | ResourceTemplate): string {
  return typeof uriOrTemplate === 'string' ? uriOrTemplate : uriOrTemplate.uriTemplate.toString();
}

/** Idempotently attaches runtime registration tracking for tools and resources. */
export function attachRegistrationTracking(server: McpServer): void {
  if (SERVER_SURFACE_REGISTRY.has(server)) {
    return;
  }
  const toolNames = new Set<string>();
  const resourceUris = new Set<string>();

  const wrapToolMethod = (methodName: 'registerTool' | 'tool'): void => {
    const orig = (Reflect.get(server, methodName) as (...args: readonly unknown[]) => unknown).bind(
      server
    );
    Reflect.set(server, methodName, (...args: readonly unknown[]) => {
      toolNames.add(String(args[0]));
      return orig(...args);
    });
  };

  const wrapResourceMethod = (methodName: 'registerResource' | 'resource'): void => {
    const orig = (Reflect.get(server, methodName) as (...args: readonly unknown[]) => unknown).bind(
      server
    );
    Reflect.set(server, methodName, (...args: readonly unknown[]) => {
      const uriOrTemplate = args[1] as string | ResourceTemplate;
      resourceUris.add(extractRegisteredResourceUri(uriOrTemplate));
      return orig(...args);
    });
  };

  wrapToolMethod('registerTool');
  wrapToolMethod('tool');
  wrapResourceMethod('registerResource');
  wrapResourceMethod('resource');

  SERVER_SURFACE_REGISTRY.set(server, { toolNames, resourceUris });
}

/** Returns runtime-registered tool names and resource URIs tracked for an McpServer instance. */
export function getRegisteredServerSurface(server: McpServer): ServerSurfaceRegistry | undefined {
  return SERVER_SURFACE_REGISTRY.get(server);
}

/** Computes declared MCP tool & resource surface counts without instantiating McpServer. */
export function getDeclaredSurfaceCounts(): { readonly tools: number; readonly resources: number } {
  return {
    tools: CORE_REGISTERED_TOOL_NAMES.length + V2_TOOL_REGISTRATIONS.length,
    resources: REGISTERED_RESOURCE_URIS.length,
  };
}

export function createMcpServer(options?: {
  fetcher?: GitHubFetcher;
  merger?: SurgicalMerger;
}): McpServer {
  const fetcher = options?.fetcher || new GitHubFetcher();
  const merger = options?.merger || new SurgicalMerger();
  const resources = new BlueprintResources(fetcher);

  const server = new McpServer({
    name: '@sinfallas/mcp-qa-11x',
    version: MCP_SERVER_VERSION,
  });

  attachDispatcherTracking(server);
  attachRegistrationTracking(server);

  registerCoreResources(server, resources);
  registerExtensionResources(server, resources, fetcher);
  registerCoreAnalysisTools(server, fetcher, merger);
  registerQaGovernanceTools(server, fetcher);
  registerV2Tools(server);
  wrapReadResourceDispatcher(server);

  return server;
}
