import { reportMetadata } from "./socket.js";
import { configuredLineWidth, titleLines } from "./title-lines.js";

export const SOURCE = "pondhouse:opencode-titles";
const POLL_MS = 250;
const REFRESH_MS = 5_000;
const TTL_MS = 15_000;

export function selectedTitle(context) {
  const route = context.ui.router.current();
  if (route.type !== "session") return { key: "", title: undefined };
  // Stay on the root conversation when inspecting a subagent, matching Herdr's
  // native OpenCode integration's session attribution.
  const id = context.data.session.root(route.sessionID);
  const title = id && context.data.session.get(id)?.title;
  if (typeof title !== "string") return { key: "", title: undefined };
  const clean = [...title.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim()]
    .slice(0, 80).join("");
  return { key: JSON.stringify([id, clean]), title: clean || undefined };
}

export function startBridge(context, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  if (env.HERDR_ENV !== "1" || !env.HERDR_PANE_ID || !env.HERDR_SOCKET_PATH) return;

  const lineWidth = configuredLineWidth(context.options);
  const now = dependencies.now ?? Date.now;
  const send = dependencies.send ?? ((params, guard) => reportMetadata(env, params, guard));
  const schedule = dependencies.schedule ?? setInterval;
  const cancel = dependencies.cancel ?? clearInterval;
  let disposed = false;
  let desiredKey;
  let generation = 0;
  let lastKey;
  let lastSentAt = -Infinity;
  let pending;
  let sequence = now() * 1_000;

  async function tick() {
    if (disposed) return;
    const selection = selectedTitle(context);
    if (selection.key !== desiredKey) {
      desiredKey = selection.key;
      generation += 1;
    }
    if (pending) return;
    if (selection.key === lastKey && now() - lastSentAt < REFRESH_MS) return;

    const revision = generation;
    const isCurrent = () => !disposed && revision === generation
      && selectedTitle(context).key === selection.key;
    const [firstLine, secondLine] = titleLines(selection.title, lineWidth);
    const params = {
      source: SOURCE,
      agent: "opencode",
      seq: ++sequence,
      ttl_ms: TTL_MS,
      tokens: {
        title_line_1: firstLine,
        title_line_2: secondLine ?? null,
      },
      ...(selection.title
        ? { title: selection.title, display_agent: selection.title }
        : { clear_title: true, clear_display_agent: true }),
    };
    // Promise.resolve also accommodates asynchronous errors without leaking an
    // unhandled rejection into OpenCode. Serialize writes; retry on the next poll.
    pending = Promise.resolve().then(() => send(params, isCurrent));
    try {
      if (await pending && isCurrent()) {
        lastKey = selection.key;
        lastSentAt = now();
      }
    } catch {
      // Best effort: the metadata expires if Herdr remains unavailable.
    } finally {
      pending = undefined;
    }
  }

  // Server events may arrive before the session cache updates. Polling also
  // covers hydration, title generation, manual rename, and local route changes.
  const unsubscribe = context.data.listen(() => { void tick(); });
  const timer = schedule(() => { void tick(); }, POLL_MS);
  timer.unref?.();
  void tick();

  return () => {
    disposed = true;
    generation += 1;
    cancel(timer);
    unsubscribe();
    // Do not race an unloading plugin against its replacement's first report.
    // The short TTL bounds stale labels after unload or an abrupt process exit.
  };
}
