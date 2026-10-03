import assert from "node:assert/strict";
import test from "node:test";
import stringWidth from "string-width";
import { configuredLineWidth, titleLines } from "../src/title-lines.js";

test("uses a single line for short titles and a fallback for absent titles", () => {
  assert.deepEqual(titleLines("Fix auth", 12), ["Fix auth", undefined]);
  assert.deepEqual(titleLines(undefined), ["OpenCode", undefined]);
});

test("wraps at a word boundary without repeating or dropping title text", () => {
  const title = "Using OpenCode session titles for Herdr agent panes";
  const lines = titleLines(title, 30);
  assert.deepEqual(lines, ["Using OpenCode session titles", "for Herdr agent panes"]);
  assert.equal(lines.join(" "), title);
});

test("bounds both rows and ellipsizes overflow on the second row", () => {
  const title = "A very long conversation about implementing automatic title updates across panes";
  const lines = titleLines(title, 20);
  assert.ok(lines.every((line) => stringWidth(line) <= 20));
  assert.ok(lines[1].endsWith("…"));
});

test("splits long identifiers without exceeding the width", () => {
  assert.deepEqual(titleLines("abcdefghijklmnopqrstuvwx", 12), ["abcdefghijkl", "mnopqrstuvwx"]);
});

test("handles wide characters, combined accents, and emoji without broken graphemes", () => {
  for (const title of ["标题".repeat(15), "👩‍💻".repeat(15), "e\u0301".repeat(35)]) {
    const lines = titleLines(title, 12);
    assert.ok(lines.every((line) => stringWidth(line) <= 12));
    assert.ok(!lines[0].endsWith("\u200d"));
    assert.ok(!lines[1].startsWith("\u0301"));
  }
});

test("validates configurable line width", () => {
  assert.equal(configuredLineWidth(), 30);
  assert.equal(configuredLineWidth({ titleLineWidth: 24 }), 24);
  for (const titleLineWidth of [0, 7, 81, 12.5, "30", null]) {
    if (titleLineWidth === null) continue; // Null follows the default.
    assert.throws(() => configuredLineWidth({ titleLineWidth }), /titleLineWidth/);
  }
});
