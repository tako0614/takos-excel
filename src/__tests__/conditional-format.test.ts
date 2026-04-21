import { assertEquals } from "std/assert";
import { evaluateConditionalRules } from "../lib/conditional-format.ts";
import type { CellData, ConditionalRule } from "../types/index.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(
  overrides: Partial<ConditionalRule> & {
    condition: ConditionalRule["condition"];
  },
): ConditionalRule {
  return {
    id: overrides.id ?? "rule-1",
    range: overrides.range ?? "A1:A1",
    condition: overrides.condition,
    format: overrides.format ?? { bold: true },
  };
}

function makeCells(
  entries: Record<string, string>,
): Record<string, CellData> {
  const cells: Record<string, CellData> = {};
  for (const [addr, value] of Object.entries(entries)) {
    cells[addr] = { value };
  }
  return cells;
}

// ---------------------------------------------------------------------------
// greaterThan
// ---------------------------------------------------------------------------

Deno.test("matchesCondition greaterThan - matches", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "greaterThan", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "10" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition greaterThan - does not match", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "greaterThan", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "3" }));
  assertEquals(result["A1"], undefined);
});

Deno.test("matchesCondition greaterThan - non-numeric value", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "greaterThan", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "abc" }));
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// lessThan
// ---------------------------------------------------------------------------

Deno.test("matchesCondition lessThan - matches", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "lessThan", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "2" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition lessThan - does not match", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "lessThan", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "10" }));
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// equal
// ---------------------------------------------------------------------------

Deno.test("matchesCondition equal - numeric match", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "equal", values: ["42"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "42" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition equal - string match", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "equal", values: ["hello"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "hello" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition equal - no match", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "equal", values: ["42"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "99" }));
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// notEqual
// ---------------------------------------------------------------------------

Deno.test("matchesCondition notEqual - matches", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "notEqual", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "10" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition notEqual - does not match (equal)", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "notEqual", values: ["5"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "5" }));
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// between
// ---------------------------------------------------------------------------

Deno.test("matchesCondition between - inside range", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "between", values: ["1", "10"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "5" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition between - on boundary", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "between", values: ["1", "10"] },
    }),
  ];
  const lo = evaluateConditionalRules(rules, makeCells({ A1: "1" }));
  assertEquals(lo["A1"], { bold: true });
  const hi = evaluateConditionalRules(rules, makeCells({ A1: "10" }));
  assertEquals(hi["A1"], { bold: true });
});

Deno.test("matchesCondition between - outside range", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "between", values: ["1", "10"] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "15" }));
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// textContains
// ---------------------------------------------------------------------------

Deno.test("matchesCondition textContains - matches", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "textContains", values: ["ello"] },
    }),
  ];
  const result = evaluateConditionalRules(
    rules,
    makeCells({ A1: "Hello world" }),
  );
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition textContains - case insensitive", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "textContains", values: ["HELLO"] },
    }),
  ];
  const result = evaluateConditionalRules(
    rules,
    makeCells({ A1: "hello world" }),
  );
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition textContains - no match", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "textContains", values: ["xyz"] },
    }),
  ];
  const result = evaluateConditionalRules(
    rules,
    makeCells({ A1: "Hello world" }),
  );
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// isEmpty / isNotEmpty
// ---------------------------------------------------------------------------

Deno.test("matchesCondition isEmpty - empty cell", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "isEmpty", values: [] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition isEmpty - non-empty cell", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "isEmpty", values: [] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "x" }));
  assertEquals(result["A1"], undefined);
});

Deno.test("matchesCondition isEmpty - missing cell treated as empty", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "isEmpty", values: [] },
    }),
  ];
  // A1 not in cells at all
  const result = evaluateConditionalRules(rules, {});
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition isNotEmpty - non-empty cell", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "isNotEmpty", values: [] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "x" }));
  assertEquals(result["A1"], { bold: true });
});

Deno.test("matchesCondition isNotEmpty - empty cell", () => {
  const rules = [
    makeRule({
      range: "A1:A1",
      condition: { type: "isNotEmpty", values: [] },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "" }));
  assertEquals(result["A1"], undefined);
});

// ---------------------------------------------------------------------------
// evaluateConditionalRules - multi-cell range
// ---------------------------------------------------------------------------

Deno.test("evaluateConditionalRules applies to all cells in range", () => {
  const rules = [
    makeRule({
      range: "A1:C1",
      condition: { type: "greaterThan", values: ["0"] },
      format: { bgColor: "red" },
    }),
  ];
  const cells = makeCells({ A1: "1", B1: "2", C1: "0" });
  const result = evaluateConditionalRules(rules, cells);
  assertEquals(result["A1"], { bgColor: "red" });
  assertEquals(result["B1"], { bgColor: "red" });
  assertEquals(result["C1"], undefined); // 0 is not > 0
});

// ---------------------------------------------------------------------------
// evaluateConditionalRules - multiple rules
// ---------------------------------------------------------------------------

Deno.test("evaluateConditionalRules merges formats from multiple rules", () => {
  const rules = [
    makeRule({
      id: "r1",
      range: "A1:A1",
      condition: { type: "greaterThan", values: ["0"] },
      format: { bold: true },
    }),
    makeRule({
      id: "r2",
      range: "A1:A1",
      condition: { type: "lessThan", values: ["100"] },
      format: { italic: true },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "50" }));
  assertEquals(result["A1"], { bold: true, italic: true });
});

Deno.test("evaluateConditionalRules later rule overrides earlier for same property", () => {
  const rules = [
    makeRule({
      id: "r1",
      range: "A1:A1",
      condition: { type: "greaterThan", values: ["0"] },
      format: { bgColor: "red" },
    }),
    makeRule({
      id: "r2",
      range: "A1:A1",
      condition: { type: "greaterThan", values: ["0"] },
      format: { bgColor: "blue" },
    }),
  ];
  const result = evaluateConditionalRules(rules, makeCells({ A1: "50" }));
  assertEquals(result["A1"]?.bgColor, "blue");
});

// ---------------------------------------------------------------------------
// evaluateConditionalRules - no matches
// ---------------------------------------------------------------------------

Deno.test("evaluateConditionalRules returns empty when no cells match", () => {
  const rules = [
    makeRule({
      range: "A1:B2",
      condition: { type: "greaterThan", values: ["999"] },
    }),
  ];
  const cells = makeCells({ A1: "1", B1: "2", A2: "3", B2: "4" });
  const result = evaluateConditionalRules(rules, cells);
  assertEquals(result, {});
});

// ---------------------------------------------------------------------------
// evaluateConditionalRules - malformed range is skipped
// ---------------------------------------------------------------------------

Deno.test("evaluateConditionalRules skips rule with malformed range", () => {
  const rules = [
    makeRule({
      range: "INVALID",
      condition: { type: "isEmpty", values: [] },
    }),
  ];
  const result = evaluateConditionalRules(rules, {});
  assertEquals(result, {});
});
