const { getProduct, reserveStock, updateOrderStatus } = require("../lib/dynamodb");
const { publishEvent } = require("../lib/sns");

async function handleOrderCreated(event) {
  const { orderId, customerId, items, totalAmount } = event.payload;

  console.log(`[Inventory] Processing order: ${orderId}`);

  // ── Step 1: Check stock for every item before reserving anything ──────────
  for (const item of items) {
    const product = await getProduct(item.productId);

    if (!product) {
      console.log(`[Inventory] Product not found: ${item.productId} | orderId: ${orderId}`);
      await updateOrderStatus(orderId, "INVENTORY_FAILED");
      await publishEvent("inventory.failed", {
        orderId,
        customerId,
        reason: `Product not found: ${item.productId}`,
      });
      return;
    }

    if (product.stock < item.quantity) {
      console.log(`[Inventory] Out of stock: ${item.productId} (have: ${product.stock}, need: ${item.quantity}) | orderId: ${orderId}`);
      await updateOrderStatus(orderId, "INVENTORY_FAILED");
      await publishEvent("inventory.failed", {
        orderId,
        customerId,
        reason: `Insufficient stock for ${product.productName}. Available: ${product.stock}, Requested: ${item.quantity}`,
      });
      return;
    }
  }

  // ── Step 2: All items available — atomically reserve each one ─────────────
  for (const item of items) {
    try {
      await reserveStock(item.productId, item.quantity);
      console.log(`[Inventory] Reserved ${item.quantity}x ${item.productId} | orderId: ${orderId}`);
    } catch (err) {
      // ConditionalCheckFailedException means stock dropped between check and reserve (race condition)
      if (err.name === "ConditionalCheckFailedException") {
        console.log(`[Inventory] Race condition on ${item.productId} | orderId: ${orderId}`);
        await updateOrderStatus(orderId, "INVENTORY_FAILED");
        await publishEvent("inventory.failed", {
          orderId,
          customerId,
          reason: `Stock no longer available for product: ${item.productId}`,
        });
        return;
      }
      throw err;
    }
  }

  // ── Step 3: All reserved — update order status and notify downstream ──────
  await updateOrderStatus(orderId, "INVENTORY_RESERVED");
  await publishEvent("inventory.reserved", {
    orderId,
    customerId,
    items,
    totalAmount,
  });

  console.log(`[Inventory] Order ${orderId} fully reserved. Status: INVENTORY_RESERVED`);
}

module.exports = { handleOrderCreated };
