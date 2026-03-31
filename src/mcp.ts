import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as store from "./spreadsheet-store.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function json(v: unknown) {
  return text(JSON.stringify(v, null, 2));
}

export function createMcpServer(): McpServer {
  const mcp = new McpServer({
    name: "takos-excel",
    version: "0.1.0",
  });

  // -----------------------------------------------------------------------
  // Spreadsheet Management
  // -----------------------------------------------------------------------

  mcp.tool(
    "sheet_list",
    "List all spreadsheets",
    {},
    async (_args: Any) => {
      return json(store.listSpreadsheets());
    },
  );

  mcp.tool(
    "sheet_create",
    "Create a new spreadsheet",
    { title: z.string().describe("Spreadsheet title") },
    async (args: Any) => {
      const id = store.createSpreadsheet(args.title);
      return json({ id });
    },
  );

  mcp.tool(
    "sheet_get",
    "Get spreadsheet info (metadata + sheet names)",
    { id: z.string().describe("Spreadsheet ID") },
    async (args: Any) => {
      const ss = store.getSpreadsheet(args.id);
      return json({
        id: ss.id,
        title: ss.title,
        createdAt: ss.createdAt,
        updatedAt: ss.updatedAt,
        sheets: ss.sheets.map((s) => ({ id: s.id, name: s.name })),
      });
    },
  );

  mcp.tool(
    "sheet_delete",
    "Delete a spreadsheet",
    { id: z.string().describe("Spreadsheet ID") },
    async (args: Any) => {
      store.deleteSpreadsheet(args.id);
      return text("Deleted");
    },
  );

  mcp.tool(
    "sheet_set_title",
    "Rename a spreadsheet",
    {
      id: z.string().describe("Spreadsheet ID"),
      title: z.string().describe("New title"),
    },
    async (args: Any) => {
      store.setSpreadsheetTitle(args.id, args.title);
      return text("OK");
    },
  );

  // -----------------------------------------------------------------------
  // Sheet Tab Operations
  // -----------------------------------------------------------------------

  mcp.tool(
    "sheet_add_tab",
    "Add a new sheet tab",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      name: z.string().optional().describe("Tab name (auto-generated if omitted)"),
    },
    async (args: Any) => {
      const sheetId = store.addTab(args.spreadsheetId, args.name);
      return json({ sheetId });
    },
  );

  mcp.tool(
    "sheet_remove_tab",
    "Remove a sheet tab",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
    },
    async (args: Any) => {
      store.removeTab(args.spreadsheetId, args.sheetId);
      return text("Removed");
    },
  );

  mcp.tool(
    "sheet_rename_tab",
    "Rename a sheet tab",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      name: z.string().describe("New tab name"),
    },
    async (args: Any) => {
      store.renameTab(args.spreadsheetId, args.sheetId, args.name);
      return text("OK");
    },
  );

  // -----------------------------------------------------------------------
  // Cell Operations
  // -----------------------------------------------------------------------

  mcp.tool(
    "sheet_get_cell",
    "Get a cell's value, computed result, and format",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      cell: z.string().describe('Cell address, e.g. "A1"'),
    },
    async (args: Any) => {
      return json(store.getCell(args.spreadsheetId, args.sheetId, args.cell));
    },
  );

  mcp.tool(
    "sheet_set_cell",
    "Set a cell's value or formula",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      cell: z.string().describe('Cell address, e.g. "A1"'),
      value: z.string().describe('Cell value or formula, e.g. "42" or "=SUM(A1:A10)"'),
    },
    async (args: Any) => {
      store.setCell(args.spreadsheetId, args.sheetId, args.cell, args.value);
      return text("OK");
    },
  );

  mcp.tool(
    "sheet_get_range",
    "Get a range of cell values as a 2D array",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      range: z.string().describe('Range, e.g. "A1:C10"'),
    },
    async (args: Any) => {
      return json(store.getRange(args.spreadsheetId, args.sheetId, args.range));
    },
  );

  mcp.tool(
    "sheet_set_range",
    "Set a range of values from a 2D array",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      startCell: z.string().describe('Top-left cell, e.g. "A1"'),
      values: z
        .array(z.array(z.string()))
        .describe("2D array of string values"),
    },
    async (args: Any) => {
      store.setRange(
        args.spreadsheetId,
        args.sheetId,
        args.startCell,
        args.values,
      );
      return text("OK");
    },
  );

  mcp.tool(
    "sheet_clear_range",
    "Clear all cells in a range",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      range: z.string().describe('Range, e.g. "A1:C10"'),
    },
    async (args: Any) => {
      store.clearRange(args.spreadsheetId, args.sheetId, args.range);
      return text("Cleared");
    },
  );

  const formatSchema = {
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    textColor: z.string().optional().describe("CSS color string"),
    bgColor: z.string().optional().describe("CSS background color string"),
    fontSize: z.number().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    numberFormat: z
      .string()
      .optional()
      .describe('Number format, e.g. "#,##0.00", "0%", "yyyy-mm-dd"'),
  };

  mcp.tool(
    "sheet_format_cell",
    "Apply formatting to a cell",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      cell: z.string().describe('Cell address, e.g. "A1"'),
      format: z.object(formatSchema).describe("Format options"),
    },
    async (args: Any) => {
      store.formatCell(
        args.spreadsheetId,
        args.sheetId,
        args.cell,
        args.format,
      );
      return text("OK");
    },
  );

  mcp.tool(
    "sheet_format_range",
    "Apply formatting to a range of cells",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      range: z.string().describe('Range, e.g. "A1:C10"'),
      format: z.object(formatSchema).describe("Format options"),
    },
    async (args: Any) => {
      store.formatRange(
        args.spreadsheetId,
        args.sheetId,
        args.range,
        args.format,
      );
      return text("OK");
    },
  );

  // -----------------------------------------------------------------------
  // Formula & Computation
  // -----------------------------------------------------------------------

  mcp.tool(
    "sheet_evaluate",
    "Evaluate a formula without storing it in any cell",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      formula: z.string().describe('Formula, e.g. "=SUM(A1:A10)"'),
    },
    async (args: Any) => {
      const result = store.evaluate(
        args.spreadsheetId,
        args.sheetId,
        args.formula,
      );
      return text(result);
    },
  );

  mcp.tool(
    "sheet_get_computed",
    "Get computed/evaluated values for a range",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      range: z.string().describe('Range, e.g. "A1:C10"'),
    },
    async (args: Any) => {
      return json(
        store.getComputed(args.spreadsheetId, args.sheetId, args.range),
      );
    },
  );

  // -----------------------------------------------------------------------
  // Column / Row Operations
  // -----------------------------------------------------------------------

  mcp.tool(
    "sheet_set_column_width",
    "Set the width of a column",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      column: z.string().describe('Column letter, e.g. "A"'),
      width: z.number().describe("Width in pixels"),
    },
    async (args: Any) => {
      store.setColumnWidth(
        args.spreadsheetId,
        args.sheetId,
        args.column,
        args.width,
      );
      return text("OK");
    },
  );

  mcp.tool(
    "sheet_set_row_height",
    "Set the height of a row",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
      row: z.number().describe("Row number (1-based)"),
      height: z.number().describe("Height in pixels"),
    },
    async (args: Any) => {
      store.setRowHeight(
        args.spreadsheetId,
        args.sheetId,
        args.row,
        args.height,
      );
      return text("OK");
    },
  );

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  mcp.tool(
    "sheet_export_csv",
    "Export a sheet tab as CSV",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
      sheetId: z.string().describe("Sheet tab ID"),
    },
    async (args: Any) => {
      return text(store.exportCsv(args.spreadsheetId, args.sheetId));
    },
  );

  mcp.tool(
    "sheet_export_json",
    "Export the entire spreadsheet as JSON",
    {
      spreadsheetId: z.string().describe("Spreadsheet ID"),
    },
    async (args: Any) => {
      return text(store.exportJson(args.spreadsheetId));
    },
  );

  return mcp;
}
