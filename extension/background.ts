import { WS_PORTS } from "../common";
import { WebsocketClient } from "./client";
import { MessageHandler } from "./message-handler";

function initClient(port: number) {
  const wsClient = new WebsocketClient(port);
  const messageHandler = new MessageHandler(wsClient);

  wsClient.connect();

  wsClient.addMessageListener(async (message) => {
    console.log("Message from server:", message);

    try {
      await messageHandler.handleDecodedMessage(message);
    } catch (error) {
      console.error("Error handling message:", error);
      if (error instanceof Error) {
        await wsClient.sendErrorToServer(
          message.correlationId,
          error.message
        );
      }
    }
  });
}

for (const port of WS_PORTS) {
  initClient(port);
}
console.log("Browser extension initialized");
