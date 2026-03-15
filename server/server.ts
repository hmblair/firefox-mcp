import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrowserAPI } from "./browser-api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { readFileSync } from "fs";
import { join } from "path";

dayjs.extend(relativeTime);

const { version } = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")
);

const mcpServer = new McpServer({
  name: "firefox-mcp",
  version,
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
      content: openTabs.map((tab) => {
        let lastAccessed = "unknown";
        if (tab.lastAccessed) {
          lastAccessed = dayjs(tab.lastAccessed).fromNow();
        }
        return {
          type: "text",
          text: `tab id=${tab.id}, url=${tab.url}, title=${tab.title}, last accessed=${lastAccessed}`,
        };
      }),
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
    if (browserHistory.length > 0) {
      return {
        content: browserHistory.map((item) => {
          let lastVisited = "unknown";
          if (item.lastVisitTime) {
            lastVisited = dayjs(item.lastVisitTime).fromNow();
          }
          return {
            type: "text",
            text: `url=${item.url}, title="${item.title}", lastVisitTime=${lastVisited}`,
          };
        }),
      };
    } else {
      const hint = query ? " Try without a query." : "";
      return {
        content: [{ type: "text", text: `No history found.${hint}` }],
      };
    }
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
  },
  async ({ tabId, offset }) => {
    const content = await browserApi.getTabContent(tabId, offset);
    let links: { type: "text"; text: string }[] = [];
    if (offset === 0) {
      links = content.links.map((link: { text: string; url: string }) => {
        return {
          type: "text",
          text: `Link text: ${link.text}, Link URL: ${link.url}`,
        };
      });
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
  "findInTab",
  "Find and highlight text in a browser tab",
  {
    tabId: z.number().describe("The tab ID to search in"),
    queryPhrase: z.string().describe("The text to find and highlight"),
  },
  async ({ tabId, queryPhrase }) => {
    const noOfResults = await browserApi.findHighlight(tabId, queryPhrase);
    return {
      content: [
        {
          type: "text",
          text: `Found and highlighted ${noOfResults} result(s)`,
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
      content: elements.map((el) => {
        const parts = [`selector="${el.selector}"`, `tag=${el.tag}`];
        if (el.type) parts.push(`type=${el.type}`);
        if (el.label) parts.push(`label="${el.label}"`);
        if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
        if (el.value) parts.push(`value="${el.value}"`);
        if (!el.enabled) parts.push("disabled");
        return { type: "text", text: parts.join(", ") };
      }),
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
  },
  async ({ tabId, selector, text, clearFirst }) => {
    const success = await browserApi.typeIntoField(
      tabId,
      selector,
      text,
      clearFirst
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
    const content = await browserApi.getTabContent(Number(tabId), 0);
    const listOfLinks =
      content?.links
        .map(
          (link: { text: string; url: string }) => `${link.text}: ${link.url}`
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
