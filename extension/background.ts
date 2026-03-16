import { WS_PORT } from "../common";
import { WebsocketClient } from "./client";
import { MessageHandler } from "./message-handler";

const wsClient = new WebsocketClient(WS_PORT);
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

console.log("Browser extension initialized");
