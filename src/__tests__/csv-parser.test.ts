import { assertEquals } from "std/assert";
import { parseCsv } from "../lib/csv-parser.ts";

Deno.test("parseCsv parses simple CSV", () => {
  const result = parseCsv("a,b,c\n1,2,3");
  assertEquals(result, [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

Deno.test("parseCsv handles quoted fields", () => {
  const result = parseCsv('"hello","world"');
  assertEquals(result, [["hello", "world"]]);
});

Deno.test("parseCsv handles escaped quotes inside quoted fields", () => {
  const result = parseCsv('"he said ""hi""","ok"');
  assertEquals(result, [['he said "hi"', "ok"]]);
});

Deno.test("parseCsv handles CRLF line endings", () => {
  const result = parseCsv("a,b\r\nc,d\r\n");
  assertEquals(result, [
    ["a", "b"],
    ["c", "d"],
  ]);
});

Deno.test("parseCsv handles LF line endings", () => {
  const result = parseCsv("a,b\nc,d\n");
  assertEquals(result, [
    ["a", "b"],
    ["c", "d"],
  ]);
});

Deno.test("parseCsv handles empty fields", () => {
  const result = parseCsv(",b,\n,,");
  assertEquals(result, [
    ["", "b", ""],
    ["", "", ""],
  ]);
});

Deno.test("parseCsv handles single column", () => {
  const result = parseCsv("a\nb\nc");
  assertEquals(result, [["a"], ["b"], ["c"]]);
});

Deno.test("parseCsv handles single row", () => {
  const result = parseCsv("a,b,c");
  assertEquals(result, [["a", "b", "c"]]);
});

Deno.test("parseCsv returns empty array for empty input", () => {
  const result = parseCsv("");
  assertEquals(result, []);
});

Deno.test("parseCsv handles commas inside quoted fields", () => {
  const result = parseCsv('"a,b",c');
  assertEquals(result, [["a,b", "c"]]);
});

Deno.test("parseCsv handles newlines inside quoted fields", () => {
  const result = parseCsv('"line1\nline2",b');
  assertEquals(result, [["line1\nline2", "b"]]);
});

Deno.test("parseCsv handles mixed quoted and unquoted fields", () => {
  const result = parseCsv('plain,"quoted",plain2');
  assertEquals(result, [["plain", "quoted", "plain2"]]);
});

Deno.test("parseCsv handles bare CR line endings", () => {
  const result = parseCsv("a,b\rc,d");
  assertEquals(result, [
    ["a", "b"],
    ["c", "d"],
  ]);
});
