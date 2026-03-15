import type { ServerMessageRequest } from "../common";
import { WebsocketClient } from "./client";

function waitForTabLoad(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve(); // resolve even on timeout — best effort
    }, timeoutMs);

    function listener(
      updatedTabId: number,
      changeInfo: browser.tabs._OnUpdatedChangeInfo
    ) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    browser.tabs.onUpdated.addListener(listener);
  });
}

async function waitForPossibleNavigation(tabId: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "loading") {
      await waitForTabLoad(tabId);
    }
  } catch {
    // tab may have been replaced
  }
}

export class MessageHandler {
  private client: WebsocketClient;

  constructor(client: WebsocketClient) {
    this.client = client;
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    switch (req.cmd) {
      case "open-link":
        await this.openLink(
          req.correlationId,
          req.url,
          req.tabId,
          req.newTab
        );
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
        await this.sendTabsContent(
          req.correlationId,
          req.tabId,
          req.offset,
          req.selector,
          req.includeLinks,
          req.maxLength
        );
        break;
      case "get-page-outline":
        await this.sendPageOutline(req.correlationId, req.tabId);
        break;
      case "reorder-tabs":
        await this.reorderTabs(req.correlationId, req.tabOrder);
        break;
      case "search-tab-content":
        await this.searchTabContent(
          req.correlationId,
          req.tabId,
          req.query,
          req.contextChars
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
          req.clearFirst ?? true,
          req.submit ?? false
        );
        break;
      case "press-key":
        await this.pressKey(
          req.correlationId,
          req.tabId,
          req.key,
          req.selector
        );
        break;
      case "select-option":
        await this.selectOption(
          req.correlationId,
          req.tabId,
          req.selector,
          req.value
        );
        break;
      case "click-element-by-text":
        await this.clickElementByText(
          req.correlationId,
          req.tabId,
          req.text,
          req.tag
        );
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async openLink(
    correlationId: string,
    url: string,
    tabId?: number,
    newTab?: boolean
  ): Promise<void> {
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      console.error("Invalid URL:", url);
      throw new Error("Invalid URL: must use http:// or https://");
    }

    let resultTabId: number | undefined;

    if (newTab) {
      const tab = await browser.tabs.create({ url });
      resultTabId = tab.id;
    } else {
      let targetTabId = tabId;
      if (targetTabId === undefined) {
        const activeTabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        targetTabId = activeTabs[0]?.id;
      }
      if (targetTabId === undefined) {
        const tab = await browser.tabs.create({ url });
        resultTabId = tab.id;
      } else {
        await browser.tabs.update(targetTabId, { url, active: true });
        resultTabId = targetTabId;
      }
    }

    if (resultTabId !== undefined) {
      await waitForTabLoad(resultTabId);
    }

    await this.client.sendResourceToServer({
      resource: "opened-tab-id",
      correlationId,
      tabId: resultTabId,
    });
  }

  private async closeTabs(
    correlationId: string,
    tabIds: number[]
  ): Promise<void> {
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
      text: searchQuery ?? "",
      maxResults: 200,
      startTime: 0,
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
    offset?: number,
    selector?: string,
    includeLinks?: boolean,
    maxLength?: number
  ): Promise<void> {
    const MAX_CONTENT_LENGTH = maxLength ?? 50_000;
    const safeSelector = selector ? JSON.stringify(selector) : "null";
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const selector = ${safeSelector};
        const includeLinks = ${!!includeLinks};
        const offset = ${offset || 0};
        const maxLen = ${MAX_CONTENT_LENGTH};

        function getLinks() {
          if (!includeLinks) return [];
          const root = selector ? (document.querySelector(selector) || document.body) : document.body;
          const linkElements = root.querySelectorAll('a[href]');
          return Array.from(linkElements).map(el => ({
            url: el.href,
            text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
          })).filter(link => link.text !== '' && link.url.startsWith('http') && !link.url.includes('#'));
        }

        function getTextContent() {
          const root = selector ? document.querySelector(selector) : document.body;
          if (!root) return { text: '', isTruncated: false, totalLength: 0 };
          let isTruncated = false;
          const totalLength = root.innerText.length;
          let text = root.innerText.substring(offset);
          if (text.length > maxLen) {
            text = text.substring(0, maxLen);
            isTruncated = true;
          }
          return { text, isTruncated, totalLength };
        }

        const textContent = getTextContent();
        return {
          links: getLinks(),
          fullText: textContent.text,
          isTruncated: textContent.isTruncated,
          totalLength: textContent.totalLength
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

  private async sendPageOutline(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(headings).map((el, i) => {
          const level = parseInt(el.tagName[1]);
          const text = el.textContent?.trim() || '';
          let selector = '';
          if (el.id) {
            selector = '#' + CSS.escape(el.id);
          } else {
            const all = document.querySelectorAll(el.tagName);
            const idx = Array.from(all).indexOf(el);
            selector = el.tagName.toLowerCase() + ':nth-of-type(' + (idx + 1) + ')';
          }
          return { level, text, selector };
        }).filter(h => h.text.length > 0);
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "page-outline",
      correlationId,
      headings: results[0] || [],
    });
  }

  private async reorderTabs(
    correlationId: string,
    tabOrder: number[]
  ): Promise<void> {
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

  private async searchTabContent(
    correlationId: string,
    tabId: number,
    query: string,
    contextChars?: number
  ): Promise<void> {
    const safeQuery = JSON.stringify(query);
    const ctx = contextChars ?? 200;
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const query = ${safeQuery}.toLowerCase();
        const ctx = ${ctx};
        const text = document.body.innerText;
        const lower = text.toLowerCase();
        const matches = [];
        let pos = 0;
        while (matches.length < 50) {
          const idx = lower.indexOf(query, pos);
          if (idx === -1) break;
          const start = Math.max(0, idx - ctx);
          const end = Math.min(text.length, idx + query.length + ctx);
          matches.push({ context: text.substring(start, end), index: idx });
          pos = idx + query.length;
        }
        return matches;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "search-tab-content-result",
      correlationId,
      matches: results[0] || [],
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
            if (el.value) {
              selector += '[value="' + CSS.escape(el.value) + '"]';
            }
            if (seen.has(selector)) {
              const parent = el.parentElement;
              if (parent) {
                const idx = Array.from(parent.children).indexOf(el) + 1;
                const pSel = parent.id ? '#' + CSS.escape(parent.id) : parent.tagName.toLowerCase();
                selector = pSel + ' > :nth-child(' + idx + ')';
              }
            }
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
    await browser.tabs.update(tabId, { active: true });
    const safeSelector = JSON.stringify(selector);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector(${safeSelector});
        if (!el) return { success: false, error: "Element not found" };
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return { success: false, error: "Element not visible (zero dimensions)" };
        if (el.offsetParent === null && el.tagName !== 'BODY') return { success: false, error: "Element not visible (hidden)" };
        if (el.disabled) return { success: false, error: "Element is disabled" };
        el.click();
        return { success: true };
      })();
    `,
    });

    const result = results[0] || {
      success: false,
      error: "Script execution failed",
    };

    if (result.success) {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "element-clicked",
      correlationId,
      success: result.success,
      error: result.error,
    });
  }

  private async clickElementByText(
    correlationId: string,
    tabId: number,
    text: string,
    tag?: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeText = JSON.stringify(text);
    const safeTag = tag ? JSON.stringify(tag.toUpperCase()) : "null";
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const target = ${safeText}.toLowerCase();
        const tagFilter = ${safeTag};
        const all = document.querySelectorAll(tagFilter ? tagFilter.toLowerCase() : '*');
        for (const el of all) {
          const elText = (el.innerText || el.textContent || '').trim();
          if (!elText.toLowerCase().includes(target)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (el.offsetParent === null && el.tagName !== 'BODY') continue;
          el.click();
          const result = { success: true, clickedText: elText.substring(0, 100), clickedTag: el.tagName.toLowerCase() };
          if (el.href) result.href = el.href;
          return result;
        }
        return { success: false, error: 'No visible element found containing "' + ${safeText} + '"' };
      })();
    `,
    });

    const result = results[0] || {
      success: false,
      error: "Script execution failed",
    };

    if (result.success) {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "element-clicked-by-text",
      correlationId,
      success: result.success,
      clickedText: result.clickedText,
      clickedTag: result.clickedTag,
      href: result.href,
      error: result.error,
    });
  }

  private async typeIntoField(
    correlationId: string,
    tabId: number,
    selector: string,
    text: string,
    clearFirst: boolean,
    submit: boolean
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeSelector = JSON.stringify(selector);
    const safeText = JSON.stringify(text);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector(${safeSelector});
        if (!el) return false;
        el.focus();
        const text = ${safeText};
        if (${clearFirst}) {
          el.value = '';
        }
        el.value = ${clearFirst} ? text : el.value + text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (${submit}) {
          const form = el.closest ? el.closest('form') : null;
          if (form) form.requestSubmit();
        }
        return true;
      })();
    `,
    });

    const success = !!results[0];

    if (success && submit) {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "text-typed",
      correlationId,
      success,
    });
  }

  private async pressKey(
    correlationId: string,
    tabId: number,
    key: string,
    selector?: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeKey = JSON.stringify(key);
    const safeSelector = selector ? JSON.stringify(selector) : "null";
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const selector = ${safeSelector};
        const target = selector ? document.querySelector(selector) : (document.activeElement || document.body);
        if (!target) return false;
        const key = ${safeKey};
        const opts = { key: key, bubbles: true, cancelable: true };
        target.dispatchEvent(new KeyboardEvent('keydown', opts));
        target.dispatchEvent(new KeyboardEvent('keypress', opts));
        target.dispatchEvent(new KeyboardEvent('keyup', opts));
        if (key === 'Enter') {
          const form = target.closest ? target.closest('form') : null;
          if (form) form.requestSubmit();
        }
        return true;
      })();
    `,
    });

    const success = !!results[0];

    if (success && key === "Enter") {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "key-pressed",
      correlationId,
      success,
    });
  }

  private async selectOption(
    correlationId: string,
    tabId: number,
    selector: string,
    value: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const safeSelector = JSON.stringify(selector);
    const safeValue = JSON.stringify(value);
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        const el = document.querySelector(${safeSelector});
        if (!el || el.tagName !== 'SELECT') return false;
        el.value = ${safeValue};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })();
    `,
    });
    await this.client.sendResourceToServer({
      resource: "option-selected",
      correlationId,
      success: !!results[0],
    });
  }
}
