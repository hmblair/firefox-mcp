import WebSocket from "ws";
import {
  ExtensionMessage,
  BrowserTab,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
} from "../common";
import { isPortInUse } from "./util";
import { join } from "path";
import { readFile } from "fs/promises";
import * as crypto from "crypto";

// Support up to two initializations of the MCP server by clients
// More initializations will result in EDADDRINUSE errors
const WS_PORTS = [8081, 8082];
const EXTENSION_RESPONSE_TIMEOUT_MS = 60_000;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

export class BrowserAPI {
  private ws: WebSocket | null = null;
  private wsServer: WebSocket.Server | null = null;
  private sharedSecret: string | null = null;
  private hasConnected = false;
  private hasDisconnected = false;
  private hadSignatureMismatch = false;

  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  async init() {
    const { secret } = await readConfig();
    if (!secret) {
      throw new Error("Secret not found in config.json");
    }
    this.sharedSecret = secret;

    let selectedPort = null;

    for (const port of WS_PORTS) {
      if (!(await isPortInUse(port))) {
        selectedPort = port;
        break;
      }
    }
    if (!selectedPort) {
      throw new Error("All available ports are in use");
    }

    this.wsServer = new WebSocket.Server({
      host: "localhost",
      port: selectedPort,
    });
    this.wsServer.on("connection", async (connection) => {
      this.ws = connection;
      this.hasConnected = true;
      this.hasDisconnected = false;
      this.hadSignatureMismatch = false;
      console.error("Firefox extension connected");

      this.ws.on("close", () => {
        this.hasDisconnected = true;
        this.ws = null;
        console.error("Firefox extension disconnected");
      });

      this.ws.on("message", (message) => {
        const decoded = JSON.parse(message.toString());
        if (isErrorMessage(decoded)) {
          this.handleExtensionError(decoded);
          return;
        }
        const signature = this.createSignature(JSON.stringify(decoded.payload));
        if (signature !== decoded.signature) {
          this.hadSignatureMismatch = true;
          console.error("Invalid message signature — shared secret mismatch. Rebuild the project and reload the extension.");
          return;
        }
        this.handleDecodedExtensionMessage(decoded.payload);
      });
    });
    this.wsServer.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });
    return selectedPort;
  }

  close() {
    this.wsServer?.close();
  }

  getSelectedPort() {
    return this.wsServer?.options.port;
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

  async getInteractiveElements(tabId: number) {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-interactive-elements",
      tabId,
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
  ): Promise<boolean> {
    const correlationId = this.sendMessageToExtension({
      cmd: "type-into-field",
      tabId,
      selector,
      text,
      clearFirst,
      submit,
    });
    const message = await this.waitForResponse(correlationId, "text-typed");
    return message.success;
  }

  async pressKey(
    tabId: number,
    key: string,
    selector?: string
  ): Promise<boolean> {
    const correlationId = this.sendMessageToExtension({
      cmd: "press-key",
      tabId,
      key,
      selector,
    });
    const message = await this.waitForResponse(correlationId, "key-pressed");
    return message.success;
  }

  async selectOption(
    tabId: number,
    selector: string,
    value: string
  ): Promise<boolean> {
    const correlationId = this.sendMessageToExtension({
      cmd: "select-option",
      tabId,
      selector,
      value,
    });
    const message = await this.waitForResponse(
      correlationId,
      "option-selected"
    );
    return message.success;
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

  private createSignature(payload: string): string {
    if (!this.sharedSecret) {
      throw new Error("Shared secret not initialized");
    }
    const hmac = crypto.createHmac("sha256", this.sharedSecret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  private sendMessageToExtension(message: ServerMessage): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.hadSignatureMismatch) {
        throw new Error(
          "Firefox extension connected but has a mismatched shared secret. Rebuild the project (make build) and reload the extension in about:debugging."
        );
      } else if (this.hasDisconnected) {
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
    const payload = JSON.stringify(req);
    const signature = this.createSignature(payload);
    const signedMessage = {
      payload: req,
      signature: signature,
    };

    console.error(`[browser-api] Sending ${req.cmd} (id: ${correlationId})`);
    this.ws.send(JSON.stringify(signedMessage));

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

async function readConfig() {
  const configPath = join(__dirname, "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  return config;
}

export function isErrorMessage(
  message: any
): message is ExtensionError {
  return (
    message.errorMessage !== undefined &&
    message.correlationId !== undefined
  );
}