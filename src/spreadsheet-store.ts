/**
 * SpreadsheetStore backed by the takos platform storage API.
 *
 * Each spreadsheet is stored as a JSON file under a `/takos-excel/` folder:
 *   - File name: `{id}.json`
 *   - Content: full Spreadsheet object serialised as JSON
 *
 * The store keeps an in-memory cache that is hydrated on first access
 * and written through on every mutation.
 */
import type {
  Spreadsheet,
  Sheet,
  CellData,
  CellFormat,
  CellAddress,
} from "./types/index.ts";
import {
  parseCellAddress,
  formatCellAddress,
  columnToLetter,
  letterToColumn,
} from "./lib/cell-utils.ts";
import {
  evaluateSheet,
  syncSheetToEngine,
  getEngine,
  getCellValue,
  setCellValue,
} from "./lib/formula.ts";
import type { TakosStorageClient } from "./lib/takos-storage.ts";

const FOLDER_NAME = "takos-excel";

// ---------------------------------------------------------------------------
// SpreadsheetStore
// ---------------------------------------------------------------------------

export class SpreadsheetStore {
  private client: TakosStorageClient;
  /** spreadsheet.id -> { spreadsheet, fileId } */
  private cache = new Map<string, { ss: Spreadsheet; fileId: string }>();
  private folderId: string | null = null;
  private initialized = false;

  constructor(client: TakosStorageClient) {
    this.client = client;
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const files = await this.client.list();
    const folder = files.find(
      (f) => f.type === "folder" && f.name === FOLDER_NAME,
    );
    if (folder) {
      this.folderId = folder.id;
    } else {
      const created = await this.client.createFolder(FOLDER_NAME);
      this.folderId = created.id;
    }

    const allFiles = await this.client.list(FOLDER_NAME);
    for (const file of allFiles) {
      if (file.type !== "file" || !file.name.endsWith(".json")) continue;
      try {
        const raw = await this.client.getContent(file.id);
        const ss = JSON.parse(raw) as Spreadsheet;
        this.cache.set(ss.id, { ss, fileId: file.id });
      } catch {
        console.warn(
          `[takos-excel] Skipping unreadable file: ${file.name}`,
        );
      }
    }

    this.initialized = true;
  }

  private async persist(id: string): Promise<void> {
    const entry = this.cache.get(id);
    if (!entry) return;
    await this.client.putContent(entry.fileId, JSON.stringify(entry.ss));
  }

  private touch(ss: Spreadsheet): void {
    ss.updatedAt = new Date().toISOString();
  }

  // -----------------------------------------------------------------------
  // Spreadsheet CRUD
  // -----------------------------------------------------------------------

  async listSpreadsheets(): Promise<
    { id: string; title: string; sheetCount: number; updatedAt: string }[]
  > {
    await this.ensureInitialized();
    return [...this.cache.values()].map((e) => ({
      id: e.ss.id,
      title: e.ss.title,
      sheetCount: e.ss.sheets.length,
      updatedAt: e.ss.updatedAt,
    }));
  }

  async createSpreadsheet(title: string): Promise<string> {
    await this.ensureInitialized();
    const id = crypto.randomUUID();
    const sheetId = crypto.randomUUID();
    const defaultSheet: Sheet = {
      id: sheetId,
      name: "Sheet1",
      cells: {},
      colWidths: {},
      rowHeights: {},
    };
    const ts = new Date().toISOString();
    const ss: Spreadsheet = {
      id,
      title,
      sheets: [defaultSheet],
      activeSheetId: sheetId,
      createdAt: ts,
      updatedAt: ts,
    };

    const file = await this.client.create(
      `${id}.json`,
      this.folderId ?? undefined,
    );
    await this.client.putContent(file.id, JSON.stringify(ss));
    this.cache.set(id, { ss, fileId: file.id });
    return id;
  }

  async getSpreadsheet(id: string): Promise<Spreadsheet> {
    await this.ensureInitialized();
    const entry = this.cache.get(id);
    if (!entry) throw new Error(`Spreadsheet not found: ${id}`);
    return entry.ss;
  }

  async deleteSpreadsheet(id: string): Promise<void> {
    await this.ensureInitialized();
    const entry = this.cache.get(id);
    if (!entry) throw new Error(`Spreadsheet not found: ${id}`);
    await this.client.delete(entry.fileId);
    this.cache.delete(id);
  }

  async setSpreadsheetTitle(id: string, title: string): Promise<void> {
    const ss = await this.getSpreadsheet(id);
    ss.title = title;
    this.touch(ss);
    await this.persist(id);
  }

  // -----------------------------------------------------------------------
  // Sheet tab helpers
  // -----------------------------------------------------------------------

  private async getSheet(
    spreadsheetId: string,
    sheetId: string,
  ): Promise<{ ss: Spreadsheet; sheet: Sheet }> {
    const ss = await this.getSpreadsheet(spreadsheetId);
    const sheet = ss.sheets.find((s) => s.id === sheetId);
    if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);
    return { ss, sheet };
  }

  async addTab(spreadsheetId: string, name?: string): Promise<string> {
    const ss = await this.getSpreadsheet(spreadsheetId);
    const sheetId = crypto.randomUUID();
    const tabName = name ?? `Sheet${ss.sheets.length + 1}`;
    ss.sheets.push({
      id: sheetId,
      name: tabName,
      cells: {},
      colWidths: {},
      rowHeights: {},
    });
    this.touch(ss);
    await this.persist(spreadsheetId);
    return sheetId;
  }

  async removeTab(spreadsheetId: string, sheetId: string): Promise<void> {
    const ss = await this.getSpreadsheet(spreadsheetId);
    if (ss.sheets.length <= 1)
      throw new Error("Cannot remove the last sheet tab");
    ss.sheets = ss.sheets.filter((s) => s.id !== sheetId);
    if (ss.activeSheetId === sheetId) {
      ss.activeSheetId = ss.sheets[0].id;
    }
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  async renameTab(
    spreadsheetId: string,
    sheetId: string,
    name: string,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    sheet.name = name;
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  // -----------------------------------------------------------------------
  // Cell operations
  // -----------------------------------------------------------------------

  async getCell(
    spreadsheetId: string,
    sheetId: string,
    cell: CellAddress,
  ): Promise<{
    value: string;
    computed: string;
    format: CellFormat | undefined;
  }> {
    const { sheet } = await this.getSheet(spreadsheetId, sheetId);
    const data = sheet.cells[cell];
    if (!data) return { value: "", computed: "", format: undefined };
    return {
      value: data.value,
      computed: data.computed ?? data.value,
      format: data.format,
    };
  }

  async setCell(
    spreadsheetId: string,
    sheetId: string,
    cell: CellAddress,
    value: string,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    sheet.cells = setCellValue(sheet, cell, value);
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  async getRange(
    spreadsheetId: string,
    sheetId: string,
    range: string,
  ): Promise<string[][]> {
    const { sheet } = await this.getSheet(spreadsheetId, sheetId);
    const { startCol, startRow, endCol, endRow } = parseRange(range);
    const result: string[][] = [];
    for (let r = startRow; r <= endRow; r++) {
      const row: string[] = [];
      for (let c = startCol; c <= endCol; c++) {
        const addr = formatCellAddress(c, r);
        const cell = sheet.cells[addr];
        row.push(cell ? cell.value : "");
      }
      result.push(row);
    }
    return result;
  }

  async setRange(
    spreadsheetId: string,
    sheetId: string,
    startCell: string,
    values: string[][],
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    const { col: sc, row: sr } = parseCellAddress(startCell);
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const addr = formatCellAddress(sc + c, sr + r);
        const existing = sheet.cells[addr];
        sheet.cells[addr] = {
          ...existing,
          value: values[r][c],
          format: existing?.format,
        };
      }
    }
    sheet.cells = evaluateSheet(sheet);
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  async clearRange(
    spreadsheetId: string,
    sheetId: string,
    range: string,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    const { startCol, startRow, endCol, endRow } = parseRange(range);
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const addr = formatCellAddress(c, r);
        delete sheet.cells[addr];
      }
    }
    sheet.cells = evaluateSheet(sheet);
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  async formatCell(
    spreadsheetId: string,
    sheetId: string,
    cell: CellAddress,
    format: CellFormat,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    const existing = sheet.cells[cell];
    sheet.cells[cell] = {
      value: existing?.value ?? "",
      computed: existing?.computed,
      format: { ...(existing?.format ?? {}), ...format },
    };
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  async formatRange(
    spreadsheetId: string,
    sheetId: string,
    range: string,
    format: CellFormat,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    const { startCol, startRow, endCol, endRow } = parseRange(range);
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const addr = formatCellAddress(c, r);
        const existing = sheet.cells[addr];
        sheet.cells[addr] = {
          value: existing?.value ?? "",
          computed: existing?.computed,
          format: { ...(existing?.format ?? {}), ...format },
        };
      }
    }
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  // -----------------------------------------------------------------------
  // Formula & computation
  // -----------------------------------------------------------------------

  async evaluate(
    spreadsheetId: string,
    sheetId: string,
    formula: string,
  ): Promise<string> {
    const { sheet } = await this.getSheet(spreadsheetId, sheetId);
    const hf = getEngine();
    const hfSheetId = syncSheetToEngine(sheet);

    const tmpRow = 9999;
    const tmpCol = 99;
    try {
      hf.setCellContents({ sheet: hfSheetId, row: tmpRow, col: tmpCol }, [
        [formula],
      ]);
      const result = hf.getCellValue({
        sheet: hfSheetId,
        row: tmpRow,
        col: tmpCol,
      });
      if (result !== null && result !== undefined) {
        if (typeof result === "object" && "type" in result) {
          return "#ERROR!";
        }
        return String(result);
      }
      return "";
    } catch {
      return "#ERROR!";
    }
  }

  async getComputed(
    spreadsheetId: string,
    sheetId: string,
    range: string,
  ): Promise<string[][]> {
    const { sheet } = await this.getSheet(spreadsheetId, sheetId);
    const cells = evaluateSheet(sheet);
    const { startCol, startRow, endCol, endRow } = parseRange(range);
    const result: string[][] = [];
    for (let r = startRow; r <= endRow; r++) {
      const row: string[] = [];
      for (let c = startCol; c <= endCol; c++) {
        const addr = formatCellAddress(c, r);
        const cell = cells[addr];
        row.push(cell ? (cell.computed ?? cell.value) : "");
      }
      result.push(row);
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Column / Row sizing
  // -----------------------------------------------------------------------

  async setColumnWidth(
    spreadsheetId: string,
    sheetId: string,
    column: string,
    width: number,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    const colIndex = letterToColumn(column);
    sheet.colWidths[colIndex] = width;
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  async setRowHeight(
    spreadsheetId: string,
    sheetId: string,
    row: number,
    height: number,
  ): Promise<void> {
    const { ss, sheet } = await this.getSheet(spreadsheetId, sheetId);
    sheet.rowHeights[row] = height;
    this.touch(ss);
    await this.persist(spreadsheetId);
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  async exportCsv(spreadsheetId: string, sheetId: string): Promise<string> {
    const { sheet } = await this.getSheet(spreadsheetId, sheetId);
    const cells = evaluateSheet(sheet);

    let maxRow = 0;
    let maxCol = 0;
    for (const addr of Object.keys(cells)) {
      try {
        const { col, row } = parseCellAddress(addr);
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
      } catch {
        // skip invalid
      }
    }

    const lines: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const cols: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const addr = formatCellAddress(c, r);
        const cell = cells[addr];
        let val = cell ? (cell.computed ?? cell.value) : "";
        if (val.includes(",") || val.includes("\n") || val.includes('"')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        cols.push(val);
      }
      lines.push(cols.join(","));
    }
    return lines.join("\n");
  }

  async exportJson(spreadsheetId: string): Promise<string> {
    const ss = await this.getSpreadsheet(spreadsheetId);
    return JSON.stringify(ss, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Utility (private)
// ---------------------------------------------------------------------------

function parseRange(range: string): {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
} {
  const parts = range.split(":");
  if (parts.length !== 2) throw new Error(`Invalid range: ${range}`);
  const start = parseCellAddress(parts[0]);
  const end = parseCellAddress(parts[1]);
  return {
    startCol: Math.min(start.col, end.col),
    startRow: Math.min(start.row, end.row),
    endCol: Math.max(start.col, end.col),
    endRow: Math.max(start.row, end.row),
  };
}
