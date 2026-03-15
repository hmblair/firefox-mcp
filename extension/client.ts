import type {
  ExtensionMessage,
  ExtensionError,
  ServerMessageRequest,
} from "../common";

export class WebsocketClient {
  private socket: WebSocket | null = null;
  private readonly port: number;
  private reconnectInterval: number = 2000; // 2 seconds
  private reconnectTimer: number | null = null;
  private messageCallback: ((data: ServerMessageRequest) => void) | null = null;

  constructor(port: number) {
    this.port = port;
  }

  public connect(): void {
    console.log("Connecting to WebSocket server");

    this.socket = new WebSocket(`ws://localhost:${this.port}`);

    this.socket.addEventListener("open", () => {
      console.log("Connected to WebSocket server at port", this.port);
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;
    });

    this.socket.addEventListener("message", async (event) => {
      if (!this.messageCallback) {
        return;
      }
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

    // Start reconnection timer if not already running
    if (this.reconnectTimer === null) {
      this.startReconnectTimer();
    }
  }

  public addMessageListener(
    callback: (data: ServerMessageRequest) => void
  ): void {
    this.messageCallback = callback;
  }

  private startReconnectTimer(): void {
    this.reconnectTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        console.log("[client] Attempting reconnection to WebSocket server");
        this.connect();
      }
    }, this.reconnectInterval);
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
      errorMessage: errorMessage,
    };
    this.socket.send(JSON.stringify(extensionError));
  }

  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
