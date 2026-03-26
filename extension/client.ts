import type {
  ExtensionMessage,
  ExtensionError,
  ServerMessageRequest,
} from "../common";
import { WS_PORT } from "../common";

const RECONNECT_DELAY_MS = 500;

export class WebsocketClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private messageCallback: ((data: ServerMessageRequest) => void) | null = null;
  private attemptCount = 0;
  private disconnectedAt: number | null = null;

  public connect(): void {
    console.log(`[client] Connecting to WebSocket server on port ${WS_PORT}`);
    this.createSocket();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptCount++;
      const elapsed = this.disconnectedAt
        ? ((Date.now() - this.disconnectedAt) / 1000).toFixed(1)
        : "?";
      console.log(`[client] Reconnect attempt ${this.attemptCount} (disconnected ${elapsed}s ago)`);
      this.createSocket();
    }, RECONNECT_DELAY_MS);
  }

  private createSocket(): void {
    this.socket = new WebSocket(`ws://localhost:${WS_PORT}`);

    this.socket.addEventListener("open", () => {
      if (this.attemptCount > 0) {
        const elapsed = this.disconnectedAt
          ? ((Date.now() - this.disconnectedAt) / 1000).toFixed(1)
          : "?";
        console.log(`[client] Reconnected after ${this.attemptCount} attempt(s) (${elapsed}s)`);
      } else {
        console.log(`[client] Connected to WebSocket server on port ${WS_PORT}`);
      }
      this.attemptCount = 0;
      this.disconnectedAt = null;
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;
      if (this.disconnectedAt === null) {
        this.disconnectedAt = Date.now();
      }
      this.scheduleReconnect();
    });

    this.socket.addEventListener("message", async (event) => {
      if (!this.messageCallback) return;
      try {
        const message = JSON.parse(event.data);
        this.messageCallback(message);
      } catch (error) {
        console.error("[client] Failed to parse message:", error);
      }
    });

    this.socket.addEventListener("error", () => {
      if (this.socket) {
        this.socket.close();
      }
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
