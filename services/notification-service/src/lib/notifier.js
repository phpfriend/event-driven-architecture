// Simulates an email/SMS gateway (e.g. SendGrid, Twilio).
// In production this would call a real provider SDK.
// Logs a formatted message to stdout so the demo output is readable.

function sendOrderConfirmation({ orderId, customerId, items, transactionId, chargedAmount }) {
  const itemLines = items
    .map((i) => `  - ${i.productName} x${i.quantity}  $${i.lineTotal.toFixed(2)}`)
    .join("\n");

  console.log(`
┌─────────────────────────────────────────────┐
│         📦  ORDER CONFIRMED                  │
├─────────────────────────────────────────────┤
│  To       : ${customerId.padEnd(32)}│
│  Order    : ${orderId.padEnd(32)}│
│  Txn      : ${transactionId.padEnd(32)}│
│  Charged  : $${String(chargedAmount.toFixed(2)).padEnd(31)}│
├─────────────────────────────────────────────┤
│  Items:                                     │
${itemLines}
├─────────────────────────────────────────────┤
│  Estimated delivery: 3–5 business days      │
└─────────────────────────────────────────────┘`);
}

function sendPaymentFailedNotification({ orderId, customerId, reason, totalAmount }) {
  console.log(`
┌─────────────────────────────────────────────┐
│         ❌  PAYMENT FAILED                   │
├─────────────────────────────────────────────┤
│  To       : ${customerId.padEnd(32)}│
│  Order    : ${orderId.padEnd(32)}│
│  Amount   : $${String(totalAmount.toFixed(2)).padEnd(31)}│
├─────────────────────────────────────────────┤
│  Reason: ${reason.slice(0, 38).padEnd(38)} │
├─────────────────────────────────────────────┤
│  Please update your payment method and      │
│  try again.                                 │
└─────────────────────────────────────────────┘`);
}

function sendOutOfStockNotification({ orderId, customerId, reason }) {
  console.log(`
┌─────────────────────────────────────────────┐
│         ⚠️   OUT OF STOCK                    │
├─────────────────────────────────────────────┤
│  To       : ${customerId.padEnd(32)}│
│  Order    : ${orderId.padEnd(32)}│
├─────────────────────────────────────────────┤
│  ${reason.slice(0, 44).padEnd(44)} │
├─────────────────────────────────────────────┤
│  No payment was taken. Please check back    │
│  when stock is replenished.                 │
└─────────────────────────────────────────────┘`);
}

module.exports = {
  sendOrderConfirmation,
  sendPaymentFailedNotification,
  sendOutOfStockNotification,
};
