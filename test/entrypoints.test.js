import assert from "node:assert/strict";
import test from "node:test";
import server from "../src/index.js";
import tui from "../src/tui.js";

test("server entrypoint loads without an SDK installation and is inert", () => {
  assert.equal(server.id, "pondhouse.herdr-titles");
  assert.equal(server.setup({}), undefined);
});

test("TUI entrypoint exports the V2 setup lifecycle", () => {
  assert.equal(tui.id, "pondhouse.herdr-titles.tui");
  assert.equal(typeof tui.setup, "function");
  assert.equal("server" in tui, false);
});
