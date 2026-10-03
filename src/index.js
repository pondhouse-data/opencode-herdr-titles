import { Plugin } from "@opencode/plugin";

// The shared server cannot attribute a selected session to a terminal pane.
// Exporting a server entrypoint makes the companion ./tui load from opencode.json.
export default Plugin.define({
  id: "pondhouse.herdr-titles",
  setup() {},
});
