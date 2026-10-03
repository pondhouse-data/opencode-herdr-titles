import assert from "node:assert/strict";
import net from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reportMetadata } from "../src/socket.js";

async function socketServer(t, handler) {
  const directory = await mkdtemp(join(existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir(), "herdr-titles-"));
  const path = join(directory, "socket");
  const server = net.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rmdir(directory);
  });
  return { HERDR_SOCKET_PATH: path, HERDR_PANE_ID: "w1:p1" };
}

test("speaks Herdr JSON protocol and handles a fragmented acknowledgement", async (t) => {
  let request;
  const env = await socketServer(t, (socket) => {
    socket.once("data", (data) => {
      request = JSON.parse(data.toString().trim());
      socket.write('{"id":"test",');
      setImmediate(() => socket.end('"result":{"status":"applied"}}\n'));
    });
  });
  assert.equal(await reportMetadata(env, { source: "test", seq: 1, title: "Title" }), true);
  assert.equal(request.method, "pane.report_metadata");
  assert.equal(request.params.pane_id, "w1:p1");
  assert.equal(request.params.title, "Title");
});

test("rejects a Herdr error instead of treating any response as success", async (t) => {
  const env = await socketServer(t, (socket) => {
    socket.once("data", () => socket.end('{"error":{"code":"pane_not_found"}}\n'));
  });
  assert.equal(await reportMetadata(env, { seq: 2 }), false);
});

test("rejects invalid JSON", async (t) => {
  const env = await socketServer(t, (socket) => {
    socket.once("data", () => socket.end('invalid\n'));
  });
  assert.equal(await reportMetadata(env, { seq: 3 }), false);
});

test("never writes a stale report", async (t) => {
  let bytes = 0;
  const env = await socketServer(t, (socket) => {
    socket.on("data", (data) => { bytes += data.length; });
  });
  assert.equal(await reportMetadata(env, { seq: 4 }, () => false), false);
  assert.equal(bytes, 0);
});

test("times out unresponsive sockets and tolerates unavailable Herdr", async (t) => {
  const env = await socketServer(t, (socket) => socket.resume());
  assert.equal(await reportMetadata(env, { seq: 5 }, () => true, 30), false);
  assert.equal(await reportMetadata({ ...env, HERDR_SOCKET_PATH: `${env.HERDR_SOCKET_PATH}-missing` }, { seq: 6 }), false);
});
