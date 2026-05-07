const { receiveMessages, deleteMessage, parseMessage } = require("./lib/sqs");
const { handleInventoryReserved } = require("./handlers/inventoryReserved");

const HANDLERS = {
  "inventory.reserved": handleInventoryReserved,
};

async function processMessage(message) {
  const event = parseMessage(message);
  const { eventType } = event;

  const handler = HANDLERS[eventType];

  if (!handler) {
    console.log(`[Payment] No handler for event: ${eventType} — skipping`);
    await deleteMessage(message.ReceiptHandle);
    return;
  }

  await handler(event);
  await deleteMessage(message.ReceiptHandle);
}

async function startConsumer() {
  console.log("[Payment] Consumer started. Polling queue...");

  while (true) {
    try {
      const messages = await receiveMessages();

      if (messages.length === 0) {
        continue;
      }

      console.log(`[Payment] Received ${messages.length} message(s)`);

      await Promise.all(messages.map(processMessage));
    } catch (err) {
      console.error("[Payment] Consumer error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { startConsumer };
