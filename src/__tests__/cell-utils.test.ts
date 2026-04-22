import { assertEquals, assertThrows } from "std/assert";
import {
  columnToLetter,
  formatCellAddress,
  getCellRange,
  letterToColumn,
  parseCellAddress,
  parseCellRange,
} from "../lib/cell-utils.ts";

// ---------------------------------------------------------------------------
// columnToLetter
// ---------------------------------------------------------------------------

Deno.test("columnToLetter converts 0 to A", () => {
  assertEquals(columnToLetter(0), "A");
});

Deno.test("columnToLetter converts 1 to B", () => {
  assertEquals(columnToLetter(1), "B");
});

Deno.test("columnToLetter converts 25 to Z", () => {
  assertEquals(columnToLetter(25), "Z");
});

Deno.test("columnToLetter converts 26 to AA", () => {
  assertEquals(columnToLetter(26), "AA");
});

Deno.test("columnToLetter converts 27 to AB", () => {
  assertEquals(columnToLetter(27), "AB");
});

Deno.test("columnToLetter converts 701 to ZZ", () => {
  assertEquals(columnToLetter(701), "ZZ");
});

Deno.test("columnToLetter converts 702 to AAA", () => {
  assertEquals(columnToLetter(702), "AAA");
});

// ---------------------------------------------------------------------------
// letterToColumn
// ---------------------------------------------------------------------------

Deno.test("letterToColumn converts A to 0", () => {
  assertEquals(letterToColumn("A"), 0);
});

Deno.test("letterToColumn converts B to 1", () => {
  assertEquals(letterToColumn("B"), 1);
});

Deno.test("letterToColumn converts Z to 25", () => {
  assertEquals(letterToColumn("Z"), 25);
});

Deno.test("letterToColumn converts AA to 26", () => {
  assertEquals(letterToColumn("AA"), 26);
});

Deno.test("letterToColumn converts AB to 27", () => {
  assertEquals(letterToColumn("AB"), 27);
});

Deno.test("letterToColumn converts ZZ to 701", () => {
  assertEquals(letterToColumn("ZZ"), 701);
});

Deno.test("letterToColumn converts AAA to 702", () => {
  assertEquals(letterToColumn("AAA"), 702);
});

Deno.test("letterToColumn throws for malformed letters", () => {
  assertThrows(() => letterToColumn(""));
  assertThrows(() => letterToColumn("a"));
  assertThrows(() => letterToColumn("A1"));
});

// ---------------------------------------------------------------------------
// columnToLetter / letterToColumn round-trip
// ---------------------------------------------------------------------------

Deno.test("columnToLetter and letterToColumn are inverses", () => {
  for (const n of [0, 1, 13, 25, 26, 51, 100, 701, 702]) {
    assertEquals(letterToColumn(columnToLetter(n)), n);
  }
});

// ---------------------------------------------------------------------------
// parseCellAddress
// ---------------------------------------------------------------------------

Deno.test("parseCellAddress parses A1 correctly", () => {
  assertEquals(parseCellAddress("A1"), { col: 0, row: 0 });
});

Deno.test("parseCellAddress parses Z100 correctly", () => {
  assertEquals(parseCellAddress("Z100"), { col: 25, row: 99 });
});

Deno.test("parseCellAddress parses AA1 correctly", () => {
  assertEquals(parseCellAddress("AA1"), { col: 26, row: 0 });
});

Deno.test("parseCellAddress throws for invalid input", () => {
  assertThrows(() => parseCellAddress("123"));
  assertThrows(() => parseCellAddress(""));
  assertThrows(() => parseCellAddress("a1")); // lowercase
  assertThrows(() => parseCellAddress("A0"));
  assertThrows(() => parseCellAddress("A01"));
  assertThrows(() => parseCellAddress("CW1")); // column 101, beyond app grid
  assertThrows(() => parseCellAddress("A1001")); // beyond app grid
});

// ---------------------------------------------------------------------------
// formatCellAddress
// ---------------------------------------------------------------------------

Deno.test("formatCellAddress formats col=0, row=0 as A1", () => {
  assertEquals(formatCellAddress(0, 0), "A1");
});

Deno.test("formatCellAddress formats col=25, row=99 as Z100", () => {
  assertEquals(formatCellAddress(25, 99), "Z100");
});

Deno.test("formatCellAddress formats col=26, row=0 as AA1", () => {
  assertEquals(formatCellAddress(26, 0), "AA1");
});

Deno.test("parseCellAddress and formatCellAddress are inverses", () => {
  for (const addr of ["A1", "B2", "Z26", "AA1", "AB100"]) {
    const parsed = parseCellAddress(addr);
    assertEquals(formatCellAddress(parsed.col, parsed.row), addr);
  }
});

Deno.test("formatCellAddress throws for invalid or out-of-bounds coordinates", () => {
  assertThrows(() => formatCellAddress(-1, 0));
  assertThrows(() => formatCellAddress(0, -1));
  assertThrows(() => formatCellAddress(100, 0));
  assertThrows(() => formatCellAddress(0, 1000));
});

Deno.test("parseCellRange normalises valid ranges and rejects oversized ranges", () => {
  assertEquals(parseCellRange("C3:A1"), {
    startCol: 0,
    startRow: 0,
    endCol: 2,
    endRow: 2,
    cellCount: 9,
  });
  assertThrows(() => parseCellRange("A1:CV1000"));
});

// ---------------------------------------------------------------------------
// getCellRange
// ---------------------------------------------------------------------------

Deno.test("getCellRange returns single cell when start equals end", () => {
  const range = getCellRange(0, 0, 0, 0);
  assertEquals(range, ["A1"]);
});

Deno.test("getCellRange returns a row", () => {
  const range = getCellRange(0, 0, 2, 0);
  assertEquals(range, ["A1", "B1", "C1"]);
});

Deno.test("getCellRange returns a column", () => {
  const range = getCellRange(0, 0, 0, 2);
  assertEquals(range, ["A1", "A2", "A3"]);
});

Deno.test("getCellRange returns rectangular range row-major", () => {
  const range = getCellRange(0, 0, 1, 1);
  assertEquals(range, ["A1", "B1", "A2", "B2"]);
});

Deno.test("getCellRange normalises reversed corners", () => {
  const range = getCellRange(1, 1, 0, 0);
  assertEquals(range, ["A1", "B1", "A2", "B2"]);
});
