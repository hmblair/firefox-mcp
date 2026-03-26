import type {
  ExtensionMessage,
  ExtensionError,
  ServerMessageRequest,
} from "../common";
import { WS_PORT } from "../common";

const RECONNECT_INTERVAL_MS = 2000;
const CONNECTING_TIMEOUT_MS = 2000;

export class WebsocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private connectingSince: number | null = null;
  private messageCallback: ((data: ServerMessageRequest) => void) | null = null;

  public connect(): void {
    console.log(`Connecting to WebSocket server on port ${WS_PORT}`);
    this.createSocket();
    this.reconnectTimer = window.setInterval(() => {
      if (
        this.socket?.readyState === WebSocket.CONNECTING &&
        this.connectingSince &&
        Date.now() - this.connectingSince > CONNECTING_TIMEOUT_MS
      ) {
        console.warn("[client] Connection attempt timed out, aborting");
        this.socket.close();
        this.socket = null;
        this.connectingSince = null;
      }

      if (
        !this.socket ||
        (this.socket.readyState !== WebSocket.OPEN &&
          this.socket.readyState !== WebSocket.CONNECTING)
      ) {
        console.log("[client] Attempting reconnection to WebSocket server");
        this.createSocket();
      }
    }, RECONNECT_INTERVAL_MS);
  }

  private createSocket(): void {
    this.socket = new WebSocket(`ws://localhost:${WS_PORT}`);
    this.connectingSince = Date.now();

    this.socket.addEventListener("open", () => {
      this.connectingSince = null;
      console.log(`Connected to WebSocket server on port ${WS_PORT}`);
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;
    });

    this.socket.addEventListener("message", async (event) => {
      if (!this.messageCallback) return;
      try {
        const message = JSON.parse(event.data);
        this.messageCallback(message);
      } catch (error) {
        console.error("Failed to parse message:", error);
      }
    });

    this.socket.addEventListener("error", (event) => {
      console.error("WebSocket error:", event);
      this.socket && this.socket.close();
    });
  }

  public addMessageListener(
    callback: (data: ServerMessageRequest) => void
  ): void {
    this.messageCallback = callback;
  }

  public async sendResourceToServer(resource: ExtensionMessage): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`[client] Dropping ${resource.resource} response (id: ${resource.correlationId}) — socket is not open`);
      return;
    }
    this.socket.send(JSON.stringify(resource));
  }

  public async sendErrorToServer(
    correlationId: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn(`[client] Dropping error response (id: ${correlationId}) — socket is not open. Error was: ${errorMessage}`);
      return;
    }
    const extensionError: ExtensionError = {
      correlationId,
      errorMessage,
    };
    this.socket.send(JSON.stringify(extensionError));
  }
}
