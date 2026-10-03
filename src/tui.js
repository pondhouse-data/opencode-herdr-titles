import { startBridge } from "./bridge.js";

export default {
  id: "pondhouse.herdr-titles.tui",
  setup(context) {
    return startBridge(context);
  },
};
