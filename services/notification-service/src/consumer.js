const { receiveMessages, deleteMessage, parseMessage } = require("./lib/sqs");
const { handlePaymentProcessed } = require("./handlers/paymentProcessed");
const { handlePaymentFailed }    = require("./handlers/paymentFailed");
const { handleInventoryFailed }  = require("./handlers/inventoryFailed");

const HANDLERS = {
  "payment.processed":  handlePaymentProcessed,
  "payment.failed":     handlePaymentFailed,
  "inventory.failed":   handleInventoryFailed,
};

async function processMessage(message) {
  const event = parseMessage(message);
  const { eventType } = event;

  const handler = HANDLERS[eventType];

  if (!handler) {
    console.log(`[Notification] No handler for event: ${eventType} — skipping`);
    await deleteMessage(message.ReceiptHandle);
    return;
  }

  await handler(event);
  await deleteMessage(message.ReceiptHandle);
}

async function startConsumer() {
  console.log("[Notification] Consumer started. Polling queue...");

  while (true) {
    try {
      const messages = await receiveMessages();

      if (messages.length === 0) {
        continue;
      }

      console.log(`[Notification] Received ${messages.length} message(s)`);

      await Promise.all(messages.map(processMessage));
    } catch (err) {
      console.error("[Notification] Consumer error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { startConsumer };
