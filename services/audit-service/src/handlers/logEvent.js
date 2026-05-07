const { appendEvent } = require("../lib/dynamodb");

// All event types flow through this single handler.
// The audit service does not care what the event means — it records everything.
async function logEvent(event) {
  const { eventType, timestamp, payload } = event;
  const { orderId } = payload;

  // eventId is timestamp-prefixed so records are naturally sortable by time
  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const entry = {
    orderId,
    eventId,
    eventType,
    payload,
    recordedAt: timestamp,
    storedAt: new Date().toISOString(),
  };

  await appendEvent(entry);

  console.log(`[Audit] Logged: ${eventType} | orderId: ${orderId} | eventId: ${eventId}`);
}

module.exports = { logEvent };
