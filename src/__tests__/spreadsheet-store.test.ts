import { assertEquals, assertRejects } from "std/assert";
import { SpreadsheetStore } from "../spreadsheet-store.ts";
import type { StorageFile, TakosStorageClient } from "../lib/takos-storage.ts";
import type { Spreadsheet } from "../types/index.ts";

function makeSpreadsheet(overrides: Partial<Spreadsheet> = {}): Spreadsheet {
  const now = "2026-04-30T00:00:00.000Z";
  return {
    id: overrides.id ?? "spreadsheet-1",
    title: overrides.title ?? "Budget",
    sheets: overrides.sheets ?? [{
      id: "sheet-1",
      name: "Sheet1",
      cells: {},
      colWidths: {},
      rowHeights: {},
    }],
    activeSheetId: overrides.activeSheetId ?? "sheet-1",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function createMemoryStorage() {
  const files = new Map<string, StorageFile>();
  const content = new Map<string, string>();

  const makeFile = (
    name: string,
    type: "file" | "folder",
    parentId?: string,
    mimeType?: string,
  ): StorageFile => {
    const now = new Date().toISOString();
    const file = {
      id: crypto.randomUUID(),
      name,
      parentId,
      type,
      mimeType,
      createdAt: now,
      updatedAt: now,
    };
    files.set(file.id, file);
    return file;
  };

  const client: TakosStorageClient = {
    list(prefix?: string) {
      const all = [...files.values()];
      if (!prefix) return Promise.resolve(all);
      const folder = all.find((file) =>
        file.type === "folder" && file.name === prefix
      );
      return Promise.resolve(
        folder ? all.filter((file) => file.parentId === folder.id) : [],
      );
    },
    get(fileId: string) {
      return Promise.resolve(files.get(fileId) ?? null);
    },
    getContent(fileId: string) {
      return Promise.resolve(content.get(fileId) ?? "");
    },
    putContent(fileId: string, value: string) {
      content.set(fileId, value);
      return Promise.resolve();
    },
    create(
      name: string,
      parentId?: string,
      options?: { content?: string; mimeType?: string },
    ) {
      const file = makeFile(name, "file", parentId, options?.mimeType);
      content.set(file.id, options?.content ?? "");
      return Promise.resolve(file);
    },
    createFolder(name: string, parentId?: string) {
      return Promise.resolve(makeFile(name, "folder", parentId));
    },
    rename(fileId: string, name: string) {
      const file = files.get(fileId);
      if (file) files.set(fileId, { ...file, name });
      return Promise.resolve();
    },
    delete(fileId: string) {
      files.delete(fileId);
      content.delete(fileId);
      return Promise.resolve();
    },
  };

  return { client, files, content, makeFile };
}

Deno.test("SpreadsheetStore ignores legacy .json files", async () => {
  const storage = createMemoryStorage();
  const folder = storage.makeFile("takos-excel", "folder");
  const legacySpreadsheet = makeSpreadsheet({ id: "legacy" });
  const currentSpreadsheet = makeSpreadsheet({ id: "current" });
  const legacyFile = storage.makeFile(
    "legacy.json",
    "file",
    folder.id,
    "application/vnd.takos.excel+json",
  );
  const currentFile = storage.makeFile(
    "current.takossheet",
    "file",
    folder.id,
  );
  storage.content.set(legacyFile.id, JSON.stringify(legacySpreadsheet));
  storage.content.set(currentFile.id, JSON.stringify(currentSpreadsheet));

  const store = new SpreadsheetStore(storage.client);

  assertEquals((await store.listSpreadsheets()).map((sheet) => sheet.id), [
    "current",
  ]);
  await assertRejects(
    () => store.getSpreadsheet(legacyFile.id),
    Error,
    `Spreadsheet not found: ${legacyFile.id}`,
  );
});

Deno.test("SpreadsheetStore creates only .takossheet files", async () => {
  const storage = createMemoryStorage();
  const store = new SpreadsheetStore(storage.client);

  const id = await store.createSpreadsheet("Budget");
  const createdFile = [...storage.files.values()].find((file) =>
    file.type === "file"
  );

  assertEquals(createdFile?.name, `${id}.takossheet`);
  assertEquals(createdFile?.mimeType, "application/vnd.takos.excel+json");
});
