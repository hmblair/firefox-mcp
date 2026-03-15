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

mcpServer.tool(
  "openTab",
  "Open a URL in a new browser tab",
  { url: z.string().describe("The URL to open") },
  async ({ url }) => {
    const openedTabId = await browserApi.openTab(url);
    if (openedTabId !== undefined) {
      return {
        content: [
          {
            type: "text",
            text: `${url} opened in tab id ${openedTabId}`,
          },
        ],
      };
    } else {
      return {
        content: [{ type: "text", text: "Failed to open tab", isError: true }],
      };
    }
  }
);

mcpServer.tool(
  "closeTabs",
  "Close browser tabs by their IDs",
  { tabIds: z.array(z.number()).describe("Tab IDs to close") },
  async ({ tabIds }) => {
    await browserApi.closeTabs(tabIds);
    return {
      content: [{ type: "text", text: "Closed tabs" }],
    };
  }
);

mcpServer.tool(
  "listTabs",
  "List all open browser tabs",
  {},
  async () => {
    const openTabs = await browserApi.getTabList();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            openTabs.map((tab) => ({
              id: tab.id,
              url: tab.url,
              title: tab.title,
              lastAccessed: tab.lastAccessed
                ? dayjs(tab.lastAccessed).fromNow()
                : "unknown",
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

mcpServer.tool(
  "searchHistory",
  "Search the browser's recent history",
  {
    query: z
      .string()
      .optional()
      .describe("Search query to filter history (omit to list all recent)"),
  },
  async ({ query }) => {
    const browserHistory = await browserApi.getBrowserRecentHistory(query);
    if (browserHistory.length === 0) {
      const hint = query ? " Try without a query." : "";
      return {
        content: [{ type: "text", text: `No history found.${hint}` }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            browserHistory.map((item) => ({
              url: item.url,
              title: item.title,
              lastVisited: item.lastVisitTime
                ? dayjs(item.lastVisitTime).fromNow()
                : "unknown",
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

mcpServer.tool(
  "getTabContent",
  "Read a webpage's text content and links by tab ID",
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
        "Maximum characters of text to return (default: 50000). Use smaller values like 2000 to preview a page."
      ),
  },
  async ({ tabId, offset, selector, includeLinks, maxLength }) => {
    const content = await browserApi.getTabContent(
      tabId,
      offset,
      selector,
      includeLinks,
      maxLength
    );
    let links: { type: "text"; text: string }[] = [];
    if (includeLinks && content.links.length > 0) {
      links = content.links.map((link: { text: string; url: string }) => ({
        type: "text",
        text: `[${link.text}](${link.url})`,
      }));
    }

    let text = content.fullText;
    let hint: { type: "text"; text: string }[] = [];
    if (content.isTruncated || offset > 0) {
      const rangeString = `${offset}-${offset + text.length}`;
      hint = [
        {
          type: "text",
          text:
            `Content truncated (range ${rangeString} of ${content.totalLength}). ` +
            "Use getTabContent with a higher offset to read more.",
        },
      ];
    }

    return {
      content: [...hint, { type: "text", text }, ...links],
    };
  }
);

mcpServer.tool(
  "getPageOutline",
  "Get the heading structure (h1-h6) of a webpage with CSS selectors for each section",
  { tabId: z.number().describe("The tab ID to get the outline from") },
  async ({ tabId }) => {
    const headings = await browserApi.getPageOutline(tabId);
    if (headings.length === 0) {
      return {
        content: [{ type: "text", text: "No headings found on the page" }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(headings, null, 2),
        },
      ],
    };
  }
);

mcpServer.tool(
  "reorderTabs",
  "Reorder open browser tabs",
  {
    tabOrder: z
      .array(z.number())
      .describe("Ordered array of tab IDs representing the desired order"),
  },
  async ({ tabOrder }) => {
    const newOrder = await browserApi.reorderTabs(tabOrder);
    return {
      content: [
        { type: "text", text: `Tabs reordered: ${newOrder.join(", ")}` },
      ],
    };
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
    const matches = await browserApi.searchTabContent(
      tabId,
      query,
      contextChars
    );
    if (matches.length === 0) {
      return {
        content: [{ type: "text", text: `No matches found for "${query}"` }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(matches, null, 2),
        },
      ],
    };
  }
);

mcpServer.tool(
  "listInteractiveElements",
  "List interactive elements on a webpage (buttons, inputs, links, selects, textareas) with CSS selectors",
  { tabId: z.number().describe("The tab ID to inspect") },
  async ({ tabId }) => {
    const elements = await browserApi.getInteractiveElements(tabId);
    if (elements.length === 0) {
      return {
        content: [
          { type: "text", text: "No interactive elements found on the page" },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(elements, null, 2),
        },
      ],
    };
  }
);

mcpServer.tool(
  "clickElement",
  "Click an element on a webpage by CSS selector",
  {
    tabId: z.number().describe("The tab ID containing the element"),
    selector: z.string().describe("CSS selector of the element to click"),
  },
  async ({ tabId, selector }) => {
    const success = await browserApi.clickElement(tabId, selector);
    return {
      content: [
        {
          type: "text",
          text: success
            ? `Clicked element matching "${selector}"`
            : `No element found matching "${selector}"`,
          isError: !success,
        },
      ],
    };
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
    const success = await browserApi.typeIntoField(
      tabId,
      selector,
      text,
      clearFirst,
      submit
    );
    return {
      content: [
        {
          type: "text",
          text: success
            ? `Typed text into element matching "${selector}"`
            : `No element found matching "${selector}"`,
          isError: !success,
        },
      ],
    };
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
    const success = await browserApi.pressKey(tabId, key, selector);
    return {
      content: [
        {
          type: "text",
          text: success
            ? `Pressed "${key}"`
            : `Failed to press "${key}"`,
          isError: !success,
        },
      ],
    };
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
    const success = await browserApi.selectOption(tabId, selector, value);
    return {
      content: [
        {
          type: "text",
          text: success
            ? `Selected option "${value}" in "${selector}"`
            : `No <select> element found matching "${selector}"`,
          isError: !success,
        },
      ],
    };
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
    const listOfLinks =
      content?.links
        .map(
          (link: { text: string; url: string }) => `[${link.text}](${link.url})`
        )
        .join("\n") ?? "";
    const fullText = content?.fullText ?? "";
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `Webpage text: \n\n${fullText} \n\nWeb page Links:\n${listOfLinks}`,
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
    console.error("Browser API init error", err);
    process.exit(1);
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

process.stdin.on("close", () => {
  console.error("MCP Server closed");
  browserApi.close();
  mcpServer.close();
  process.exit(0);
});
