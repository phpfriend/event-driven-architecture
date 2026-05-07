const { receiveMessages, deleteMessage, parseMessage } = require("./lib/sqs");
const { handleOrderCreated } = require("./handlers/orderCreated");

const HANDLERS = {
  "order.created": handleOrderCreated,
};

async function processMessage(message) {
  const event = parseMessage(message);
  const { eventType } = event;

  const handler = HANDLERS[eventType];

  if (!handler) {
    // Unknown event type — delete it so it doesn't clog the queue
    console.log(`[Inventory] No handler for event: ${eventType} — skipping`);
    await deleteMessage(message.ReceiptHandle);
    return;
  }

  await handler(event);

  // Only delete after successful processing.
  // If handler throws, message stays in queue → SQS retries → DLQ after 3 fails.
  await deleteMessage(message.ReceiptHandle);
}

async function startConsumer() {
  console.log("[Inventory] Consumer started. Polling queue...");

  while (true) {
    try {
      const messages = await receiveMessages();

      if (messages.length === 0) {
        continue; // long-poll returned empty — loop again
      }

      console.log(`[Inventory] Received ${messages.length} message(s)`);

      await Promise.all(messages.map(processMessage));
    } catch (err) {
      console.error("[Inventory] Consumer error:", err.message);
      // Brief pause before retrying to avoid hammering the queue on persistent errors
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { startConsumer };
