import {
  ActionResult,
  ExtensionMessage,
  BrowserTab,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
} from "../common";

const EXTENSION_RESPONSE_TIMEOUT_MS = 60_000;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

/**
 * Read native messaging frames from stdin.
 * Each frame: 4-byte little-endian length prefix + UTF-8 JSON body.
 */
function startNativeMessageReader(onMessage: (msg: unknown) => void) {
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const messageLength = buffer.readUInt32LE(0);
      if (buffer.length < 4 + messageLength) break;

      const json = buffer.subarray(4, 4 + messageLength).toString("utf-8");
      buffer = buffer.subarray(4 + messageLength);

      try {
        onMessage(JSON.parse(json));
      } catch (error) {
        console.error("[native] Failed to parse message:", error);
      }
    }
  });
}

/**
 * Write a native messaging frame to stdout.
 */
function writeNativeMessage(msg: unknown): void {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(header);
  process.stdout.write(body);
}

export class BrowserAPI {
  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  private connected = false;

  constructor() {
    startNativeMessageReader((msg) => {
      if (isErrorMessage(msg)) {
        this.handleExtensionError(msg);
        return;
      }
      this.handleDecodedExtensionMessage(msg as ExtensionMessage);
    });

    process.stdin.on("end", () => {
      this.connected = false;
      console.error("[native] Extension disconnected (stdin closed)");
    });

    this.connected = true;
    console.error("[native] Native messaging initialized");
  }

  get isInitialized(): boolean {
    return this.connected;
  }

  close() {
    // Nothing to close — stdin/stdout are managed by the OS
  }

  async openLink(
    url: string,
    tabId?: number,
    newTab?: boolean
  ): Promise<number | undefined> {
    const correlationId = this.sendMessageToExtension({
      cmd: "open-link",
      url,
      tabId,
      newTab,
    });
    const message = await this.waitForResponse(correlationId, "opened-tab-id");
    return message.tabId;
  }

  async closeTabs(tabIds: number[]): Promise<{ closedTabIds: number[]; failedTabIds: number[] }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "close-tabs",
      tabIds,
    });
    const message = await this.waitForResponse(correlationId, "tabs-closed");
    return { closedTabIds: message.closedTabIds, failedTabIds: message.failedTabIds };
  }

  async getTabList(): Promise<BrowserTab[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-list",
    });
    const message = await this.waitForResponse(correlationId, "tabs");
    return message.tabs;
  }

  async getTabContent(
    tabId: number,
    offset: number,
    selector?: string,
    includeLinks?: boolean,
    maxLength?: number
  ): Promise<TabContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-content",
      tabId,
      offset,
      selector,
      includeLinks,
      maxLength,
    });
    return await this.waitForResponse(correlationId, "tab-content");
  }

  async getInteractiveElements(tabId: number, filter?: string, limit?: number) {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-interactive-elements",
      tabId,
      filter,
      limit,
    });
    const message = await this.waitForResponse(correlationId, "interactive-elements");
    return message.elements;
  }

  async clickElement(
    tabId: number,
    selector: string
  ): Promise<ActionResult & { navigated?: boolean; url?: string; title?: string; openedTabId?: number; openedTabUrl?: string }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-element",
      tabId,
      selector,
    });
    const message = await this.waitForResponse(correlationId, "element-clicked");
    return { success: message.success, navigated: message.navigated, url: message.url, title: message.title, openedTabId: message.openedTabId, openedTabUrl: message.openedTabUrl, error: message.error };
  }

  async typeIntoField(
    tabId: number,
    selector: string,
    text: string,
    clearFirst: boolean,
    submit: boolean
  ): Promise<ActionResult> {
    const correlationId = this.sendMessageToExtension({
      cmd: "type-into-field",
      tabId,
      selector,
      text,
      clearFirst,
      submit,
    });
    const message = await this.waitForResponse(correlationId, "text-typed");
    return { success: message.success, error: message.error };
  }

  async reloadTab(tabId: number, bypassCache: boolean): Promise<void> {
    const correlationId = this.sendMessageToExtension({
      cmd: "reload-tab",
      tabId,
      bypassCache,
    });
    await this.waitForResponse(correlationId, "tab-reloaded");
  }

  async selectOption(
    tabId: number,
    selector: string,
    value: string,
    values?: string[]
  ): Promise<ActionResult> {
    const correlationId = this.sendMessageToExtension({
      cmd: "select-option",
      tabId,
      selector,
      value,
      values,
    });
    const message = await this.waitForResponse(
      correlationId,
      "option-selected"
    );
    return { success: message.success, error: message.error };
  }

  async getTabInfo(tabId: number): Promise<{ url: string; title: string; status: string }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-info",
      tabId,
    });
    const message = await this.waitForResponse(correlationId, "tab-info");
    return { url: message.url, title: message.title, status: message.status };
  }

  async fillForm(
    tabId: number,
    fields: { selector: string; value?: string; checked?: boolean }[],
    submit?: string
  ): Promise<{ results: { selector: string; success: boolean; error?: string }[]; submitted: boolean }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "fill-form",
      tabId,
      fields,
      submit,
    });
    const message = await this.waitForResponse(correlationId, "form-filled");
    return { results: message.results, submitted: message.submitted };
  }

  async waitForSelector(
    tabId: number,
    selector: string,
    timeoutMs?: number
  ): Promise<{ found: boolean }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-selector",
      tabId,
      selector,
      timeoutMs,
    });
    const message = await this.waitForResponse(correlationId, "selector-found");
    return { found: message.found };
  }

  async takeScreenshot(tabId: number, maxWidth?: number, quality?: number): Promise<string> {
    const correlationId = this.sendMessageToExtension({
      cmd: "take-screenshot",
      tabId,
      ...(maxWidth && { maxWidth }),
      ...(quality && { quality }),
    });
    const message = await this.waitForResponse(correlationId, "screenshot");
    return message.dataUrl;
  }

  async clickAndType(
    tabId: number,
    selector: string,
    text: string,
    clearFirst: boolean,
    submit: boolean
  ): Promise<ActionResult> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-and-type",
      tabId,
      selector,
      text,
      clearFirst,
      submit,
    });
    const message = await this.waitForResponse(correlationId, "click-and-typed");
    return { success: message.success, error: message.error };
  }

  async executeScript(tabId: number, code: string): Promise<unknown> {
    const correlationId = this.sendMessageToExtension({
      cmd: "execute-script",
      tabId,
      code,
    });
    const message = await this.waitForResponse(correlationId, "script-result");
    return message.result;
  }

  async sendKeypress(
    tabId: number,
    key: string,
    modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }
  ): Promise<ActionResult> {
    const correlationId = this.sendMessageToExtension({
      cmd: "send-keypress",
      tabId,
      key,
      modifiers,
    });
    const message = await this.waitForResponse(correlationId, "keypress-sent");
    return { success: message.success };
  }

  async searchTabContent(tabId: number, query: string, contextChars?: number) {
    const correlationId = this.sendMessageToExtension({
      cmd: "search-tab-content",
      tabId,
      query,
      contextChars,
    });
    const message = await this.waitForResponse(
      correlationId,
      "search-tab-content-result"
    );
    return message.matches;
  }

  private sendMessageToExtension(message: ServerMessage): string {
    if (!this.connected) {
      throw new Error(
        "Firefox extension is not connected. Make sure Firefox is running and the extension is installed."
      );
    }

    const correlationId = Math.random().toString(36).substring(2);
    const req: ServerMessageRequest = { ...message, correlationId };

    console.error(`[browser-api] Sending ${req.cmd} (id: ${correlationId})`);
    writeNativeMessage(req);

    return correlationId;
  }

  private handleDecodedExtensionMessage(decoded: ExtensionMessage) {
    const { correlationId } = decoded;
    const entry = this.extensionRequestMap.get(correlationId);
    if (!entry) {
      console.error(`[browser-api] Received response for unknown correlationId: ${correlationId} (resource: ${decoded.resource})`);
      return;
    }
    const { resolve, resource, reject } = entry;
    if (resource !== decoded.resource) {
      console.error(`[browser-api] Resource mismatch for id ${correlationId}: expected '${resource}', got '${decoded.resource}'`);
      this.extensionRequestMap.delete(correlationId);
      reject(`Resource mismatch: expected '${resource}', got '${decoded.resource}'`);
      return;
    }
    console.error(`[browser-api] Received ${decoded.resource} (id: ${correlationId})`);
    this.extensionRequestMap.delete(correlationId);
    resolve(decoded);
  }

  private handleExtensionError(decoded: ExtensionError) {
    const { correlationId, errorMessage } = decoded;
    const entry = this.extensionRequestMap.get(correlationId);
    if (!entry) {
      console.error(`[browser-api] Received error for unknown correlationId: ${correlationId}: ${errorMessage}`);
      return;
    }
    console.error(`[browser-api] Extension error (id: ${correlationId}): ${errorMessage}`);
    this.extensionRequestMap.delete(correlationId);
    entry.reject(errorMessage);
  }

  private async waitForResponse<T extends ExtensionMessage["resource"]>(
    correlationId: string,
    resource: T
  ): Promise<Extract<ExtensionMessage, { resource: T }>> {
    return new Promise<Extract<ExtensionMessage, { resource: T }>>(
      (resolve, reject) => {
        this.extensionRequestMap.set(correlationId, {
          resolve: resolve as (value: ExtensionMessage) => void,
          resource,
          reject,
        });
        setTimeout(() => {
          if (this.extensionRequestMap.has(correlationId)) {
            this.extensionRequestMap.delete(correlationId);
            reject(`Timed out waiting for '${resource}' response (id: ${correlationId})`);
          }
        }, EXTENSION_RESPONSE_TIMEOUT_MS);
      }
    );
  }
}

export function isErrorMessage(
  message: unknown
): message is ExtensionError {
  return (
    typeof message === "object" &&
    message !== null &&
    "errorMessage" in message &&
    "correlationId" in message
  );
}
