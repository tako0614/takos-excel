import { assertEquals } from "std/assert";
import { UndoRedoManager } from "../lib/history.ts";

Deno.test("new manager has nothing to undo or redo", () => {
  const mgr = new UndoRedoManager<string>();
  assertEquals(mgr.canUndo(), false);
  assertEquals(mgr.canRedo(), false);
});

Deno.test("undo returns null on empty manager", () => {
  const mgr = new UndoRedoManager<string>();
  assertEquals(mgr.undo(), null);
});

Deno.test("redo returns null on empty manager", () => {
  const mgr = new UndoRedoManager<string>();
  assertEquals(mgr.redo(), null);
});

Deno.test("push then undo retrieves previous state", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("state-0");
  mgr.push("state-1");
  assertEquals(mgr.canUndo(), true);
  const undone = mgr.undo();
  assertEquals(undone, "state-0");
});

Deno.test("undo then redo retrieves next state", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("A");
  mgr.push("B");
  mgr.undo();
  assertEquals(mgr.canRedo(), true);
  const redone = mgr.redo();
  assertEquals(redone, "B");
});

Deno.test("pushing after undo clears redo history", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("A");
  mgr.push("B");
  mgr.push("C");
  mgr.undo(); // back to B
  mgr.push("D"); // should discard C from redo
  assertEquals(mgr.canRedo(), false);
  assertEquals(mgr.redo(), null);
});

Deno.test("canUndo is false after single push", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("only");
  // pointer is at 0 so canUndo returns false
  assertEquals(mgr.canUndo(), false);
});

Deno.test("undo at start returns null", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("A");
  mgr.push("B");
  mgr.undo(); // -> A
  assertEquals(mgr.undo(), null); // nothing before A
});

Deno.test("redo at end returns null", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("A");
  mgr.push("B");
  assertEquals(mgr.redo(), null); // already at latest
});

Deno.test("max size trims oldest entries", () => {
  const mgr = new UndoRedoManager<number>(5);
  for (let i = 0; i < 10; i++) {
    mgr.push(i);
  }
  // Stack should contain only 5 entries: [5,6,7,8,9]
  // Walk back through undo
  const collected: number[] = [];
  let val = mgr.undo();
  while (val !== null) {
    collected.push(val);
    val = mgr.undo();
  }
  // We can undo 4 times (back from pointer 4 to pointer 0)
  assertEquals(collected.length, 4);
  assertEquals(collected, [8, 7, 6, 5]);
});

Deno.test("multiple undo/redo cycles work correctly", () => {
  const mgr = new UndoRedoManager<string>();
  mgr.push("A");
  mgr.push("B");
  mgr.push("C");

  assertEquals(mgr.undo(), "B");
  assertEquals(mgr.undo(), "A");
  assertEquals(mgr.redo(), "B");
  assertEquals(mgr.redo(), "C");
  assertEquals(mgr.redo(), null);
});

Deno.test("default max size is 50", () => {
  const mgr = new UndoRedoManager<number>();
  for (let i = 0; i < 60; i++) {
    mgr.push(i);
  }
  // Should be able to undo 49 times (50 entries, pointer at 49)
  let undoCount = 0;
  while (mgr.canUndo()) {
    mgr.undo();
    undoCount++;
  }
  assertEquals(undoCount, 49);
});
