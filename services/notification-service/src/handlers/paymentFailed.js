const { sendPaymentFailedNotification } = require("../lib/notifier");

async function handlePaymentFailed(event) {
  const { orderId, customerId, reason, totalAmount } = event.payload;

  console.log(`[Notification] Sending payment failure notice for order: ${orderId}`);

  sendPaymentFailedNotification({ orderId, customerId, reason, totalAmount });

  // Status is already PAYMENT_FAILED (set by payment service) — no update needed
}

module.exports = { handlePaymentFailed };
