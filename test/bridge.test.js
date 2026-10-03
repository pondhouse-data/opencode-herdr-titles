import assert from "node:assert/strict";
import { setImmediate as settle } from "node:timers/promises";
import test from "node:test";
import { selectedTitle, SOURCE, startBridge } from "../src/bridge.js";

function fixture(send) {
  let route = { type: "session", sessionID: "a" };
  let time = 1_000;
  let listener;
  let poll;
  let stopped = 0;
  const sessions = new Map([
    ["a", { title: "Fix authentication" }],
    ["b", { title: "Improve search" }],
    ["child", { title: "Subagent work", parentID: "a" }],
  ]);
  const reports = [];
  const context = {
    ui: { router: { current: () => route } },
    data: {
      session: {
        root: (id) => sessions.get(id)?.parentID ?? (sessions.has(id) ? id : undefined),
        get: (id) => sessions.get(id),
      },
      listen: (fn) => { listener = fn; return () => { listener = undefined; stopped += 1; }; },
    },
  };
  const deps = {
    env: { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1", HERDR_SOCKET_PATH: "unused" },
    now: () => time,
    send: async (params, guard) => {
      reports.push({ params, guard });
      return send ? send(params, guard) : true;
    },
    schedule: (fn, ms) => { assert.equal(ms, 250); poll = fn; return 42; },
    cancel: (id) => { assert.equal(id, 42); stopped += 1; },
  };
  return {
    context, deps, sessions, reports,
    route: (value) => { route = value; },
    time: (value) => { time = value; },
    poll: async () => { poll(); await settle(); },
    event: async () => { listener?.(); await settle(); },
    stopped: () => stopped,
  };
}

test("outside Herdr, the plugin is inert and never reads session state", () => {
  for (const env of [{}, { HERDR_ENV: "0" }, { HERDR_ENV: "1" }]) {
    assert.equal(startBridge({}, { env }), undefined);
  }
});

test("reports the native root title, not the OSC prefix, without lifecycle fields", async () => {
  const f = fixture();
  const stop = startBridge(f.context, f.deps);
  await settle();
  const params = f.reports[0].params;
  assert.equal(params.title, "Fix authentication");
  assert.equal(params.display_agent, params.title);
  assert.equal(params.source, SOURCE);
  assert.equal(params.agent, "opencode");
  assert.equal(params.ttl_ms, 15_000);
  assert.deepEqual(params.tokens, { title_line_1: "Fix authentication", title_line_2: null });
  assert.equal("state" in params, false);
  assert.equal("agent_session_id" in params, false);
  f.route({ type: "session", sessionID: "child" });
  await f.poll();
  assert.equal(f.reports.length, 1);
  stop();
});

test("follows rename, session switch, and late cache hydration", async () => {
  const f = fixture();
  const stop = startBridge(f.context, f.deps);
  await settle();
  f.sessions.get("a").title = "Authentication finished";
  await f.event();
  assert.equal(f.reports.at(-1).params.title, "Authentication finished");
  f.route({ type: "session", sessionID: "b" });
  await f.poll();
  assert.equal(f.reports.at(-1).params.title, "Improve search");
  f.route({ type: "session", sessionID: "new" });
  await f.poll();
  assert.equal(f.reports.at(-1).params.clear_title, true);
  f.sessions.set("new", { title: "New conversation" });
  await f.poll();
  assert.equal(f.reports.at(-1).params.title, "New conversation");
  stop();
});

test("leaving a session clears this source's labels", async () => {
  const f = fixture();
  const stop = startBridge(f.context, f.deps);
  await settle();
  f.route({ type: "home" });
  await f.poll();
  const params = f.reports.at(-1).params;
  assert.equal(params.clear_title, true);
  assert.equal(params.clear_display_agent, true);
  assert.equal("title" in params, false);
  assert.deepEqual(params.tokens, { title_line_1: "OpenCode", title_line_2: null });
  stop();
});

test("publishes configured title lines and clears an obsolete second line", async () => {
  const f = fixture();
  f.context.options = { titleLineWidth: 12 };
  const stop = startBridge(f.context, f.deps);
  await settle();
  assert.deepEqual(f.reports[0].params.tokens, {
    title_line_1: "Fix authenti", title_line_2: "cation",
  });
  f.sessions.get("a").title = "Fix auth";
  await f.event();
  assert.deepEqual(f.reports.at(-1).params.tokens, {
    title_line_1: "Fix auth", title_line_2: null,
  });
  stop();
});

test("retries errors and refreshes successful metadata before expiry", async () => {
  let attempts = 0;
  const f = fixture(() => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline");
    return attempts > 2;
  });
  const stop = startBridge(f.context, f.deps);
  await settle();
  await f.poll();
  await f.poll();
  assert.equal(f.reports.length, 3);
  await f.poll();
  assert.equal(f.reports.length, 3);
  f.time(6_000);
  await f.poll();
  assert.equal(f.reports.length, 4);
  const seqs = f.reports.map(({ params }) => params.seq);
  assert.ok(seqs.every((seq, i) => i === 0 || seq > seqs[i - 1]));
  stop();
});

test("rejects stale A -> B -> A reports and serializes in-flight writes", async () => {
  let finish;
  const f = fixture(() => new Promise((resolve) => { finish = resolve; }));
  const stop = startBridge(f.context, f.deps);
  await settle();
  const oldGuard = f.reports[0].guard;
  f.route({ type: "session", sessionID: "b" });
  assert.equal(oldGuard(), false); // Check directly, even before the next poll.
  await f.poll();
  f.route({ type: "session", sessionID: "a" });
  await f.poll();
  assert.equal(oldGuard(), false); // Generation prevents an A -> B -> A race.
  assert.equal(f.reports.length, 1);
  finish(false);
  await settle();
  await f.poll();
  assert.equal(f.reports.length, 2);
  stop();
  assert.equal(f.reports.at(-1).guard(), false);
  finish(false);
  await settle();
});

test("cleanup unsubscribes and cancels polls without racing a replacement", async () => {
  const f = fixture();
  const stop = startBridge(f.context, f.deps);
  await settle();
  stop();
  await f.poll();
  await f.event();
  assert.equal(f.reports.length, 1);
  assert.equal(f.stopped(), 2);
});

test("sanitizes controls, preserves native text, and limits Unicode code points", () => {
  const f = fixture();
  f.sessions.get("a").title = "  OC | a real session name\nwith\tspacing\x07  ";
  assert.equal(selectedTitle(f.context).title, "OC | a real session name with spacing");
  f.sessions.get("a").title = "🦆".repeat(90);
  assert.equal([...selectedTitle(f.context).title].length, 80);
  f.sessions.get("a").title = " \n ";
  assert.equal(selectedTitle(f.context).title, undefined);
});
