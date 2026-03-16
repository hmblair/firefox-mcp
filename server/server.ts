import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrowserAPI } from "./browser-api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

const mcpServer = new McpServer({
  name: "firefox-mcp",
  version: process.env.MCP_VERSION || "0.0.0",
});

function toolResponse(data: Record<string, unknown> | unknown[], isError = false) {
  const content: { type: "text"; text: string; isError?: true }[] = [
    { type: "text", text: JSON.stringify(data, null, 2), ...(isError && { isError: true as const }) },
  ];
  return { content };
}

function toolError(toolName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tool] ${toolName} failed: ${message}`);
  return toolResponse({ success: false, error: `${toolName}: ${message}` }, true);
}

mcpServer.tool(
  "openLink",
  "Open a URL in the browser. By default navigates the active tab. Use newTab=true to open in a new tab.",
  {
    url: z.string().describe("The URL to open"),
    tabId: z
      .number()
      .optional()
      .describe("Tab ID to navigate (defaults to the active tab)"),
    newTab: z
      .boolean()
      .default(false)
      .describe("Open in a new tab instead of navigating an existing one (default: false)"),
  },
  async ({ url, tabId, newTab }) => {
    try {
      const resultTabId = await browserApi.openLink(url, tabId, newTab);
      if (resultTabId !== undefined) {
        return toolResponse({ success: true, tabId: resultTabId, url, newTab });
      }
      return toolResponse({ success: false, error: "Failed to open URL" }, true);
    } catch (error) {
      return toolError("openLink", error);
    }
  }
);

mcpServer.tool(
  "closeTabs",
  "Close browser tabs by their IDs",
  { tabIds: z.array(z.number()).describe("Tab IDs to close") },
  async ({ tabIds }) => {
    try {
      const { closedTabIds, failedTabIds } = await browserApi.closeTabs(tabIds);
      const result: Record<string, unknown> = { success: true, closedTabIds };
      if (failedTabIds.length > 0) {
        result.failedTabIds = failedTabIds;
      }
      return toolResponse(result);
    } catch (error) {
      return toolError("closeTabs", error);
    }
  }
);

mcpServer.tool(
  "listTabs",
  "List all open browser tabs",
  {
    query: z
      .string()
      .optional()
      .describe("Filter tabs by substring match on URL or title"),
  },
  async ({ query }) => {
    try {
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
    } catch (error) {
      return toolError("listTabs", error);
    }
  }
);

mcpServer.tool(
  "getTabContent",
  "Read a webpage's content organized by page sections (nav, main, sidebar, etc.) with structural formatting. For finding interactive elements, prefer listInteractiveElements.",
  {
    tabId: z.number().describe("The tab ID to read content from"),
    offset: z
      .number()
      .default(0)
      .describe(
        "Character offset for paginating large documents (default: 0)"
      ),
    selector: z
      .string()
      .optional()
      .describe(
        "CSS selector to read only a specific element (e.g. 'article', '#content'). Omit to read the full page."
      ),
    includeLinks: z
      .boolean()
      .default(false)
      .describe("Include links found on the page (default: false)"),
    maxLength: z
      .number()
      .optional()
      .describe(
        "Maximum characters of text to return (default: 5000). Use smaller values like 2000 to preview a page."
      ),
  },
  async ({ tabId, offset, selector, includeLinks, maxLength }) => {
    try {
      const content = await browserApi.getTabContent(
        tabId,
        offset,
        selector,
        includeLinks,
        maxLength
      );
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
    } catch (error) {
      return toolError("getTabContent", error);
    }
  }
);

mcpServer.tool(
  "searchTabContent",
  "Search for text in a webpage and return matching passages with surrounding context",
  {
    tabId: z.number().describe("The tab ID to search in"),
    query: z.string().describe("The text to search for (case-insensitive)"),
    contextChars: z
      .number()
      .optional()
      .describe(
        "Number of characters of context to include before and after each match (default: 200)"
      ),
  },
  async ({ tabId, query, contextChars }) => {
    try {
      const matches = await browserApi.searchTabContent(
        tabId,
        query,
        contextChars
      );
      return toolResponse(matches);
    } catch (error) {
      return toolError("searchTabContent", error);
    }
  }
);

mcpServer.tool(
  "listInteractiveElements",
  "List interactive elements on a webpage with CSS selectors. Use this as the first step to find what to click, type into, or interact with. Use filter to narrow by type (e.g. 'textarea', 'button'), label, href, or page section.",
  {
    tabId: z.number().describe("The tab ID to inspect"),
    filter: z
      .string()
      .optional()
      .describe(
        "Filter elements by substring match on type, label, placeholder, value, href, or context (nearest heading)"
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "Maximum number of elements to return (default: 50)"
      ),
  },
  async ({ tabId, filter, limit }) => {
    try {
      const elements = await browserApi.getInteractiveElements(tabId, filter, limit ?? 50);
      return toolResponse({ elements, totalCount: elements.length });
    } catch (error) {
      return toolError("listInteractiveElements", error);
    }
  }
);

mcpServer.tool(
  "clickElement",
  "Click an element on a webpage by CSS selector (reports whether navigation occurred)",
  {
    tabId: z.number().describe("The tab ID containing the element"),
    selector: z.string().describe("CSS selector of the element to click"),
  },
  async ({ tabId, selector }) => {
    try {
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
    } catch (error) {
      return toolError("clickElement", error);
    }
  }
);

mcpServer.tool(
  "typeIntoField",
  "Type text into an input field on a webpage",
  {
    tabId: z.number().describe("The tab ID containing the field"),
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
    try {
      const success = await browserApi.typeIntoField(
        tabId,
        selector,
        text,
        clearFirst,
        submit
      );
      if (success) {
        return toolResponse({ success: true, selector });
      }
      return toolResponse({ success: false, error: `No element found matching "${selector}"` }, true);
    } catch (error) {
      return toolError("typeIntoField", error);
    }
  }
);

mcpServer.tool(
  "pressKey",
  "Simulate a key press in a browser tab (e.g. Enter, Escape, Tab, ArrowDown)",
  {
    tabId: z.number().describe("The tab ID to send the key press to"),
    key: z
      .string()
      .describe(
        "The key to press (e.g. 'Enter', 'Escape', 'Tab', 'ArrowDown', 'a')"
      ),
    selector: z
      .string()
      .optional()
      .describe(
        "CSS selector of the element to target (defaults to the currently focused element)"
      ),
  },
  async ({ tabId, key, selector }) => {
    try {
      const success = await browserApi.pressKey(tabId, key, selector);
      if (success) {
        return toolResponse({ success: true, key });
      }
      return toolResponse({ success: false, error: `Failed to press "${key}"` }, true);
    } catch (error) {
      return toolError("pressKey", error);
    }
  }
);

mcpServer.tool(
  "selectOption",
  "Select an option in a <select> dropdown by value",
  {
    tabId: z.number().describe("The tab ID containing the dropdown"),
    selector: z
      .string()
      .describe("CSS selector of the <select> element"),
    value: z.string().describe("The value attribute of the option to select"),
  },
  async ({ tabId, selector, value }) => {
    try {
      const success = await browserApi.selectOption(tabId, selector, value);
      if (success) {
        return toolResponse({ success: true, selector, value });
      }
      return toolResponse({ success: false, error: `No <select> element found matching "${selector}"` }, true);
    } catch (error) {
      return toolError("selectOption", error);
    }
  }
);

mcpServer.tool(
  "getTabInfo",
  "Get a tab's current URL, title, and loading status without reading page content. Useful to verify navigation completed.",
  {
    tabId: z.number().describe("The tab ID to get info for"),
  },
  async ({ tabId }) => {
    try {
      const info = await browserApi.getTabInfo(tabId);
      return toolResponse({ ...info, tabId });
    } catch (error) {
      return toolError("getTabInfo", error);
    }
  }
);

mcpServer.tool(
  "fillForm",
  "Fill multiple form fields in one call. Reduces round-trips for common form-filling workflows.",
  {
    tabId: z.number().describe("The tab ID containing the form"),
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
    try {
      const { results, submitted } = await browserApi.fillForm(tabId, fields, submit);
      const filledCount = results.filter((r) => r.success).length;
      return toolResponse({ success: filledCount > 0, filledCount, results, submitted });
    } catch (error) {
      return toolError("fillForm", error);
    }
  }
);

mcpServer.tool(
  "waitForSelector",
  "Wait for a CSS selector to appear on the page. Essential for SPAs where content appears after JS execution.",
  {
    tabId: z.number().describe("The tab ID to wait in"),
    selector: z.string().describe("CSS selector to wait for"),
    timeout: z
      .number()
      .optional()
      .describe("Maximum time to wait in milliseconds (default: 5000)"),
  },
  async ({ tabId, selector, timeout }) => {
    try {
      const { found } = await browserApi.waitForSelector(tabId, selector, timeout);
      if (found) {
        return toolResponse({ success: true, selector });
      }
      return toolResponse(
        { success: false, error: `Timed out after ${timeout ?? 5000}ms waiting for "${selector}"` },
        true
      );
    } catch (error) {
      return toolError("waitForSelector", error);
    }
  }
);

mcpServer.tool(
  "takeScreenshot",
  "Capture a screenshot of the visible area of a browser tab. Returns a PNG image. Useful when page content is rendered graphically (charts, canvas, etc.) and not available as DOM text.",
  {
    tabId: z.number().describe("The tab ID to capture"),
  },
  async ({ tabId }) => {
    try {
      const dataUrl = await browserApi.takeScreenshot(tabId);
      // Strip the data URL prefix to get raw base64
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

const browserApi = new BrowserAPI();
browserApi
  .init()
  .then((port) => {
    console.error("Browser API initialized on port", port);
  })
  .catch((err) => {
    console.error("Browser API init error (tools will report this on use):", err.message ?? err);
  });

const transport = new StdioServerTransport();
mcpServer
  .connect(transport)
  .then(() => {
    console.error("MCP Server running on stdio");
  })
  .catch((err) => {
    console.error("MCP Server connection error", err);
    process.exit(1);
  });

function shutdown(reason: string) {
  console.error(`MCP Server closed (${reason})`);
  browserApi.close();
  mcpServer.close();
  process.exit(0);
}

process.stdin.on("close", () => shutdown("stdin closed"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));
