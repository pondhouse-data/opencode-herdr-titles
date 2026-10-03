# OpenCode Herdr Titles

Show OpenCode V2's session title in Herdr's agent sidebar and pane borders,
without OpenCode's `OC |` terminal-title prefix.

This is a Herdr-specific integration, not a global terminal-title replacement.
Outside Herdr it does nothing. It does not change session names, agent identity,
activity tracking, or OpenCode's outer terminal title.

## Install from GitHub

With OpenCode **V2** (use `opencode2` if V1 and V2 coexist):

```sh
opencode2 plugin add github:pondhouse-data/opencode-herdr-titles#v0.2.1
```

Or append the GitHub package to your global `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:pondhouse-data/opencode-herdr-titles#v0.2.1"]
}
```

Preserve any plugins already configured. The package has a no-op server
entrypoint and a companion `./tui` entrypoint: only the pane-local TUI publishes
titles, even when several panes share a server. No development-folder path or
npm publication is needed. This plugin targets V2, not V1 or Mini/headless mode.

Use Herdr's `agent` row token to display the reported title. Append this to
`~/.config/herdr/config.toml` (merge an existing table if present):

```toml
[ui.sidebar.agents.rows_by_agent]
opencode = [
  ["state_icon", "machine", "workspace", "tab"],
  ["agent"]
]
```

```sh
herdr server reload-config
```

The `terminal_title` and `terminal_title_stripped` tokens still show OpenCode's
OSC title, including its prefix. They intentionally are not modified.

### Title-only, two-line sidebar

Version 0.2 adds `$title_line_1` and `$title_line_2` metadata tokens. To use the
space for titles rather than location metadata:

```toml
[ui]
# Reserve room for 30 title columns, indentation, divider, and scrollbar.
sidebar_width = 36
sidebar_min_width = 36
sidebar_max_width = 36

[ui.sidebar.agents.rows_by_agent]
opencode = [
  ["state_icon", { token = "$title_line_1", bold = true }],
  [{ token = "$title_line_2", bold = true }]
]
```

```text
● Using OpenCode session titles
  for Herdr agent panes
```

Short titles take one line. Long titles wrap at a word boundary when practical;
overflow beyond two lines gets an ellipsis on the second line. The split respects
terminal-cell widths and Unicode graphemes. The complete metadata title and pane
border remain unchanged. Herdr itself does not wrap tokens automatically.

For another sidebar width, set the plugin's `titleLineWidth` option (8–80,
default 30) and leave at least six extra columns in the sidebar:

```json
{
  "plugins": [{
    "package": "github:pondhouse-data/opencode-herdr-titles#v0.2.1",
    "options": { "titleLineWidth": 24 }
  }]
}
```

Reload Herdr after changing its configuration. This layout applies to expanded
desktop agent rows; mobile/collapsed layouts retain Herdr's own presentation.

## Behavior

- Uses the selected root session's actual title, not the shortened OSC title.
- Follows auto-generated titles, manual renames, and session switches.
- Publishes `title`, `display_agent`, and the two optional title-row tokens
  through Herdr's metadata API, never agent lifecycle or identity fields.
- Keeps Herdr's existing session/activity integration untouched; install that
  integration separately if you want native lifecycle tracking and restore.
- Clears its fields when leaving the session or when no title is available.
- Polls every 250 ms and refreshes metadata every 5 seconds. Socket errors are
  retried without interrupting the UI. Metadata expires after 15 seconds when
  the plugin stops, so labels do not survive an exited/replaced process.
- Bounds labels to Herdr's 80-character presentation limit. The sidebar can
  still truncate to its available width; control characters are removed.
- Stops background work on unload. Outside a Herdr-managed pane it is a no-op.

The metadata title takes precedence over a manual pane label while this plugin
is active. To stop that behavior, disable/remove the plugin; its metadata expires
within 15 seconds. It does not rename Herdr tabs or alter other agents.

Configuration normally reloads automatically. If an already-running TUI does
not pick up the newly installed companion, reopen that TUI and resume its session;
there is no need to restart Herdr or kill other agents.

## Development

Pure JavaScript; no build step. Tests use Node's built-in runner:

```sh
npm ci --ignore-scripts
npm run check
npm test
```

Entrypoints export plain V2 lifecycle definitions, as Herdr's official integration
does. No SDK imports or build-time dependencies are required. `string-width` is
the only runtime dependency and measures Unicode terminal-cell widths.

## References

- [OpenCode V2 plugin loading, Git packages, and reload](https://opencode.ai/v2/docs/plugins)
- [OpenCode V2 CLI plugin API](https://opencode.ai/v2/docs/build/plugins/cli)
- [Herdr metadata API](https://github.com/herdrdev/herdr/blob/v0.9.3/docs/versions/0.9.3/website/src/content/docs/socket-api.mdx)
- [Herdr sidebar configuration](https://github.com/herdrdev/herdr/blob/v0.9.3/docs/versions/0.9.3/website/src/content/docs/configuration.mdx)

MIT licensed. Independent of the OpenCode and Herdr projects.
