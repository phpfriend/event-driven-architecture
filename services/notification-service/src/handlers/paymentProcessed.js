const { updateOrderStatus } = require("../lib/dynamodb");
const { sendOrderConfirmation } = require("../lib/notifier");

async function handlePaymentProcessed(event) {
  const { orderId, customerId, transactionId, chargedAmount, items } = event.payload;

  console.log(`[Notification] Sending confirmation for order: ${orderId}`);

  sendOrderConfirmation({ orderId, customerId, items, transactionId, chargedAmount });

  // Notification is the final step — mark the order as fully complete
  await updateOrderStatus(orderId, "COMPLETED");

  console.log(`[Notification] Order ${orderId} marked COMPLETED`);
}

module.exports = { handlePaymentProcessed };
