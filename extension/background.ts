import { WebsocketClient } from "./client";
import { MessageHandler } from "./message-handler";

const wsClient = new WebsocketClient();
const messageHandler = new MessageHandler(wsClient);

wsClient.connect();

wsClient.addMessageListener(async (message) => {
  console.log("Message from server:", message);
  await messageHandler.handleDecodedMessage(message);
});

console.log("Browser extension initialized");
