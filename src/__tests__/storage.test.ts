import { assertEquals } from "std/assert";
import { updateSpreadsheet } from "../lib/storage.ts";
import type { Spreadsheet } from "../types/index.ts";

const STORAGE_KEY = "takos-excel-spreadsheets";

function makeSpreadsheet(): Spreadsheet {
  const now = "2026-04-30T00:00:00.000Z";
  return {
    id: "spreadsheet-1",
    title: "Budget",
    sheets: [{
      id: "sheet-1",
      name: "Sheet1",
      cells: {},
      colWidths: {},
      rowHeights: {},
    }],
    activeSheetId: "sheet-1",
    createdAt: now,
    updatedAt: now,
  };
}

Deno.test("client storage normalizes spaceId query to space_id", async () => {
  const originalLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  const spreadsheet = makeSpreadsheet();

  localStorage.setItem(STORAGE_KEY, JSON.stringify([spreadsheet]));
  Object.defineProperty(globalThis, "location", {
    value: new URL("http://localhost/editor?spaceId=space-camel"),
    configurable: true,
  });
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = input instanceof Request ? input.url : String(input);
    return Promise.resolve(
      new Response(String(init?.body ?? "{}"), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  try {
    await updateSpreadsheet(spreadsheet);
    assertEquals(
      requestedUrl,
      "/api/spreadsheets/spreadsheet-1?space_id=space-camel",
    );
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.removeItem(STORAGE_KEY);
    if (originalLocation) {
      Object.defineProperty(globalThis, "location", originalLocation);
    } else {
      delete (globalThis as { location?: Location }).location;
    }
  }
});
