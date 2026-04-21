import { createServerApp, EXCEL_MAX_MCP_REQUEST_BYTES } from "../server.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

const store = {} as never;
const app = createServerApp(store);

Deno.test("health endpoint returns ok", async () => {
  const res = await app.request("/health");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "ok" });
});

Deno.test("root path is not a text landing route", async () => {
  const res = await app.request("/");
  assertEquals(res.status, 404);
});

Deno.test("spreadsheet collection writes require app auth when enabled", async () => {
  const authApp = createServerApp(store, {
    env: {
      APP_AUTH_REQUIRED: "1",
      OAUTH_ISSUER_URL: "https://takos.example",
      OAUTH_CLIENT_ID: "client",
      OAUTH_CLIENT_SECRET: "secret",
      APP_SESSION_SECRET: "session-secret",
    },
  });
  const res = await authApp.request(
    new Request("http://localhost/api/spreadsheets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Private" }),
    }),
  );

  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "Unauthorized" });
});

Deno.test("mcp endpoint rejects oversized request bodies", async () => {
  const res = await app.request(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(EXCEL_MAX_MCP_REQUEST_BYTES + 1),
      },
      body: "{}",
    }),
  );

  assertEquals(res.status, 413);
  assertEquals(await res.json(), { error: "Request body too large" });
});

Deno.test("mcp endpoint enforces optional bearer auth before handling body", async () => {
  const authApp = createServerApp(store, { mcpAuthToken: "secret" });
  const res = await authApp.request(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );

  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "Unauthorized" });
});

Deno.test("mcp endpoint fails closed when managed auth is required but token is missing", async () => {
  const authApp = createServerApp(store, { mcpAuthRequired: true });
  const res = await authApp.request(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );

  assertEquals(res.status, 503);
  assertEquals(await res.json(), { error: "MCP_AUTH_TOKEN is required" });
});

Deno.test("health endpoint fails when managed mcp auth is required but token is missing", async () => {
  const authApp = createServerApp(store, { mcpAuthRequired: true });
  const res = await authApp.request("/health");

  assertEquals(res.status, 503);
  assertEquals(await res.json(), { error: "MCP_AUTH_TOKEN is required" });
});
