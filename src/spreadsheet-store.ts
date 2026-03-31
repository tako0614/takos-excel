/**
 * In-memory spreadsheet store for the MCP server.
 * Mirrors the localStorage-based storage.ts but operates purely in memory
 * so it can run in a Deno server context without browser APIs.
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const spreadsheets = new Map<string, Spreadsheet>();

function now(): string {
  return new Date().toISOString();
}

function touch(ss: Spreadsheet): void {
  ss.updatedAt = now();
}

// ---------------------------------------------------------------------------
// Spreadsheet CRUD
// ---------------------------------------------------------------------------

export function listSpreadsheets(): {
  id: string;
  title: string;
  sheetCount: number;
  updatedAt: string;
}[] {
  return [...spreadsheets.values()].map((ss) => ({
    id: ss.id,
    title: ss.title,
    sheetCount: ss.sheets.length,
    updatedAt: ss.updatedAt,
  }));
}

export function createSpreadsheet(title: string): string {
  const id = crypto.randomUUID();
  const sheetId = crypto.randomUUID();
  const defaultSheet: Sheet = {
    id: sheetId,
    name: "Sheet1",
    cells: {},
    colWidths: {},
    rowHeights: {},
  };
  const ts = now();
  spreadsheets.set(id, {
    id,
    title,
    sheets: [defaultSheet],
    activeSheetId: sheetId,
    createdAt: ts,
    updatedAt: ts,
  });
  return id;
}

export function getSpreadsheet(id: string): Spreadsheet {
  const ss = spreadsheets.get(id);
  if (!ss) throw new Error(`Spreadsheet not found: ${id}`);
  return ss;
}

export function deleteSpreadsheet(id: string): void {
  if (!spreadsheets.has(id))
    throw new Error(`Spreadsheet not found: ${id}`);
  spreadsheets.delete(id);
}

export function setSpreadsheetTitle(id: string, title: string): void {
  const ss = getSpreadsheet(id);
  ss.title = title;
  touch(ss);
}

// ---------------------------------------------------------------------------
// Sheet tab helpers
// ---------------------------------------------------------------------------

function getSheet(spreadsheetId: string, sheetId: string): { ss: Spreadsheet; sheet: Sheet } {
  const ss = getSpreadsheet(spreadsheetId);
  const sheet = ss.sheets.find((s) => s.id === sheetId);
  if (!sheet) throw new Error(`Sheet not found: ${sheetId}`);
  return { ss, sheet };
}

export function addTab(spreadsheetId: string, name?: string): string {
  const ss = getSpreadsheet(spreadsheetId);
  const sheetId = crypto.randomUUID();
  const tabName = name ?? `Sheet${ss.sheets.length + 1}`;
  ss.sheets.push({
    id: sheetId,
    name: tabName,
    cells: {},
    colWidths: {},
    rowHeights: {},
  });
  touch(ss);
  return sheetId;
}

export function removeTab(spreadsheetId: string, sheetId: string): void {
  const ss = getSpreadsheet(spreadsheetId);
  if (ss.sheets.length <= 1) throw new Error("Cannot remove the last sheet tab");
  ss.sheets = ss.sheets.filter((s) => s.id !== sheetId);
  if (ss.activeSheetId === sheetId) {
    ss.activeSheetId = ss.sheets[0].id;
  }
  touch(ss);
}

export function renameTab(
  spreadsheetId: string,
  sheetId: string,
  name: string,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
  sheet.name = name;
  touch(ss);
}

// ---------------------------------------------------------------------------
// Cell operations
// ---------------------------------------------------------------------------

export function getCell(
  spreadsheetId: string,
  sheetId: string,
  cell: CellAddress,
): { value: string; computed: string; format: CellFormat | undefined } {
  const { sheet } = getSheet(spreadsheetId, sheetId);
  const data = sheet.cells[cell];
  if (!data) return { value: "", computed: "", format: undefined };
  return {
    value: data.value,
    computed: data.computed ?? data.value,
    format: data.format,
  };
}

export function setCell(
  spreadsheetId: string,
  sheetId: string,
  cell: CellAddress,
  value: string,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
  // Use the formula engine's setCellValue which re-evaluates
  sheet.cells = setCellValue(sheet, cell, value);
  touch(ss);
}

/**
 * Parse a range string like "A1:C10" into start/end col/row (0-based).
 */
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

export function getRange(
  spreadsheetId: string,
  sheetId: string,
  range: string,
): string[][] {
  const { sheet } = getSheet(spreadsheetId, sheetId);
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

export function setRange(
  spreadsheetId: string,
  sheetId: string,
  startCell: string,
  values: string[][],
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
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
  // Re-evaluate entire sheet
  sheet.cells = evaluateSheet(sheet);
  touch(ss);
}

export function clearRange(
  spreadsheetId: string,
  sheetId: string,
  range: string,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
  const { startCol, startRow, endCol, endRow } = parseRange(range);
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const addr = formatCellAddress(c, r);
      delete sheet.cells[addr];
    }
  }
  sheet.cells = evaluateSheet(sheet);
  touch(ss);
}

export function formatCell(
  spreadsheetId: string,
  sheetId: string,
  cell: CellAddress,
  format: CellFormat,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
  const existing = sheet.cells[cell];
  sheet.cells[cell] = {
    value: existing?.value ?? "",
    computed: existing?.computed,
    format: { ...(existing?.format ?? {}), ...format },
  };
  touch(ss);
}

export function formatRange(
  spreadsheetId: string,
  sheetId: string,
  range: string,
  format: CellFormat,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
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
  touch(ss);
}

// ---------------------------------------------------------------------------
// Formula & computation
// ---------------------------------------------------------------------------

export function evaluate(
  spreadsheetId: string,
  sheetId: string,
  formula: string,
): string {
  const { sheet } = getSheet(spreadsheetId, sheetId);
  // Sync sheet state and evaluate the formula in an empty cell
  const hf = getEngine();
  const hfSheetId = syncSheetToEngine(sheet);

  // Find an unused cell far away
  const tmpRow = 9999;
  const tmpCol = 99;
  try {
    hf.setCellContents({ sheet: hfSheetId, row: tmpRow, col: tmpCol }, [
      [formula],
    ]);
    const result = hf.getCellValue({ sheet: hfSheetId, row: tmpRow, col: tmpCol });
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

export function getComputed(
  spreadsheetId: string,
  sheetId: string,
  range: string,
): string[][] {
  const { sheet } = getSheet(spreadsheetId, sheetId);
  // Re-evaluate to ensure computed values are current
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

// ---------------------------------------------------------------------------
// Column / Row sizing
// ---------------------------------------------------------------------------

export function setColumnWidth(
  spreadsheetId: string,
  sheetId: string,
  column: string,
  width: number,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
  const colIndex = letterToColumn(column);
  sheet.colWidths[colIndex] = width;
  touch(ss);
}

export function setRowHeight(
  spreadsheetId: string,
  sheetId: string,
  row: number,
  height: number,
): void {
  const { ss, sheet } = getSheet(spreadsheetId, sheetId);
  sheet.rowHeights[row] = height;
  touch(ss);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportCsv(spreadsheetId: string, sheetId: string): string {
  const { sheet } = getSheet(spreadsheetId, sheetId);
  const cells = evaluateSheet(sheet);

  // Find the data bounds
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
      // Escape CSV: if contains comma, newline, or quote, wrap in quotes
      if (val.includes(",") || val.includes("\n") || val.includes('"')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      cols.push(val);
    }
    lines.push(cols.join(","));
  }
  return lines.join("\n");
}

export function exportJson(spreadsheetId: string): string {
  const ss = getSpreadsheet(spreadsheetId);
  return JSON.stringify(ss, null, 2);
}
