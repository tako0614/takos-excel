import { Hono } from "hono";
import type { Context } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { SpreadsheetStore } from "./spreadsheet-store.ts";
import { createTakosStorageClient } from "./lib/takos-storage.ts";
import type { Spreadsheet } from "./types/index.ts";
import {
  appAuthMisconfigured,
  registerAuthRoutes,
  requireAppAuth,
} from "./app-auth.ts";
import { createExcelRuntimeCapabilityManifest } from "./runtime-capabilities.ts";

export const EXCEL_MAX_MCP_REQUEST_BYTES = 1_000_000;

export type ExcelRuntimeEnv = Record<string, string | undefined>;

function denoEnv(): ExcelRuntimeEnv {
  return typeof Deno === "undefined" ? {} : Deno.env.toObject();
}

function envValue(env: ExcelRuntimeEnv, name: string): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function requiredEnv(env: ExcelRuntimeEnv, name: string): string {
  const value = envValue(env, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function nativeRenderingEnabled(env: ExcelRuntimeEnv): boolean {
  const value = envValue(env, "TAKOS_NATIVE_RENDERING");
  if (value) return ["1", "true", "yes"].includes(value.toLowerCase());
  return typeof Deno !== "undefined";
}

function envFlagEnabled(env: ExcelRuntimeEnv, name: string): boolean {
  const value = envValue(env, name);
  return value ? ["1", "true", "yes"].includes(value.toLowerCase()) : false;
}

async function constantTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = leftBytes.length ^ rightBytes.length;
  for (
    let index = 0;
    index < leftBytes.length && index < rightBytes.length;
    index++
  ) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

function mcpAuthMisconfigured(
  authToken?: string,
  allowUnauthenticated = false,
): Response | null {
  if (authToken || allowUnauthenticated) return null;
  return new Response(JSON.stringify({ error: "MCP_AUTH_TOKEN is required" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function authorizeMcpRequest(
  request: Request,
  authToken?: string,
  allowUnauthenticated = false,
): Promise<Response | null> {
  const configError = mcpAuthMisconfigured(authToken, allowUnauthenticated);
  if (configError) return configError;
  if (!authToken) return null;

  const header = request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !(await constantTimeEqual(token, authToken))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

async function readBoundedJsonRequest(
  request: Request,
): Promise<{ request: Request; body: unknown } | Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > EXCEL_MAX_MCP_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  const raw = await request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > EXCEL_MAX_MCP_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = new Headers(request.headers);
  headers.set("content-length", String(byteLength));
  return {
    request: new Request(request.url, {
      method: request.method,
      headers,
      body: raw,
    }),
    body,
  };
}

export function createServerApp(
  store: SpreadsheetStore | null,
  options: {
    env?: ExcelRuntimeEnv;
    nativeRendering?: boolean;
    mcpAuthToken?: string;
    mcpAllowUnauthenticated?: boolean;
    storeForRequest?: (c: Context) => SpreadsheetStore | Response;
  } = {},
) {
  const app = new Hono();
  const runtimeEnv = options.env ?? denoEnv();
  const mcpAuthToken = options.mcpAuthToken;
  const mcpAllowUnauthenticated = options.mcpAllowUnauthenticated === true;
  const currentStore = (c: Context): SpreadsheetStore | Response => {
    if (options.storeForRequest) return options.storeForRequest(c);
    if (!store) return c.json({ error: "space_id is required" }, 400);
    return store;
  };

  const health = (c: Context) => {
    const authError = appAuthMisconfigured(runtimeEnv);
    if (authError) return authError;
    const mcpAuthError = mcpAuthMisconfigured(
      mcpAuthToken,
      mcpAllowUnauthenticated,
    );
    if (mcpAuthError) return mcpAuthError;
    return c.json({ status: "ok" });
  };
  app.get("/health", health);
  app.get("/healthz", health);

  registerAuthRoutes(app, runtimeEnv);
  app.use("/api/spreadsheets", async (c, next) => {
    const unauthorized = await requireAppAuth(runtimeEnv, c.req.raw);
    if (unauthorized) return unauthorized;
    await next();
  });
  app.use("/api/spreadsheets/*", async (c, next) => {
    const unauthorized = await requireAppAuth(runtimeEnv, c.req.raw);
    if (unauthorized) return unauthorized;
    await next();
  });
  app.get("/api/spreadsheets", async (c) => {
    const store = currentStore(c);
    if (store instanceof Response) return store;
    const summaries = await store.listSpreadsheets();
    const spreadsheets = await Promise.all(
      summaries.map((entry) => store.getSpreadsheet(entry.id)),
    );
    return c.json(spreadsheets);
  });
  app.post("/api/spreadsheets", async (c) => {
    const store = currentStore(c);
    if (store instanceof Response) return store;
    const body = await c.req.json<Partial<Spreadsheet>>();
    if (body.id && body.title && body.sheets && body.activeSheetId) {
      return c.json(await store.replaceSpreadsheet(body as Spreadsheet), 201);
    }
    const id = await store.createSpreadsheet(
      body.title || "Untitled Spreadsheet",
    );
    return c.json(await store.getSpreadsheet(id), 201);
  });
  app.get("/api/spreadsheets/:id", async (c) => {
    const store = currentStore(c);
    if (store instanceof Response) return store;
    try {
      return c.json(await store.getSpreadsheet(c.req.param("id")));
    } catch {
      return c.json({ error: "Spreadsheet not found" }, 404);
    }
  });
  app.put("/api/spreadsheets/:id", async (c) => {
    const store = currentStore(c);
    if (store instanceof Response) return store;
    const body = await c.req.json<Spreadsheet>();
    const id = c.req.param("id");
    let current: Spreadsheet | undefined;
    try {
      current = await store.getSpreadsheet(id);
    } catch {
      current = undefined;
    }
    return c.json(
      await store.replaceSpreadsheet({
        ...body,
        id: current?.id ?? body.id ?? id,
      }),
    );
  });
  app.delete("/api/spreadsheets/:id", async (c) => {
    const store = currentStore(c);
    if (store instanceof Response) return store;
    try {
      await store.deleteSpreadsheet(c.req.param("id"));
      return c.json({ deleted: true });
    } catch {
      return c.json({ deleted: false });
    }
  });

  app.get("/files/:id", (c) => {
    const url = new URL(c.req.url);
    url.pathname = `/sheet/${encodeURIComponent(c.req.param("id"))}`;
    return c.redirect(`${url.pathname}${url.search}`, 302);
  });

  app.all("/mcp", async (c) => {
    const authResponse = await authorizeMcpRequest(
      c.req.raw,
      mcpAuthToken,
      mcpAllowUnauthenticated,
    );
    if (authResponse) return authResponse;
    const store = currentStore(c);
    if (store instanceof Response) return store;

    const { createMcpServer } = await import("./mcp.ts");
    const mcp = createMcpServer(store, {
      runtimeCapabilities: createExcelRuntimeCapabilityManifest({
        nativeRendering: options.nativeRendering,
      }),
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcp.connect(transport);

    const response = c.req.raw.method === "POST"
      ? await (async () => {
        const bounded = await readBoundedJsonRequest(c.req.raw);
        if (bounded instanceof Response) return bounded;
        return transport.handleRequest(bounded.request, {
          parsedBody: bounded.body,
        });
      })()
      : await transport.handleRequest(c.req.raw);

    if (response) {
      return response;
    }
    return c.json({ error: "No response from MCP" }, 500);
  });

  return app;
}

export function createExcelAppFromEnv(env: ExcelRuntimeEnv = denoEnv()) {
  const apiUrl = envValue(env, "TAKOS_STORAGE_API_URL") ||
    envValue(env, "TAKOS_API_URL") ||
    "http://localhost:8787";
  const token = envValue(env, "TAKOS_STORAGE_ACCESS_TOKEN") ||
    requiredEnv(env, "TAKOS_ACCESS_TOKEN");
  const defaultSpaceId = envValue(env, "TAKOS_SPACE_ID");
  const stores = new Map<string, SpreadsheetStore>();
  const storeForSpace = (spaceId: string): SpreadsheetStore => {
    let store = stores.get(spaceId);
    if (!store) {
      const client = createTakosStorageClient(apiUrl, token, spaceId);
      store = new SpreadsheetStore(client);
      stores.set(spaceId, store);
    }
    return store;
  };
  const requestSpaceId = (c: Context): string | null =>
    envValue(
      {
        value: c.req.query("space_id") ?? c.req.query("spaceId") ??
          defaultSpaceId,
      },
      "value",
    ) ?? null;
  const defaultStore = defaultSpaceId ? storeForSpace(defaultSpaceId) : null;
  return createServerApp(defaultStore, {
    env,
    nativeRendering: nativeRenderingEnabled(env),
    mcpAuthToken: envValue(env, "MCP_AUTH_TOKEN"),
    mcpAllowUnauthenticated: envFlagEnabled(
      env,
      "MCP_ALLOW_UNAUTHENTICATED",
    ),
    storeForRequest: (c) => {
      const spaceId = requestSpaceId(c);
      if (!spaceId) return c.json({ error: "space_id is required" }, 400);
      return storeForSpace(spaceId);
    },
  });
}

function main() {
  const env = denoEnv();
  const app = createExcelAppFromEnv(env);
  const port = Number(envValue(env, "PORT") ?? "8787");
  Deno.serve({ port }, app.fetch);
}

if (import.meta.main) main();
