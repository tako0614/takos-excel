# takos-excel

A browser-based spreadsheet editor with an MCP (Model Context Protocol) server
backend. Part of the Takos application suite.

The checked-in `.takos/app.yml` deploys the browser UI and publishes the MCP
server at `/mcp` on the same Takos worker. The standalone/self-host runtime can
still be started with `deno task mcp`.

## Tech Stack

- **Frontend**: Solid.js, Tailwind CSS, virtual-scrolling grid
- **Backend**: Hono HTTP server with MCP protocol (Streamable HTTP transport)
- **Formula Engine**: HyperFormula (GPLv3) - supports 400+ Excel-compatible
  functions
- **State**: Solid signals (client-side), `SpreadsheetStore` class backed by
  Takos Storage API (server-side)
- **Runtime**: Deno

## Getting Started

```bash
deno install --allow-scripts=npm:canvas

# Start the dev server (frontend, port 3003)
deno task dev

# Start the MCP server (backend)
deno task mcp

# Build for production
deno task build
```

Screenshot/export features use `npm:canvas`. On a fresh machine you may also
need the native `canvas` prerequisites for your OS.

`deno task build` produces the static browser bundle and generates
`dist/worker.js` for the Takos deploy path. The worker serves both the SPA and
the `/mcp` endpoint.

The managed worker bundle avoids loading native `npm:canvas` at startup.
`sheet_screenshot` remains available only in runtimes where the server-side
canvas renderer can be loaded.

The MCP server requires the following environment variables:

| Variable                 | Description                                      | Default                 |
| ------------------------ | ------------------------------------------------ | ----------------------- |
| `TAKOS_API_URL`          | Takos platform API URL                           | `http://localhost:8787` |
| `TAKOS_ACCESS_TOKEN`     | Access token for the storage API                 | (empty)                 |
| `TAKOS_SPACE_ID`         | Space identifier                                 | (required)              |
| `MCP_AUTH_TOKEN`         | Bearer token for `/mcp`                          | managed auto-secret     |
| `MCP_AUTH_REQUIRED`      | Set `1` to fail closed when the token is missing | `0`                     |
| `TAKOS_NATIVE_RENDERING` | Set `1` to enable native canvas screenshot tools | runtime-dependent       |

In managed Takos deploys, `.takos/app.yml` publishes `excel-mcp` with
`spec.authSecretRef: MCP_AUTH_TOKEN` and sets `MCP_AUTH_REQUIRED=1`. Takos
generates the `MCP_AUTH_TOKEN` service secret env when it is missing, and MCP
clients resolve that token from the owner service.

## Available MCP Tools

### Spreadsheet Management

- `sheet_list` - List all spreadsheets
- `sheet_create` - Create a new spreadsheet
- `sheet_get` - Get spreadsheet metadata and sheet names
- `sheet_delete` - Delete a spreadsheet
- `sheet_set_title` - Rename a spreadsheet

### Sheet Tab Operations

- `sheet_add_tab` - Add a new sheet tab
- `sheet_remove_tab` - Remove a sheet tab
- `sheet_rename_tab` - Rename a sheet tab

### Cell Operations

- `sheet_get_cell` - Get a cell's value, computed result, and format
- `sheet_set_cell` - Set a cell's value or formula
- `sheet_get_range` - Get a range of cell values as a 2D array
- `sheet_set_range` - Set a range of values from a 2D array
- `sheet_clear_range` - Clear all cells in a range
- `sheet_format_cell` - Apply formatting to a cell
- `sheet_format_range` - Apply formatting to a range

### Formula & Computation

- `sheet_evaluate` - Evaluate a formula without storing it
- `sheet_get_computed` - Get computed/evaluated values for a range

### Column / Row Operations

- `sheet_set_column_width` - Set the width of a column
- `sheet_set_row_height` - Set the height of a row

### Import / Export

- `sheet_import_csv` - Import CSV content into a sheet
- `sheet_export_csv` - Export a sheet as CSV
- `sheet_export_json` - Export a spreadsheet as JSON

### Conditional Formatting

- `sheet_add_conditional_rule` - Add a conditional formatting rule
- `sheet_remove_conditional_rule` - Remove a conditional formatting rule
- `sheet_list_conditional_rules` - List rules for a sheet

### Visualization

- `sheet_screenshot` - Render a sheet as a PNG image

## Architecture Overview

```
src/
  server.ts              # Hono HTTP entry point, MCP transport
  mcp.ts                 # MCP tool definitions (26 tools)
  spreadsheet-store.ts   # Server-side store backed by Takos Storage API
  types/index.ts         # Shared type definitions
  lib/
    cell-utils.ts        # Cell address utilities (A1 notation)
    formula.ts           # HyperFormula integration
    csv-parser.ts        # RFC-compliant CSV parser
    history.ts           # Generic undo/redo manager
    conditional-format.ts# Conditional formatting evaluator
    grid-renderer.ts     # Server-side PNG renderer (canvas)
    storage.ts           # Client-side localStorage wrapper
    takos-storage.ts     # Takos platform storage API client
  components/
    Grid.tsx             # Virtual-scrolling spreadsheet grid
    Toolbar.tsx          # Formatting toolbar with undo/redo and CSV import
    FormulaBar.tsx       # Formula input bar
    SheetTabs.tsx        # Sheet tab switcher
    CellEditor.tsx       # In-cell editor overlay
  pages/
    EditorPage.tsx       # Spreadsheet editor page
```

## Formula Engine

Powered by [HyperFormula](https://hyperformula.handsontable.com/), the engine
supports:

- Arithmetic and string operations
- 400+ bundled formula functions (SUM, AVERAGE, VLOOKUP, IF, etc.)
- Cross-cell references (e.g., `=A1+B2`)
- Range references (e.g., `=SUM(A1:A10)`)
- Automatic dependency tracking and re-evaluation

Formulas are entered with a leading `=` sign (e.g., `=SUM(A1:A10)`).

## Data Model

- **Spreadsheet**: Top-level container with an ID, title, timestamps, and one or
  more sheets
- **Sheet**: Named tab containing a cell map, column widths, row heights, and
  optional conditional formatting rules
- **CellData**: Raw input value, optional computed value, and optional format
- **CellFormat**: Styling properties (bold, italic, underline, text/bg color,
  font size, alignment, number format)
- **ConditionalRule**: Range-scoped rule with a condition (greaterThan,
  lessThan, equal, between, textContains, isEmpty, etc.) and a format to apply
  when matched

Server-side data is persisted as JSON files via the Takos Storage API under a
`takos-excel/` folder. Client-side data uses `localStorage` as a fallback.
