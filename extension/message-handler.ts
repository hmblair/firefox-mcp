import type { ServerMessageRequest } from "../common";
import { WebsocketClient } from "./client";

export class MessageHandler {
  private client: WebsocketClient;

  constructor(client: WebsocketClient) {
    this.client = client;
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    switch (req.cmd) {
      case "open-tab":
        await this.openUrl(req.correlationId, req.url);
        break;
      case "close-tabs":
        await this.closeTabs(req.correlationId, req.tabIds);
        break;
      case "get-tab-list":
        await this.sendTabs(req.correlationId);
        break;
      case "get-browser-recent-history":
        await this.sendRecentHistory(req.correlationId, req.searchQuery);
        break;
      case "get-tab-content":
        await this.sendTabsContent(req.correlationId, req.tabId, req.offset);
        break;
      case "reorder-tabs":
        await this.reorderTabs(req.correlationId, req.tabOrder);
        break;
      case "find-highlight":
        await this.findAndHighlightText(
          req.correlationId,
          req.tabId,
          req.queryPhrase
        );
        break;
      case "get-interactive-elements":
        await this.getInteractiveElements(req.correlationId, req.tabId);
        break;
      case "click-element":
        await this.clickElement(req.correlationId, req.tabId, req.selector);
        break;
      case "type-into-field":
        await this.typeIntoField(
          req.correlationId,
          req.tabId,
          req.selector,
          req.text,
          req.clearFirst ?? true
        );
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async openUrl(correlationId: string, url: string): Promise<void> {
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      console.error("Invalid URL:", url);
      throw new Error("Invalid URL: must use http:// or https://");
    }

    const tab = await browser.tabs.create({
      url,
    });

    await this.client.sendResourceToServer({
      resource: "opened-tab-id",
      correlationId,
      tabId: tab.id,
    });
  }

  private async closeTabs(correlationId: string, tabIds: number[]): Promise<void> {
    await browser.tabs.remove(tabIds);
    await this.client.sendResourceToServer({
      resource: "tabs-closed",
      correlationId,
    });
  }

  private async sendTabs(correlationId: string): Promise<void> {
    const tabs = await browser.tabs.query({});
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs,
    });
  }

  private async sendRecentHistory(
    correlationId: string,
    searchQuery: string | null = null
  ): Promise<void> {
    const historyItems = await browser.history.search({
      text: searchQuery ?? "", // Search for all URLs (empty string matches everything)
      maxResults: 200, // Limit to 200 results
      startTime: 0, // Search from the beginning of time
    });
    const filteredHistoryItems = historyItems.filter((item) => {
      return !!item.url;
    });
    await this.client.sendResourceToServer({
      resource: "history",
      correlationId,
      historyItems: filteredHistoryItems,
    });
  }

  private async sendTabsContent(
    correlationId: string,
    tabId: number,
    offset?: number
  ): Promise<void> {
    const MAX_CONTENT_LENGTH = 50_000;
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        function getLinks() {
          const linkElements = document.querySelectorAll('a[href]');
          return Array.from(linkElements).map(el => ({
            url: el.href,
            text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
          })).filter(link => link.text !== '' && link.url.startsWith('https://') && !link.url.includes('#'));
        }

        function getTextContent() {
          let isTruncated = false;
          let text = document.body.innerText.substring(${offset || 0});
          if (text.length > ${MAX_CONTENT_LENGTH}) {
            text = text.substring(0, ${MAX_CONTENT_LENGTH});
            isTruncated = true;
          }
          return {
            text, isTruncated
          }
        }

        const textContent = getTextContent();

        return {
          links: getLinks(),
          fullText: textContent.text,
          isTruncated: textContent.isTruncated,
          totalLength: document.body.innerText.length
        };
      })();
    `,
    });
    const { isTruncated, fullText, links, totalLength } = results[0];
    await this.client.sendResourceToServer({
      resource: "tab-content",
      tabId,
      correlationId,
      isTruncated,
      fullText,
      links,
      totalLength,
    });
  }

  private async reorderTabs(correlationId: string, tabOrder: number[]): Promise<void> {
    // Reorder the tabs sequentially
    for (let newIndex = 0; newIndex < tabOrder.length; newIndex++) {
      const tabId = tabOrder[newIndex];
      await browser.tabs.move(tabId, { index: newIndex });
    }
    await this.client.sendResourceToServer({
      resource: "tabs-reordered",
      correlationId,
      tabOrder,
    });
  }

  private async findAndHighlightText(
    correlationId: string,
    tabId: number,
    queryPhrase: string
  ): Promise<void> {
    const findResults = await browser.find.find(queryPhrase, {
      tabId,
      caseSensitive: false,
    });

    // If there are results, highlight them
    if (findResults.count > 0) {
      // But first, activate the tab. In firefox, this would also enable
      // auto-scrolling to the highlighted result.
      await browser.tabs.update(tabId, { active: true });
      browser.find.highlightResults({
        tabId,
      });
    }

    await this.client.sendResourceToServer({
      resource: "find-highlight-result",
      correlationId,
      noOfResults: findResults.count,
    });
  }

  private async getInteractiveElements(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const selectors = 'a[href], button, input, textarea, select, [role="button"], [onclick], [tabindex]';
        const els = document.querySelectorAll(selectors);
        const seen = new Set();
        const elements = [];

        for (const el of els) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (el.offsetParent === null && el.tagName !== 'BODY') continue;

          let selector = '';
          if (el.id) {
            selector = '#' + CSS.escape(el.id);
          } else if (el.name && el.tagName !== 'A') {
            selector = el.tagName.toLowerCase() + '[name="' + el.name + '"]';
          } else {
            const tag = el.tagName.toLowerCase();
            const type = el.getAttribute('type');
            const label = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 30);
            let s = tag;
            if (type) s += '[type="' + type + '"]';
            if (el.className && typeof el.className === 'string') {
              const cls = el.className.trim().split(/\\s+/).slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
              s += cls;
            }
            selector = s;
          }

          if (seen.has(selector)) {
            const all = document.querySelectorAll(selector);
            const idx = Array.from(all).indexOf(el);
            selector = ':nth-match(' + selector + ', ' + idx + ')';
          }
          seen.add(selector);

          const tag = el.tagName.toLowerCase();
          const entry = {
            selector: selector,
            tag: tag,
            enabled: !el.disabled,
          };
          if (el.type) entry.type = el.type;

          const label = el.getAttribute('aria-label')
            || (el.labels && el.labels[0]?.textContent?.trim())
            || el.getAttribute('title')
            || (tag === 'a' || tag === 'button' ? el.textContent?.trim().substring(0, 50) : null);
          if (label) entry.label = label;
          if (el.placeholder) entry.placeholder = el.placeholder;
          if (el.value && tag !== 'input' || (tag === 'input' && el.type !== 'password')) {
            if (el.value) entry.value = el.value.substring(0, 100);
          }

          elements.push(entry);
        }
        return elements;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "interactive-elements",
      correlationId,
      elements: results[0] || [],
    });
  }

  private async clickElement(
    correlationId: string,
    tabId: number,
    selector: string
  ): Promise<void> {
    const escapedSelector = selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector('${escapedSelector}');
        if (el) {
          el.click();
          return true;
        }
        return false;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "element-clicked",
      correlationId,
      success: !!results[0],
    });
  }

  private async typeIntoField(
    correlationId: string,
    tabId: number,
    selector: string,
    text: string,
    clearFirst: boolean
  ): Promise<void> {
    const escapedSelector = selector.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const escapedText = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector('${escapedSelector}');
        if (!el) return false;
        el.focus();
        if (${clearFirst}) {
          el.value = '';
        }
        el.value = ${clearFirst ? `'${escapedText}'` : `el.value + '${escapedText}'`};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "text-typed",
      correlationId,
      success: !!results[0],
    });
  }
}
