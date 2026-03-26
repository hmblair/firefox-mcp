import { NativeClient } from "./client";
import { MessageHandler } from "./message-handler";

const client = new NativeClient();
const messageHandler = new MessageHandler(client);

client.connect();

client.addMessageListener(async (message) => {
  console.log("Message from server:", message);
  await messageHandler.handleDecodedMessage(message);
});

console.log("Browser extension initialized");
