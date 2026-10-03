import { Plugin } from "@opencode/plugin/tui";
import { startBridge } from "./bridge.js";

export default Plugin.define({
  id: "pondhouse.herdr-titles.tui",
  setup(context) {
    return startBridge(context);
  },
});
