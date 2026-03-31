import { Hono } from "hono";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.ts";

const app = new Hono();

app.get("/", (c) => c.text("takos-excel MCP server"));

app.post("/mcp", async (c) => {
  const mcp = createMcpServer();
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
