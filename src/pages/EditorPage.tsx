import { Component, createSignal, createEffect, onMount, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import type { Spreadsheet, Sheet, CellFormat, CellData } from "../types";
import {
  getSpreadsheet,
  updateSpreadsheet,
  addSheet,
  deleteSheet,
  renameSheet,
} from "../lib/storage";
import { evaluateSheet, setCellValue } from "../lib/formula";
import { parseCellAddress, formatCellAddress } from "../lib/cell-utils";
import { Grid } from "../components/Grid";
import { Toolbar } from "../components/Toolbar";
import { FormulaBar } from "../components/FormulaBar";
import { SheetTabs } from "../components/SheetTabs";

export const EditorPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [spreadsheet, setSpreadsheet] = createSignal<Spreadsheet | null>(null);
  const [selectedCell, setSelectedCell] = createSignal("A1");
  const [selectionRange, setSelectionRange] = createSignal<{
    start: string;
    end: string;
  } | null>(null);
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");

  // Load spreadsheet on mount
  onMount(() => {
    const ss = getSpreadsheet(params.id);
    if (!ss) {
      navigate("/");
      return;
    }
    // Evaluate all formulas on load
    const activeSheet = ss.sheets.find((s) => s.id === ss.activeSheetId) ?? ss.sheets[0];
    if (activeSheet) {
      activeSheet.cells = evaluateSheet(activeSheet);
    }
    setSpreadsheet(ss);
  });

  // Get active sheet
  const activeSheet = (): Sheet | null => {
    const ss = spreadsheet();
    if (!ss) return null;
    return ss.sheets.find((s) => s.id === ss.activeSheetId) ?? ss.sheets[0] ?? null;
  };

  // Get selected cell data
  const selectedCellData = (): CellData | undefined => {
    const sheet = activeSheet();
    if (!sheet) return undefined;
    return sheet.cells[selectedCell()];
  };

  // Save spreadsheet to localStorage
  const save = (ss: Spreadsheet) => {
    setSpreadsheet({ ...ss });
    updateSpreadsheet(ss);
  };

  // Update cells in active sheet
  const updateCells = (cells: Record<string, CellData>) => {
    const ss = spreadsheet();
    if (!ss) return;
    const updated = {
      ...ss,
      sheets: ss.sheets.map((s) =>
        s.id === ss.activeSheetId ? { ...s, cells } : s,
      ),
    };
    save(updated);
  };

  // Handle cell selection
  const handleSelectCell = (address: string) => {
    setSelectedCell(address);
    if (!isEditing()) {
      const cell = activeSheet()?.cells[address];
      setEditValue(cell?.value ?? "");
    }
  };

  // Start editing a cell
  const handleStartEdit = (address: string, value?: string) => {
    setSelectedCell(address);
    setIsEditing(true);
    setEditValue(value ?? "");
  };

  // Submit cell edit
  const handleSubmitEdit = () => {
    const sheet = activeSheet();
    if (!sheet) return;

    const address = selectedCell();
    const value = editValue();
    const updatedCells = setCellValue(sheet, address, value);
    updateCells(updatedCells);
    setIsEditing(false);

    // Move down after submit
    try {
      const { col, row } = parseCellAddress(address);
      const newAddr = formatCellAddress(col, row + 1);
      setSelectedCell(newAddr);
      const newCell = sheet.cells[newAddr];
      setEditValue(newCell?.value ?? "");
    } catch {
      // stay in place
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    const cell = selectedCellData();
    setEditValue(cell?.value ?? "");
  };

  // Tab in editor
  const handleTabEdit = (shiftKey: boolean) => {
    const sheet = activeSheet();
    if (!sheet) return;

    // Submit current value first
    const address = selectedCell();
    const value = editValue();
    const updatedCells = setCellValue(sheet, address, value);
    updateCells(updatedCells);
    setIsEditing(false);

    // Move to next/prev cell
    try {
      const { col, row } = parseCellAddress(address);
      const newCol = shiftKey ? Math.max(0, col - 1) : col + 1;
      const newAddr = formatCellAddress(newCol, row);
      setSelectedCell(newAddr);
      const newCell = sheet.cells[newAddr];
      setEditValue(newCell?.value ?? "");
    } catch {
      // stay in place
    }
  };

  // Formula bar value change
  const handleFormulaBarChange = (value: string) => {
    setEditValue(value);
    if (!isEditing()) {
      setIsEditing(true);
    }
  };

  // Formula bar submit
  const handleFormulaBarSubmit = () => {
    handleSubmitEdit();
  };

  // Format change
  const handleFormatChange = (format: Partial<CellFormat>) => {
    const sheet = activeSheet();
    if (!sheet) return;

    const address = selectedCell();
    const cell = sheet.cells[address] ?? { value: "" };
    const updatedCells = {
      ...sheet.cells,
      [address]: {
        ...cell,
        format: { ...cell.format, ...format },
      },
    };
    updateCells(updatedCells);
  };

  // Title change
  const handleTitleChange = (title: string) => {
    const ss = spreadsheet();
    if (!ss) return;
    save({ ...ss, title });
  };

  // Sheet operations
  const handleSwitchSheet = (sheetId: string) => {
    const ss = spreadsheet();
    if (!ss) return;
    const updated = { ...ss, activeSheetId: sheetId };
    // Evaluate formulas for the new sheet
    const newSheet = updated.sheets.find((s) => s.id === sheetId);
    if (newSheet) {
      newSheet.cells = evaluateSheet(newSheet);
    }
    save(updated);
    setSelectedCell("A1");
    setEditValue("");
    setIsEditing(false);
  };

  const handleAddSheet = () => {
    const ss = spreadsheet();
    if (!ss) return;
    const newSheet = addSheet(ss.id);
    if (newSheet) {
      const reloaded = getSpreadsheet(ss.id);
      if (reloaded) {
        setSpreadsheet(reloaded);
        setSelectedCell("A1");
        setEditValue("");
      }
    }
  };

  const handleRenameSheet = (sheetId: string, newName: string) => {
    const ss = spreadsheet();
    if (!ss) return;
    renameSheet(ss.id, sheetId, newName);
    const reloaded = getSpreadsheet(ss.id);
    if (reloaded) setSpreadsheet(reloaded);
  };

  const handleDeleteSheet = (sheetId: string) => {
    const ss = spreadsheet();
    if (!ss) return;
    if (ss.sheets.length <= 1) return;
    if (confirm("Delete this sheet?")) {
      deleteSheet(ss.id, sheetId);
      const reloaded = getSpreadsheet(ss.id);
      if (reloaded) {
        setSpreadsheet(reloaded);
        setSelectedCell("A1");
        setEditValue("");
      }
    }
  };

  // Column width change
  const handleColWidthChange = (colIndex: number, width: number) => {
    const ss = spreadsheet();
    if (!ss) return;
    const updated = {
      ...ss,
      sheets: ss.sheets.map((s) =>
        s.id === ss.activeSheetId
          ? { ...s, colWidths: { ...s.colWidths, [colIndex]: width } }
          : s,
      ),
    };
    save(updated);
  };

  return (
    <div class="flex h-screen flex-col bg-neutral-900">
      <Show when={spreadsheet()} fallback={<div class="flex h-screen items-center justify-center text-neutral-500">Loading...</div>}>
        {(ss) => (
          <>
            {/* Toolbar */}
            <Toolbar
              format={selectedCellData()?.format}
              onFormatChange={handleFormatChange}
              title={ss().title}
              onTitleChange={handleTitleChange}
              onNavigateHome={() => navigate("/")}
            />

            {/* Formula Bar */}
            <FormulaBar
              cellAddress={selectedCell()}
              value={editValue()}
              onValueChange={handleFormulaBarChange}
              onSubmit={handleFormulaBarSubmit}
              onCancel={handleCancelEdit}
            />

            {/* Grid */}
            <Show when={activeSheet()}>
              {(sheet) => (
                <Grid
                  sheet={sheet()}
                  selectedCell={selectedCell()}
                  selectionRange={selectionRange()}
                  isEditing={isEditing()}
                  editValue={editValue()}
                  onSelectCell={handleSelectCell}
                  onStartEdit={handleStartEdit}
                  onEditChange={setEditValue}
                  onSubmitEdit={handleSubmitEdit}
                  onCancelEdit={handleCancelEdit}
                  onTabEdit={handleTabEdit}
                  onSelectionRange={setSelectionRange}
                  onColWidthChange={handleColWidthChange}
                />
              )}
            </Show>

            {/* Sheet Tabs */}
            <SheetTabs
              spreadsheet={ss()}
              activeSheetId={ss().activeSheetId}
              onSwitchSheet={handleSwitchSheet}
              onAddSheet={handleAddSheet}
              onRenameSheet={handleRenameSheet}
              onDeleteSheet={handleDeleteSheet}
            />
          </>
        )}
      </Show>
    </div>
  );
};
