# Firefox MCP

An MCP server paired with a Firefox extension that enables AI assistants to control the user's browser.

```
MCP Client (Claude, etc.) <--HTTP--> Native Host <--native messaging--> Firefox Extension
```

The native messaging host is launched automatically by Firefox and serves MCP tools over HTTP. No manual server management required.

## Tools

| Tool | Description |
|------|-------------|
| **Navigation** | |
| `openLink` | Open a URL in the browser (navigates active tab by default, or use `newTab: true`) |
| `closeTabs` | Close browser tabs by their IDs (reports which tabs succeeded/failed) |
| `listTabs` | List all open browser tabs, optionally filtered by URL or title |
| `getTabInfo` | Get a tab's URL, title, and loading status without reading content |
| `reloadTab` | Reload a browser tab, optionally bypassing cache |
| **Reading** | |
| `getTabContent` | Read a webpage's text content and links, optionally scoped to a CSS selector |
| `searchTabContent` | Search for text in a webpage and return matching passages with context |
| `listInteractiveElements` | List interactive elements with semantic types, labels, hrefs, and CSS selectors |
| `takeScreenshot` | Capture a screenshot of the visible area of a tab |
| **Interaction** | |
| `clickElement` | Click an element by CSS selector (reports navigation and new tabs) |
| `typeIntoField` | Type text into an input field, optionally submitting the form |
| `clickAndType` | Click an element and type into whatever receives focus |
| `fillForm` | Fill multiple form fields in one call, with support for text, checkbox, radio, and dropdowns |
| `selectOption` | Select an option in a `<select>` dropdown by value |
| `sendKeypress` | Send a keyboard event (Enter, Escape, Tab, ArrowDown, etc.) with modifier keys |
| **Synchronization** | |
| `waitForSelector` | Wait for a CSS selector to appear on the page (for SPAs/dynamic content) |
| **Advanced** | |
| `executeScript` | Execute arbitrary JavaScript in a tab and return the result |

Open tab contents are also available as MCP resources.

## Setup

### 1. Build

```sh
npm install
make build
```

### 2. Install

```sh
make install
```

This registers the native messaging host with Firefox and configures the MCP server for Claude Code and/or OpenCode.

To remove:

```sh
make uninstall
```

### 3. Load the extension in Firefox

1. Open `about:debugging` in Firefox
2. Click "This Firefox"
3. Click "Load Temporary Add-on..."
4. Select `extension/manifest.json`

To install permanently, use the built XPI at `dist/firefox-mcp.xpi` (requires signing for release Firefox, or use Firefox Developer Edition / Nightly with `xpinstall.signatures.required` set to `false`).

## Architecture

The system uses two communication channels:

- **Extension to native host**: Firefox [native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) over stdin/stdout. Firefox launches and manages the host process automatically when the extension starts.
- **MCP client to native host**: [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) on `http://localhost:8581/mcp`. Each tool call is a stateless HTTP request.

This means:
- No reconnection logic — the native host stays alive as long as Firefox is running.
- Restarting the MCP client (e.g. Claude Code) reconnects instantly since HTTP is stateless.
- Closing Firefox cleanly shuts down the native host.

## Development

```sh
make build    # Compile TypeScript and package extension XPI
make clean    # Remove build artifacts
make tag      # Tag current version in git
```

## Project Structure

```
extension/              Firefox extension source (TypeScript)
  manifest.json         Extension manifest
  background.ts         Extension entry point
  client.ts             Native messaging client
  message-handler.ts    Handles server commands
  injected/             Content scripts injected into web pages
server/                 MCP server / native host source (TypeScript)
  native-host.ts        Native messaging host entry point
  create-server.ts      MCP tool definitions and HTTP server
  browser-api.ts        Native messaging I/O with extension
common/                 Shared TypeScript interfaces
  server-messages.ts    Server-to-extension message types
  extension-messages.ts Extension-to-server message types
scripts/
  install.cjs           Native host and MCP client config installer
Makefile                Build and install targets
```
