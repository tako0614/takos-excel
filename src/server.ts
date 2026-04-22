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

function authorizeMcpRequest(
  request: Request,
  authToken?: string,
): Response | null {
  if (!authToken) return null;
  const header = request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (token === authToken) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function mcpAuthMisconfigured(
  required: boolean,
  authToken?: string,
): Response | null {
  if (!required || authToken) return null;
  return new Response(JSON.stringify({ error: "MCP_AUTH_TOKEN is required" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
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
  store: SpreadsheetStore,
  options: {
    env?: ExcelRuntimeEnv;
    nativeRendering?: boolean;
    mcpAuthToken?: string;
    mcpAuthRequired?: boolean;
  } = {},
) {
  const app = new Hono();
  const runtimeEnv = options.env ?? denoEnv();
  const mcpAuthRequired = options.mcpAuthRequired === true;
  const mcpAuthToken = options.mcpAuthToken;

  const health = (c: Context) => {
    const authError = appAuthMisconfigured(runtimeEnv);
    if (authError) return authError;
    const mcpAuthError = mcpAuthMisconfigured(mcpAuthRequired, mcpAuthToken);
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
    const summaries = await store.listSpreadsheets();
    const spreadsheets = await Promise.all(
      summaries.map((entry) => store.getSpreadsheet(entry.id)),
    );
    return c.json(spreadsheets);
  });
  app.post("/api/spreadsheets", async (c) => {
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
    try {
      return c.json(await store.getSpreadsheet(c.req.param("id")));
    } catch {
      return c.json({ error: "Spreadsheet not found" }, 404);
    }
  });
  app.put("/api/spreadsheets/:id", async (c) => {
    const body = await c.req.json<Spreadsheet>();
    return c.json(
      await store.replaceSpreadsheet({ ...body, id: c.req.param("id") }),
    );
  });
  app.delete("/api/spreadsheets/:id", async (c) => {
    try {
      await store.deleteSpreadsheet(c.req.param("id"));
      return c.json({ deleted: true });
    } catch {
      return c.json({ deleted: false });
    }
  });

  app.all("/mcp", async (c) => {
    const configError = mcpAuthMisconfigured(
      mcpAuthRequired,
      mcpAuthToken,
    );
    if (configError) return configError;

    const authResponse = authorizeMcpRequest(
      c.req.raw,
      mcpAuthToken,
    );
    if (authResponse) return authResponse;

    const { createMcpServer } = await import("./mcp.ts");
    const mcp = createMcpServer(store, {
      nativeRendering: options.nativeRendering,
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
  const spaceId = requiredEnv(env, "TAKOS_SPACE_ID");
  const client = createTakosStorageClient(apiUrl, token, spaceId);
  const store = new SpreadsheetStore(client);
  return createServerApp(store, {
    env,
    nativeRendering: nativeRenderingEnabled(env),
    mcpAuthToken: envValue(env, "MCP_AUTH_TOKEN"),
    mcpAuthRequired: envFlagEnabled(env, "MCP_AUTH_REQUIRED"),
  });
}

function main() {
  const env = denoEnv();
  const app = createExcelAppFromEnv(env);
  const port = Number(envValue(env, "PORT") ?? "8787");
  Deno.serve({ port }, app.fetch);
}

if (import.meta.main) main();
