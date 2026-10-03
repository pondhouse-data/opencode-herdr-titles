import net from "node:net";

// Herdr's local socket protocol is newline-delimited JSON. Never write to stdout
// from a TUI plugin, and do not let an unavailable socket block the interface.
export function reportMetadata(env, params, isCurrent = () => true, timeoutMs = 500) {
  return new Promise((resolve) => {
    let finished = false;
    let buffer = "";
    const path = process.platform === "win32"
      ? `\\\\.\\pipe\\${env.HERDR_SOCKET_PATH}`
      : env.HERDR_SOCKET_PATH;
    const client = net.createConnection(path);
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      client.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    client.on("connect", () => {
      try {
        if (!isCurrent()) return finish(false);
        client.write(`${JSON.stringify({
          id: `pondhouse:herdr-titles:${params.seq}`,
          method: "pane.report_metadata",
          params: { pane_id: env.HERDR_PANE_ID, ...params },
        })}\n`);
      } catch {
        finish(false);
      }
    });
    client.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline < 0) {
        if (buffer.length > 65_536) finish(false);
        return;
      }
      try {
        const response = JSON.parse(buffer.slice(0, newline));
        finish(!response.error && response.result !== undefined);
      } catch {
        finish(false);
      }
    });
    client.on("error", () => finish(false));
    client.on("end", () => finish(false));
    client.on("close", () => finish(false));
  });
}
