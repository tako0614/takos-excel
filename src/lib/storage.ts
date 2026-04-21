import type { Sheet, Spreadsheet } from "../types/index.ts";

const STORAGE_KEY = "takos-excel-spreadsheets";
const API_SPREADSHEETS_PATH = "/api/spreadsheets";

function redirectToLogin(): void {
  const location = globalThis.location;
  if (!location) return;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  location.href = `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

export function clearSpreadsheetsCache(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  if (response.status === 401) {
    clearSpreadsheetsCache();
    redirectToLogin();
  }
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return await response.json() as T;
}

function syncSpreadsheetToApi(spreadsheet: Spreadsheet): void {
  void requestJson<Spreadsheet>(
    `${API_SPREADSHEETS_PATH}/${encodeURIComponent(spreadsheet.id)}`,
    {
      method: "PUT",
      body: JSON.stringify(spreadsheet),
    },
  ).catch(() => undefined);
}

function deleteSpreadsheetFromApi(id: string): void {
  void fetch(`${API_SPREADSHEETS_PATH}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  }).then((response) => {
    if (response.status === 401) {
      clearSpreadsheetsCache();
      redirectToLogin();
    }
  }).catch(() => undefined);
}

export async function loadSpreadsheetsFromApi(): Promise<Spreadsheet[]> {
  const spreadsheets = await requestJson<Spreadsheet[]>(API_SPREADSHEETS_PATH);
  saveSpreadsheets(spreadsheets);
  return spreadsheets;
}

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
  syncSpreadsheetToApi(spreadsheet);
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
    syncSpreadsheetToApi(all[index]);
  }
}

/**
 * Delete a spreadsheet by ID
 */
export function deleteSpreadsheet(id: string): void {
  const all = loadSpreadsheets();
  saveSpreadsheets(all.filter((s) => s.id !== id));
  deleteSpreadsheetFromApi(id);
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
  syncSpreadsheetToApi(ss);
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
  syncSpreadsheetToApi(ss);
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
  syncSpreadsheetToApi(ss);
  return true;
}
