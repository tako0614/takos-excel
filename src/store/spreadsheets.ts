import { atom } from "jotai";
import type { Spreadsheet, CellAddress } from "../types";
import { loadSpreadsheets } from "../lib/storage";

/**
 * All spreadsheets loaded from localStorage
 */
export const spreadsheetsAtom = atom<Spreadsheet[]>(loadSpreadsheets());

/**
 * The currently open spreadsheet (for the editor page)
 */
export const currentSpreadsheetAtom = atom<Spreadsheet | null>(null);

/**
 * Derived: the active sheet of the current spreadsheet
 */
export const activeSheetAtom = atom((get) => {
  const ss = get(currentSpreadsheetAtom);
  if (!ss) return null;
  return ss.sheets.find((s) => s.id === ss.activeSheetId) ?? ss.sheets[0] ?? null;
});

/**
 * Currently selected cell address (e.g., "A1")
 */
export const selectedCellAtom = atom<CellAddress>("A1");

/**
 * Selection range: start and end addresses for range selection
 */
export const selectionRangeAtom = atom<{
  start: CellAddress;
  end: CellAddress;
} | null>(null);

/**
 * Whether the cell editor is currently active
 */
export const isEditingAtom = atom<boolean>(false);

/**
 * The current value being edited in the formula bar / cell editor
 */
export const editValueAtom = atom<string>("");
