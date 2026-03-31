import { Hono } from "hono";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createTakosStorageClient } from "./lib/takos-storage.ts";
import { SpreadsheetStore } from "./spreadsheet-store.ts";
import { createMcpServer } from "./mcp.ts";

const apiUrl = Deno.env.get("TAKOS_API_URL") || "http://localhost:8787";
const token = Deno.env.get("TAKOS_ACCESS_TOKEN") || "";
const spaceId = Deno.env.get("TAKOS_SPACE_ID") || "default";

const client = createTakosStorageClient(apiUrl, token, spaceId);
const store = new SpreadsheetStore(client);

const app = new Hono();

app.get("/", (c) => c.text("takos-excel MCP server"));

app.post("/mcp", async (c) => {
  const mcp = createMcpServer(store);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await mcp.connect(transport);

  const body = await c.req.json();
  const response = await transport.handleRequest(c.req.raw, body);

  if (response) {
    return response;
  }
  return c.json({ error: "No response from MCP" }, 500);
});

const port = Number(Deno.env.get("PORT") ?? "8787");

Deno.serve({ port }, app.fetch);
