const { receiveMessages, deleteMessage, parseMessage } = require("./lib/sqs");
const { logEvent } = require("./handlers/logEvent");

// Known event types the audit service expects to see.
// Any event outside this list is still logged — audit service is intentionally permissive.
const KNOWN_EVENTS = new Set([
  "order.created",
  "inventory.reserved",
  "inventory.failed",
  "payment.processed",
  "payment.failed",
]);

async function processMessage(message) {
  const event = parseMessage(message);

  if (!KNOWN_EVENTS.has(event.eventType)) {
    console.log(`[Audit] Unknown event type: ${event.eventType} — logging anyway`);
  }

  await logEvent(event);
  await deleteMessage(message.ReceiptHandle);
}

async function startConsumer() {
  console.log("[Audit] Consumer started. Polling queue...");

  while (true) {
    try {
      const messages = await receiveMessages();

      if (messages.length === 0) {
        continue;
      }

      console.log(`[Audit] Received ${messages.length} message(s)`);

      // Process sequentially to preserve event order in DynamoDB writes
      for (const message of messages) {
        await processMessage(message);
      }
    } catch (err) {
      console.error("[Audit] Consumer error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { startConsumer };
