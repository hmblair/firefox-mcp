import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BrowserAPI } from "./browser-api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

export function toolResponse(data: Record<string, unknown> | unknown[], isError = false) {
  const content: { type: "text"; text: string; isError?: true }[] = [
    { type: "text", text: JSON.stringify(data, null, 2), ...(isError && { isError: true as const }) },
  ];
  return { content };
}

export function toolError(toolName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tool] ${toolName} failed: ${message}`);
  return toolResponse({ success: false, error: `${toolName}: ${message}` }, true);
}

export function wrapTool<T extends z.ZodRawShape>(
  mcpServer: McpServer,
  browserApi: BrowserAPI,
  name: string,
  description: string,
  schema: T,
  handler: (args: z.objectOutputType<z.ZodObject<T>, z.ZodTypeAny>, browserApi: BrowserAPI) => Promise<ReturnType<typeof toolResponse>>
) {
  mcpServer.tool(name, description, schema, async (args) => {
    try {
      return await handler(args, browserApi);
    } catch (error) {
      return toolError(name, error);
    }
  });
}

function registerBuiltinTools(mcpServer: McpServer, browserApi: BrowserAPI) {
  const wrap = <T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: (args: z.objectOutputType<z.ZodObject<T>, z.ZodTypeAny>) => Promise<ReturnType<typeof toolResponse>>
  ) => {
    wrapTool(mcpServer, browserApi, name, description, schema, handler);
  };

  wrap(
    "openLink",
    "Open a URL in the browser. By default navigates the active tab. Use newTab=true to open in a new tab.",
    {
      url: z.string().describe("The URL to open"),
      tabId: z
        .coerce.number()
        .optional()
        .describe("Tab ID to navigate (defaults to the active tab)"),
      newTab: z
        .boolean()
        .default(false)
        .describe("Open in a new tab instead of navigating an existing one (default: false)"),
    },
    async ({ url, tabId, newTab }) => {
      const resultTabId = await browserApi.openLink(url, tabId, newTab);
      if (resultTabId !== undefined) {
        return toolResponse({ success: true, tabId: resultTabId, url, newTab });
      }
      return toolResponse({ success: false, error: "Failed to open URL" }, true);
    }
  );

  wrap(
    "closeTabs",
    "Close browser tabs by their IDs",
    { tabIds: z.array(z.coerce.number()).describe("Tab IDs to close") },
    async ({ tabIds }) => {
      const { closedTabIds, failedTabIds } = await browserApi.closeTabs(tabIds);
      const result: Record<string, unknown> = { success: true, closedTabIds };
      if (failedTabIds.length > 0) {
        result.failedTabIds = failedTabIds;
      }
      return toolResponse(result);
    }
  );

  wrap(
    "listTabs",
    "List all open browser tabs",
    {
      query: z
        .string()
        .optional()
        .describe("Filter tabs by substring match on URL or title"),
    },
    async ({ query }) => {
      let openTabs = await browserApi.getTabList();
      if (query) {
        const lower = query.toLowerCase();
        openTabs = openTabs.filter(
          (tab) =>
            tab.url?.toLowerCase().includes(lower) ||
            tab.title?.toLowerCase().includes(lower)
        );
      }
      return toolResponse(
        openTabs.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          lastAccessed: tab.lastAccessed
            ? dayjs(tab.lastAccessed).fromNow()
            : "unknown",
        }))
      );
    }
  );

  wrap(
    "getTabContent",
    "Read a webpage's content organized by page sections (nav, main, sidebar, etc.) with structural formatting. For finding interactive elements, prefer listInteractiveElements.",
    {
      tabId: z.coerce.number().describe("The tab ID to read content from"),
      offset: z
        .number()
        .default(0)
        .describe("Character offset for paginating large documents (default: 0)"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to read only a specific element (e.g. 'article', '#content'). Omit to read the full page."),
      includeLinks: z
        .boolean()
        .default(false)
        .describe("Include links found on the page (default: false)"),
      maxLength: z
        .number()
        .optional()
        .describe("Maximum characters of text to return (default: 5000). Use smaller values like 2000 to preview a page."),
    },
    async ({ tabId, offset, selector, includeLinks, maxLength }) => {
      const content = await browserApi.getTabContent(tabId, offset, selector, includeLinks, maxLength);
      const result: Record<string, unknown> = {
        totalLength: content.totalLength,
        isTruncated: content.isTruncated,
      };
      if (content.sections) {
        result.sections = content.sections;
      } else {
        result.text = content.fullText;
      }
      if (includeLinks && content.links && content.links.length > 0) {
        result.links = content.links;
      }
      return toolResponse(result);
    }
  );

  wrap(
    "searchTabContent",
    "Search for text in a webpage and return matching passages with surrounding context",
    {
      tabId: z.coerce.number().describe("The tab ID to search in"),
      query: z.string().describe("The text to search for (case-insensitive)"),
      contextChars: z
        .number()
        .optional()
        .describe("Number of characters of context to include before and after each match (default: 200)"),
    },
    async ({ tabId, query, contextChars }) => {
      const matches = await browserApi.searchTabContent(tabId, query, contextChars);
      return toolResponse(matches);
    }
  );

  wrap(
    "listInteractiveElements",
    "List interactive elements on a webpage with CSS selectors. Use this as the first step to find what to click, type into, or interact with. Use filter to narrow by type (e.g. 'textarea', 'button'), label, placeholder, value, or page section.",
    {
      tabId: z.coerce.number().describe("The tab ID to inspect"),
      filter: z
        .string()
        .optional()
        .describe("Filter elements by substring match on type, label, placeholder, value, or context (nearest heading)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of elements to return (default: 50)"),
    },
    async ({ tabId, filter, limit }) => {
      const elements = await browserApi.getInteractiveElements(tabId, filter, limit ?? 50);
      return toolResponse({ elements, totalCount: elements.length });
    }
  );

  wrap(
    "clickElement",
    "Click an element on a webpage by CSS selector (reports whether navigation occurred)",
    {
      tabId: z.coerce.number().describe("The tab ID containing the element"),
      selector: z.string().describe("CSS selector of the element to click"),
    },
    async ({ tabId, selector }) => {
      const result = await browserApi.clickElement(tabId, selector);
      if (result.success) {
        const data: Record<string, unknown> = { success: true, selector, navigated: result.navigated };
        if (result.navigated) {
          data.url = result.url;
          data.title = result.title;
        }
        return toolResponse(data);
      }
      return toolResponse({ success: false, error: result.error || "Unknown error" }, true);
    }
  );

  wrap(
    "typeIntoField",
    "Type text into an input field on a webpage",
    {
      tabId: z.coerce.number().describe("The tab ID containing the field"),
      selector: z.string().describe("CSS selector of the input field"),
      text: z.string().describe("The text to type"),
      clearFirst: z
        .boolean()
        .default(true)
        .describe("Clear existing field value before typing (default: true)"),
      submit: z
        .boolean()
        .default(false)
        .describe("Submit the containing form after typing (default: false)"),
    },
    async ({ tabId, selector, text, clearFirst, submit }) => {
      const result = await browserApi.typeIntoField(tabId, selector, text, clearFirst, submit);
      if (result.success) {
        return toolResponse({ success: true, selector });
      }
      return toolResponse({ success: false, error: result.error || `No element found matching "${selector}"` }, true);
    }
  );

  wrap(
    "clickAndType",
    "Click an element and type into whatever receives focus. Useful for click-to-edit UIs where the input field only appears after clicking.",
    {
      tabId: z.coerce.number().describe("The tab ID containing the element"),
      selector: z.string().describe("CSS selector of the element to click"),
      text: z.string().describe("The text to type"),
      clearFirst: z
        .boolean()
        .default(true)
        .describe("Clear existing field value before typing (default: true)"),
      submit: z
        .boolean()
        .default(false)
        .describe("Submit the containing form after typing (default: false)"),
    },
    async ({ tabId, selector, text, clearFirst, submit }) => {
      const result = await browserApi.clickAndType(tabId, selector, text, clearFirst, submit);
      if (result.success) {
        return toolResponse({ success: true, selector });
      }
      return toolResponse({ success: false, error: result.error || "Unknown error" }, true);
    }
  );

  wrap(
    "reloadTab",
    "Reload a browser tab. Useful after changing settings or when a page is in a bad state.",
    {
      tabId: z.coerce.number().describe("The tab ID to reload"),
      bypassCache: z
        .boolean()
        .default(false)
        .describe("Bypass the browser cache (hard reload, default: false)"),
    },
    async ({ tabId, bypassCache }) => {
      await browserApi.reloadTab(tabId, bypassCache);
      return toolResponse({ success: true, tabId });
    }
  );

  wrap(
    "selectOption",
    "Select an option in a <select> dropdown by value. For multi-select elements, use the values parameter to select multiple options.",
    {
      tabId: z.coerce.number().describe("The tab ID containing the dropdown"),
      selector: z
        .string()
        .describe("CSS selector of the <select> element"),
      value: z.string().describe("The value attribute of the option to select"),
      values: z
        .array(z.string())
        .optional()
        .describe("For multi-select: array of values to select (overrides value)"),
    },
    async ({ tabId, selector, value, values }) => {
      const result = await browserApi.selectOption(tabId, selector, value, values);
      if (result.success) {
        return toolResponse({ success: true, selector, ...(values ? { values } : { value }) });
      }
      return toolResponse({ success: false, error: result.error || `No <select> element found matching "${selector}"` }, true);
    }
  );

  wrap(
    "getTabInfo",
    "Get a tab's current URL, title, and loading status without reading page content. Useful to verify navigation completed.",
    {
      tabId: z.coerce.number().describe("The tab ID to get info for"),
    },
    async ({ tabId }) => {
      const info = await browserApi.getTabInfo(tabId);
      return toolResponse({ ...info, tabId });
    }
  );

  wrap(
    "fillForm",
    "Fill multiple form fields in one call. Reduces round-trips for common form-filling workflows.",
    {
      tabId: z.coerce.number().describe("The tab ID containing the form"),
      fields: z
        .array(
          z.object({
            selector: z.string().describe("CSS selector of the input field"),
            value: z.string().optional().describe("Value to set (for text inputs, textareas, selects)"),
            checked: z.boolean().optional().describe("Check/uncheck (for checkboxes and radio buttons)"),
          })
        )
        .describe("Array of {selector, value} or {selector, checked} pairs to fill"),
      submit: z
        .string()
        .optional()
        .describe("CSS selector of a button to click after filling fields (optional)"),
    },
    async ({ tabId, fields, submit }) => {
      const { results, submitted } = await browserApi.fillForm(tabId, fields, submit);
      const filledCount = results.filter((r) => r.success).length;
      return toolResponse({ success: filledCount > 0, filledCount, results, submitted });
    }
  );

  wrap(
    "waitForSelector",
    "Wait for a CSS selector to appear on the page. Essential for SPAs where content appears after JS execution.",
    {
      tabId: z.coerce.number().describe("The tab ID to wait in"),
      selector: z.string().describe("CSS selector to wait for"),
      timeout: z
        .number()
        .optional()
        .describe("Maximum time to wait in milliseconds (default: 5000)"),
    },
    async ({ tabId, selector, timeout }) => {
      const { found } = await browserApi.waitForSelector(tabId, selector, timeout);
      if (found) {
        return toolResponse({ success: true, selector });
      }
      return toolResponse(
        { success: false, error: `Timed out after ${timeout ?? 5000}ms waiting for "${selector}"` },
        true
      );
    }
  );

  wrap(
    "sendKeypress",
    "Send a keyboard event to the active element on a webpage. Useful for triggering keyboard shortcuts or hotkeys.",
    {
      tabId: z.coerce.number().describe("The tab ID to send the keypress to"),
      key: z
        .string()
        .describe("The key to press (e.g. 'z', 'Enter', 'Escape', 'ArrowDown', 'Tab')"),
      ctrl: z
        .boolean()
        .default(false)
        .describe("Hold Ctrl/Control key (default: false)"),
      shift: z
        .boolean()
        .default(false)
        .describe("Hold Shift key (default: false)"),
      alt: z
        .boolean()
        .default(false)
        .describe("Hold Alt key (default: false)"),
      meta: z
        .boolean()
        .default(false)
        .describe("Hold Meta/Command key (default: false)"),
    },
    async ({ tabId, key, ctrl, shift, alt, meta }) => {
      const result = await browserApi.sendKeypress(tabId, key, { ctrl, shift, alt, meta });
      return toolResponse({ success: result.success, key });
    }
  );

  mcpServer.tool(
    "takeScreenshot",
    "Capture a screenshot of the visible area of a browser tab. Returns a PNG image. Useful when page content is rendered graphically (charts, canvas, etc.) and not available as DOM text.",
    {
      tabId: z.coerce.number().describe("The tab ID to capture"),
    },
    async ({ tabId }) => {
      try {
        const dataUrl = await browserApi.takeScreenshot(tabId);
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        return {
          content: [{ type: "image" as const, data: base64, mimeType: "image/png" }],
        };
      } catch (error) {
        return toolError("takeScreenshot", error);
      }
    }
  );

  mcpServer.resource(
    "open-tab-contents",
    new ResourceTemplate("browser://tab/{tabId}/content", {
      list: async () => {
        if (!browserApi.isInitialized) {
          return { resources: [] };
        }
        const openTabs = await browserApi.getTabList();
        return {
          resources: (openTabs ?? []).map((tab) => ({
            uri: `browser://tab/${tab.id}/content`,
            name: tab.title || tab.url || "",
            mimeType: "text/plain",
          })),
        };
      },
    }),
    async (uri, { tabId }) => {
      const content = await browserApi.getTabContent(
        Number(tabId),
        0,
        undefined,
        true
      );
      let text: string;
      if (content?.sections) {
        text = content.sections
          .map((s: { label: string; content: string }) => `[${s.label}]\n${s.content}`)
          .join("\n\n");
      } else {
        text = content?.fullText ?? "";
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text,
          },
        ],
      };
    }
  );
}

export interface FirefoxMcpPlugin {
  register: (mcpServer: McpServer, browserApi: BrowserAPI) => void;
}

export interface FirefoxMcpServer {
  mcpServer: McpServer;
  browserApi: BrowserAPI;
  /** Start the server on stdio. Call this after registering any additional tools. */
  start: () => Promise<void>;
}

interface PluginConfig {
  plugins?: string[];
}

function loadPluginConfig(): PluginConfig {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const configPaths = [
    path.join(os.homedir(), ".config", "firefox-mcp", "config.json"),
    path.join(os.homedir(), ".firefox-mcp.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      // file doesn't exist or isn't valid JSON, try next
    }
  }

  return {};
}

function loadPlugins(mcpServer: McpServer, browserApi: BrowserAPI): void {
  const config = loadPluginConfig();
  if (!config.plugins || config.plugins.length === 0) return;

  for (const pluginPath of config.plugins) {
    try {
      const resolved = require.resolve(pluginPath);
      const plugin = require(resolved);
      const registerFn = plugin.register ?? plugin.default?.register;
      if (typeof registerFn === "function") {
        registerFn(mcpServer, browserApi);
        console.error(`[plugin] Loaded: ${pluginPath}`);
      } else {
        console.error(`[plugin] ${pluginPath}: no register function exported`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[plugin] Failed to load ${pluginPath}: ${message}`);
    }
  }
}

export function createServer(options?: { name?: string; version?: string }): FirefoxMcpServer {
  const mcpServer = new McpServer({
    name: options?.name ?? "firefox-mcp",
    version: options?.version ?? process.env.MCP_VERSION ?? "0.0.0",
  });

  const browserApi = new BrowserAPI();

  registerBuiltinTools(mcpServer, browserApi);
  loadPlugins(mcpServer, browserApi);

  const start = async () => {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("MCP Server running on stdio");

    function shutdown(reason: string) {
      console.error(`MCP Server closed (${reason})`);
      browserApi.close();
      mcpServer.close();
      process.exit(0);
    }

    process.stdin.on("close", () => shutdown("stdin closed"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  };

  return { mcpServer, browserApi, start };
}
