# Firefox MCP

An MCP server paired with a Firefox extension that enables AI assistants to control the user's browser.

```
MCP Client (Claude, etc.) <--stdio--> MCP Server <--WebSocket--> Firefox Extension
```

## Tools

| Tool | Description |
|------|-------------|
| `openTab` | Open a URL in a new browser tab (waits for page load) |
| `closeTabs` | Close browser tabs by their IDs |
| `listTabs` | List all open browser tabs |
| `getTabContent` | Read a webpage's text content and links, optionally scoped to a CSS selector with a configurable max length |
| `searchTabContent` | Search for text in a webpage and return matching passages with context |
| `listInteractiveElements` | List interactive elements (buttons, inputs, links) with CSS selectors |
| `clickElement` | Click an element by CSS selector (waits for navigation) |
| `typeIntoField` | Type text into an input field, optionally submitting the form |
| `pressKey` | Simulate a key press (Enter, Escape, Tab, ArrowDown, etc.) |
| `selectOption` | Select an option in a `<select>` dropdown by value |
| `getTabInfo` | Get a tab's URL, title, and loading status without reading content |
| `fillForm` | Fill multiple form fields in one call, optionally clicking a submit button |
| `waitForSelector` | Wait for a CSS selector to appear on the page (for SPAs/dynamic content) |

Open tab contents are also available as MCP resources.

## Setup

### 1. Build

```sh
npm install
make build
```

### 2. Register with MCP clients

```sh
make install
```

This interactively registers the server with Claude Code (`~/.mcp.json`) and/or OpenCode.

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

## Security

The MCP server and extension communicate over a local WebSocket connection authenticated with HMAC-SHA256 signatures using a shared secret generated at build time.

## Development

```sh
make build    # Compile TypeScript and package extension XPI
make clean    # Remove build artifacts
make tag      # Tag current version in git
```

## Project Structure

```
extension/          Firefox extension source (TypeScript)
  manifest.json     Extension manifest
  background.ts     Service worker entry point
  client.ts         WebSocket client
  message-handler.ts  Handles server commands
  auth.ts           HMAC-SHA256 message signing
server/             MCP server source (TypeScript)
  server.ts         MCP tool definitions and entry point
  browser-api.ts    WebSocket communication with extension
  util.ts           Port utilities
common/             Shared TypeScript interfaces
  server-messages.ts  Server-to-extension message types
  extension-messages.ts  Extension-to-server message types
mcp-bridge.cjs      Executable entry point
scripts/
  install.cjs       MCP client config installer
  generate-token.js Shared secret generator
Makefile            Build and install targets
```
