import type {
  ExtensionMessage,
  ExtensionError,
  ServerMessageRequest,
} from "../common";
import { NATIVE_APP_NAME } from "../common";

export class NativeClient {
  private port: browser.runtime.Port | null = null;
  private messageCallback: ((data: ServerMessageRequest) => void) | null = null;

  public connect(): void {
    console.log(`[client] Connecting to native host: ${NATIVE_APP_NAME}`);
    this.port = browser.runtime.connectNative(NATIVE_APP_NAME);

    this.port.onMessage.addListener((message: unknown) => {
      if (!this.messageCallback) return;
      try {
        this.messageCallback(message as ServerMessageRequest);
      } catch (error) {
        console.error("[client] Failed to handle message:", error);
      }
    });

    this.port.onDisconnect.addListener(() => {
      const error = browser.runtime.lastError;
      if (error) {
        console.error(`[client] Native host disconnected with error: ${error.message ?? error}`);
      } else {
        console.error("[client] Native host disconnected");
      }
      this.port = null;
    });

    console.log("[client] Connected to native host");
  }

  public addMessageListener(
    callback: (data: ServerMessageRequest) => void
  ): void {
    this.messageCallback = callback;
  }

  public async sendResourceToServer(resource: ExtensionMessage): Promise<void> {
    if (!this.port) {
      console.warn(`[client] Dropping ${resource.resource} response (id: ${resource.correlationId}) — not connected`);
      return;
    }
    this.port.postMessage(resource);
  }

  public async sendErrorToServer(
    correlationId: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.port) {
      console.warn(`[client] Dropping error response (id: ${correlationId}) — not connected. Error was: ${errorMessage}`);
      return;
    }
    const extensionError: ExtensionError = {
      correlationId,
      errorMessage,
    };
    this.port.postMessage(extensionError);
  }
}
