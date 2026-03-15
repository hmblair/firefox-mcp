import type { ServerMessageRequest } from "../common";
import { WebsocketClient } from "./client";
import { getTabContentScript } from "./injected/get-tab-content";
import { getInteractiveElementsScript } from "./injected/get-interactive-elements";
import { searchTabContentScript } from "./injected/search-tab-content";
import { clickElementScript } from "./injected/click-element";
import { typeIntoFieldScript } from "./injected/type-into-field";
import { pressKeyScript } from "./injected/press-key";
import { selectOptionScript } from "./injected/select-option";
import { fillFormScript } from "./injected/fill-form";
import { waitForSelectorScript } from "./injected/wait-for-selector";

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
    console.log(`[handler] ${req.cmd} (id: ${req.correlationId})`, JSON.stringify(req, null, 2));
    try {
      await this.dispatchCommand(req);
    } catch (error) {
      console.error(`[handler] ${req.cmd} (id: ${req.correlationId}) failed:`, error);
      await this.client.sendErrorToServer(
        req.correlationId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async dispatchCommand(req: ServerMessageRequest): Promise<void> {
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
        await this.getTabList(req.correlationId);
        break;
      case "get-tab-content":
        await this.getTabContent(
          req.correlationId,
          req.tabId,
          req.offset,
          req.selector,
          req.includeLinks,
          req.maxLength
        );
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
        await this.getInteractiveElements(req.correlationId, req.tabId, req.filter, req.limit);
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
      case "get-tab-info":
        await this.getTabInfo(req.correlationId, req.tabId);
        break;
      case "fill-form":
        await this.fillForm(
          req.correlationId,
          req.tabId,
          req.fields,
          req.submit
        );
        break;
      case "wait-for-selector":
        await this.waitForSelector(
          req.correlationId,
          req.tabId,
          req.selector,
          req.timeoutMs
        );
        break;
      case "take-screenshot":
        await this.takeScreenshot(req.correlationId, req.tabId);
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async activateAndExecute(tabId: number, code: string) {
    await browser.tabs.update(tabId, { active: true });
    return browser.tabs.executeScript(tabId, { code });
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
    const closedTabIds: number[] = [];
    const failedTabIds: number[] = [];
    for (const id of tabIds) {
      try {
        await browser.tabs.remove(id);
        closedTabIds.push(id);
      } catch {
        failedTabIds.push(id);
      }
    }
    await this.client.sendResourceToServer({
      resource: "tabs-closed",
      correlationId,
      closedTabIds,
      failedTabIds,
    });
  }

  private async getTabList(correlationId: string): Promise<void> {
    const tabs = await browser.tabs.query({});
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs,
    });
  }

  private async getTabContent(
    correlationId: string,
    tabId: number,
    offset?: number,
    selector?: string,
    includeLinks?: boolean,
    maxLength?: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: getTabContentScript(
        selector ?? null,
        !!includeLinks,
        offset || 0,
        maxLength ?? 5_000
      ),
    });
    if (!results || !results[0]) {
      console.error(`[handler] executeScript returned no results for tab ${tabId}`);
      await this.client.sendErrorToServer(correlationId, `executeScript returned no results for tab ${tabId} — the tab may have been closed or navigated to a restricted page`);
      return;
    }
    const { isTruncated, fullText, sections, links, totalLength, selectorNotFound } = results[0];
    if (selectorNotFound) {
      await this.client.sendErrorToServer(correlationId, `Selector not found: ${selector}`);
      return;
    }
    await this.client.sendResourceToServer({
      resource: "tab-content",
      tabId,
      correlationId,
      isTruncated,
      fullText: fullText || undefined,
      sections: sections || undefined,
      links: links || undefined,
      totalLength,
    });
  }

  private async searchTabContent(
    correlationId: string,
    tabId: number,
    query: string,
    contextChars?: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: searchTabContentScript(query, contextChars ?? 200),
    });
    await this.client.sendResourceToServer({
      resource: "search-tab-content-result",
      correlationId,
      matches: results[0] || [],
    });
  }

  private async getInteractiveElements(
    correlationId: string,
    tabId: number,
    filter?: string,
    limit?: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: getInteractiveElementsScript(),
    });

    let elements = results[0] || [];

    if (filter) {
      const lower = filter.toLowerCase();
      elements = elements.filter(
        (el: any) =>
          (el.type && el.type.toLowerCase().includes(lower)) ||
          (el.label && el.label.toLowerCase().includes(lower)) ||
          (el.placeholder && el.placeholder.toLowerCase().includes(lower)) ||
          (el.value && el.value.toLowerCase().includes(lower)) ||
          (el.href && el.href.toLowerCase().includes(lower)) ||
          (el.context && el.context.toLowerCase().includes(lower))
      );
    }

    const maxElements = limit ?? 50;
    elements = elements.slice(0, maxElements);

    await this.client.sendResourceToServer({
      resource: "interactive-elements",
      correlationId,
      elements,
    });
  }

  private async clickElement(
    correlationId: string,
    tabId: number,
    selector: string
  ): Promise<void> {
    await browser.tabs.update(tabId, { active: true });
    const tabBefore = await browser.tabs.get(tabId);
    const urlBefore = tabBefore.url;
    const results = await browser.tabs.executeScript(tabId, {
      code: clickElementScript(selector),
    });

    const result = results[0] || {
      success: false,
      error: "Script execution failed",
    };

    let navigated = false;
    let url: string | undefined;
    let title: string | undefined;

    if (result.success) {
      await waitForPossibleNavigation(tabId);
      try {
        const tabAfter = await browser.tabs.get(tabId);
        url = tabAfter.url;
        title = tabAfter.title;
        navigated = url !== urlBefore;
      } catch {
        // tab may have closed
      }
    }

    await this.client.sendResourceToServer({
      resource: "element-clicked",
      correlationId,
      success: result.success,
      navigated,
      url,
      title,
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
    const results = await this.activateAndExecute(
      tabId,
      typeIntoFieldScript(selector, text, clearFirst, submit)
    );

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
    const results = await this.activateAndExecute(
      tabId,
      pressKeyScript(key, selector)
    );

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

  private async getTabInfo(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    await this.client.sendResourceToServer({
      resource: "tab-info",
      correlationId,
      tabId,
      url: tab.url || "",
      title: tab.title || "",
      status: tab.status || "unknown",
    });
  }

  private async fillForm(
    correlationId: string,
    tabId: number,
    fields: { selector: string; value: string }[],
    submit?: string
  ): Promise<void> {
    const results = await this.activateAndExecute(
      tabId,
      fillFormScript(fields, submit)
    );

    const result = results[0] || { results: [], submitted: false };

    if (result.submitted) {
      await waitForPossibleNavigation(tabId);
    }

    await this.client.sendResourceToServer({
      resource: "form-filled",
      correlationId,
      results: result.results,
      submitted: result.submitted,
    });
  }

  private async waitForSelector(
    correlationId: string,
    tabId: number,
    selector: string,
    timeoutMs?: number
  ): Promise<void> {
    const results = await browser.tabs.executeScript(tabId, {
      code: waitForSelectorScript(selector, timeoutMs ?? 5000),
    });

    const result = results[0] || { found: false };

    await this.client.sendResourceToServer({
      resource: "selector-found",
      correlationId,
      found: result.found,
    });
  }

  private async takeScreenshot(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    await browser.tabs.update(tabId, { active: true });
    // Wait briefly for tab to become active
    await new Promise((r) => setTimeout(r, 100));
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    await this.client.sendResourceToServer({
      resource: "screenshot",
      correlationId,
      dataUrl,
    });
  }

  private async selectOption(
    correlationId: string,
    tabId: number,
    selector: string,
    value: string
  ): Promise<void> {
    const results = await this.activateAndExecute(
      tabId,
      selectOptionScript(selector, value)
    );
    const result = results[0] || { success: false, error: 'Script execution failed' };
    await this.client.sendResourceToServer({
      resource: "option-selected",
      correlationId,
      success: result.success,
      error: result.error,
    });
  }
}
