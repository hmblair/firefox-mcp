import WebSocket from "ws";
import {
  ExtensionMessage,
  BrowserTab,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
  WS_PORT,
} from "../common";

const EXTENSION_RESPONSE_TIMEOUT_MS = 60_000;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

export class BrowserAPI {
  private ws: WebSocket | null = null;
  private wsServer: WebSocket.Server | null = null;
  private hasConnected = false;
  private hasDisconnected = false;

  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  async init() {
    return new Promise<number>((resolve, reject) => {
      const server = new WebSocket.Server({
        host: "localhost",
        port: WS_PORT,
      });

      server.on("listening", () => {
        this.wsServer = server;
        console.error(`WebSocket server listening on port ${WS_PORT}`);
        resolve(WS_PORT);
      });

      server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          reject(new Error(
            `Port ${WS_PORT} is already in use. Another firefox-mcp instance may be running. Close other Claude Code sessions using firefox-mcp and try again.`
          ));
        } else {
          reject(error);
        }
      });

      server.on("connection", async (connection) => {
        this.ws = connection;
        this.hasConnected = true;
        this.hasDisconnected = false;
        console.error("Firefox extension connected");

        connection.on("close", () => {
          if (this.ws === connection) {
            this.hasDisconnected = true;
            this.ws = null;
            console.error("Firefox extension disconnected");
          } else {
            console.error("Stale Firefox extension connection closed (already replaced)");
          }
        });

        connection.on("message", (message) => {
          const decoded = JSON.parse(message.toString());
          if (isErrorMessage(decoded)) {
            this.handleExtensionError(decoded);
            return;
          }
          this.handleDecodedExtensionMessage(decoded);
        });
      });
    });
  }

  close() {
    this.wsServer?.close();
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
  ): Promise<{ success: boolean; navigated?: boolean; url?: string; title?: string; error?: string }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-element",
      tabId,
      selector,
    });
    const message = await this.waitForResponse(correlationId, "element-clicked");
    return { success: message.success, navigated: message.navigated, url: message.url, title: message.title, error: message.error };
  }

  async typeIntoField(
    tabId: number,
    selector: string,
    text: string,
    clearFirst: boolean,
    submit: boolean
  ): Promise<{ success: boolean; error?: string }> {
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

  async pressKey(
    tabId: number,
    key: string,
    selector?: string
  ): Promise<{ success: boolean; error?: string }> {
    const correlationId = this.sendMessageToExtension({
      cmd: "press-key",
      tabId,
      key,
      selector,
    });
    const message = await this.waitForResponse(correlationId, "key-pressed");
    return { success: message.success, error: message.error };
  }

  async selectOption(
    tabId: number,
    selector: string,
    value: string,
    values?: string[]
  ): Promise<{ success: boolean; error?: string }> {
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

  async takeScreenshot(tabId: number): Promise<string> {
    const correlationId = this.sendMessageToExtension({
      cmd: "take-screenshot",
      tabId,
    });
    const message = await this.waitForResponse(correlationId, "screenshot");
    return message.dataUrl;
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
    if (!this.wsServer) {
      throw new Error(
        "Browser API failed to initialize — no WebSocket port available. Another firefox-mcp instance may already be running. Close other Claude Code sessions using firefox-mcp and try again."
      );
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.hasDisconnected) {
        throw new Error(
          "Firefox extension was connected but disconnected. Check that Firefox is still running and reload the extension in about:debugging."
        );
      } else if (!this.hasConnected) {
        throw new Error(
          "Firefox extension has not connected. Make sure Firefox is running and the extension is loaded (about:debugging > Load Temporary Add-on)."
        );
      }
      throw new Error("Firefox extension is not connected.");
    }

    const correlationId = Math.random().toString(36).substring(2);
    const req: ServerMessageRequest = { ...message, correlationId };

    console.error(`[browser-api] Sending ${req.cmd} (id: ${correlationId})`);
    this.ws.send(JSON.stringify(req));

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
