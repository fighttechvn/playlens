# PlayLens MCP server

Lets Claude read what the PlayLens extension keeps in your browser: the Play Console records per app (releases per track and their status, version codes, LiveOps events with start/end, products, subscriptions, promo codes, licensing key, history of changes and actions), the watchlist, install and rank history. **Read-only**, local only.

```
Claude ──stdio (MCP)──▶ mcp/server.js ◀──WebSocket 127.0.0.1:17893── PlayLens (service worker)
```

A browser extension cannot listen on a port, so it connects *out* to this server. It does that only while **Options → Claude (MCP) → "Cho Claude đọc dữ liệu PlayLens"** is on (default off), and only to `127.0.0.1`.

## Set up

Needs Node 18+ and the repo (the extension itself comes from the store or unpacked).

```bash
cd play-list-info/mcp
npm install
claude mcp add playlens -- node "$(pwd)/server.js"
```

For Claude Desktop, add to `claude_desktop_config.json`:

```json
{ "mcpServers": { "playlens": { "command": "node", "args": ["/ABSOLUTE/PATH/play-list-info/mcp/server.js"] } } }
```

Then turn the switch on in the extension's Options and keep Chrome open. It reconnects within 30 seconds if the server starts later. Ask Claude to call `status` first.

Several Claude sessions can run the server at once: the first owns the port, the others forward to it.

## Tools

| Tool | Answers |
|---|---|
| `status` | connected? extension version, how much data it holds |
| `console_apps` | one row per Console app: each track's release + status ("In review"), events and next expiry, IAP / sub / promo counts, licensing key captured. Filters: `query`, `inReview`, `eventsWithinDays` |
| `console_app` | the full record of one app (package or numeric app id), optionally only some `sections` |
| `console_history` | per-app log of pages opened, data changes and buttons pressed; filter `type`, `since`, `limit` |
| `console_events` | LiveOps events ending/starting within N days across all apps |
| `watchlist` | Play Store apps on the watchlist and their recent changes |
| `installs_history` | daily installs / ratings / score for an app the user has looked at |
| `ranks` | keyword rank history of a watched app |
| `storage_keys`, `storage_get` | escape hatch: list keys, read one |
| `settings` | the extension's toggles |

Example questions: "Which apps have a release in review?", "Which events expire this week?", "What changed on go2048 since Monday?", "Give me the licensing key of every app."

## What it does not do

- Never writes: no tool changes extension data, and the extension answers only these read methods (`bridge-data.js`).
- Never returns the Pro licence key (`license` is not in the readable list; a test fails if any method leaks it).
- Does not read Play Console by itself: data exists only for pages you have opened with the extension installed.

## Safety

- Server binds `127.0.0.1` only and checks the `Host` header (DNS-rebinding).
- `/ext` accepts only a `chrome-extension://…` origin: a web page cannot connect (browsers always send their own `Origin`). Pin it to your extension id with `PLAYLENS_EXTENSION_ID=<id>`.
- Another local process could still bind the port first and ask the extension for data. Anything already running as you can read the browser profile anyway; leave the switch off when you do not use it.
- Port: `PLAYLENS_PORT` changes the server's port, but the extension is fixed to 17893, so change both or neither.

## Tests

```bash
node ../tools/test-bridge.js   # the data methods, with fixtures
node test.mjs                  # real MCP client ⇄ server.js ⇄ fake extension: tools, refused origins, second session, disconnect
```
