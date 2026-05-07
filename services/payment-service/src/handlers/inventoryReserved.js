const { updateOrderStatus } = require("../lib/dynamodb");
const { publishEvent } = require("../lib/sns");

// Realistic decline reasons a real payment gateway might return
const DECLINE_REASONS = [
  "Insufficient funds",
  "Card expired",
  "Transaction declined by issuing bank",
  "Suspected fraud — transaction blocked",
];

// Simulates a payment gateway call.
// 80% success rate — gives enough failures to demo the sad path without frustrating demos.
function simulatePaymentGateway(totalAmount) {
  const success = Math.random() > 0.2;

  if (success) {
    return {
      success: true,
      transactionId: `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      chargedAmount: totalAmount,
    };
  }

  return {
    success: false,
    reason: DECLINE_REASONS[Math.floor(Math.random() * DECLINE_REASONS.length)],
  };
}

async function handleInventoryReserved(event) {
  const { orderId, customerId, items, totalAmount } = event.payload;

  console.log(`[Payment] Processing payment for order: ${orderId} | amount: $${totalAmount}`);

  // Simulate network latency of a real payment gateway (300–800ms)
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

  const result = simulatePaymentGateway(totalAmount);

  if (!result.success) {
    console.log(`[Payment] Payment DECLINED for order: ${orderId} | reason: ${result.reason}`);

    await updateOrderStatus(orderId, "PAYMENT_FAILED");
    await publishEvent("payment.failed", {
      orderId,
      customerId,
      reason: result.reason,
      items,
      totalAmount,
    });
    return;
  }

  console.log(`[Payment] Payment SUCCESS for order: ${orderId} | txn: ${result.transactionId}`);

  await updateOrderStatus(orderId, "PAYMENT_PROCESSED", {
    transactionId: result.transactionId,
    chargedAmount: result.chargedAmount,
  });

  await publishEvent("payment.processed", {
    orderId,
    customerId,
    transactionId: result.transactionId,
    chargedAmount: result.chargedAmount,
    items,
  });
}

module.exports = { handleInventoryReserved };
