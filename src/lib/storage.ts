import type { Spreadsheet, Sheet } from "../types";

const STORAGE_KEY = "takos-excel-spreadsheets";

/**
 * Load all spreadsheets from localStorage
 */
export function loadSpreadsheets(): Spreadsheet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Spreadsheet[];
  } catch {
    return [];
  }
}

/**
 * Save all spreadsheets to localStorage
 */
export function saveSpreadsheets(spreadsheets: Spreadsheet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spreadsheets));
}

/**
 * Get a single spreadsheet by ID
 */
export function getSpreadsheet(id: string): Spreadsheet | undefined {
  const all = loadSpreadsheets();
  return all.find((s) => s.id === id);
}

/**
 * Create a new spreadsheet
 */
export function createSpreadsheet(title: string): Spreadsheet {
  const now = new Date().toISOString();
  const sheetId = crypto.randomUUID();
  const defaultSheet: Sheet = {
    id: sheetId,
    name: "Sheet1",
    cells: {},
    colWidths: {},
    rowHeights: {},
  };

  const spreadsheet: Spreadsheet = {
    id: crypto.randomUUID(),
    title,
    sheets: [defaultSheet],
    activeSheetId: sheetId,
    createdAt: now,
    updatedAt: now,
  };

  const all = loadSpreadsheets();
  all.push(spreadsheet);
  saveSpreadsheets(all);
  return spreadsheet;
}

/**
 * Update an existing spreadsheet
 */
export function updateSpreadsheet(spreadsheet: Spreadsheet): void {
  const all = loadSpreadsheets();
  const index = all.findIndex((s) => s.id === spreadsheet.id);
  if (index !== -1) {
    all[index] = { ...spreadsheet, updatedAt: new Date().toISOString() };
    saveSpreadsheets(all);
  }
}

/**
 * Delete a spreadsheet by ID
 */
export function deleteSpreadsheet(id: string): void {
  const all = loadSpreadsheets();
  saveSpreadsheets(all.filter((s) => s.id !== id));
}

/**
 * Add a sheet to a spreadsheet
 */
export function addSheet(spreadsheetId: string): Sheet | undefined {
  const all = loadSpreadsheets();
  const ss = all.find((s) => s.id === spreadsheetId);
  if (!ss) return undefined;

  const sheetNum = ss.sheets.length + 1;
  const newSheet: Sheet = {
    id: crypto.randomUUID(),
    name: `Sheet${sheetNum}`,
    cells: {},
    colWidths: {},
    rowHeights: {},
  };

  ss.sheets.push(newSheet);
  ss.activeSheetId = newSheet.id;
  ss.updatedAt = new Date().toISOString();
  saveSpreadsheets(all);
  return newSheet;
}

/**
 * Delete a sheet from a spreadsheet
 */
export function deleteSheet(
  spreadsheetId: string,
  sheetId: string,
): boolean {
  const all = loadSpreadsheets();
  const ss = all.find((s) => s.id === spreadsheetId);
  if (!ss || ss.sheets.length <= 1) return false;

  ss.sheets = ss.sheets.filter((s) => s.id !== sheetId);
  if (ss.activeSheetId === sheetId) {
    ss.activeSheetId = ss.sheets[0].id;
  }
  ss.updatedAt = new Date().toISOString();
  saveSpreadsheets(all);
  return true;
}

/**
 * Rename a sheet
 */
export function renameSheet(
  spreadsheetId: string,
  sheetId: string,
  newName: string,
): boolean {
  const all = loadSpreadsheets();
  const ss = all.find((s) => s.id === spreadsheetId);
  if (!ss) return false;

  const sheet = ss.sheets.find((s) => s.id === sheetId);
  if (!sheet) return false;

  sheet.name = newName;
  ss.updatedAt = new Date().toISOString();
  saveSpreadsheets(all);
  return true;
}
