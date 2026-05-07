const { sendOutOfStockNotification } = require("../lib/notifier");

async function handleInventoryFailed(event) {
  const { orderId, customerId, reason } = event.payload;

  console.log(`[Notification] Sending out-of-stock notice for order: ${orderId}`);

  sendOutOfStockNotification({ orderId, customerId, reason });

  // Status is already INVENTORY_FAILED (set by inventory service) — no update needed
}

module.exports = { handleInventoryFailed };
