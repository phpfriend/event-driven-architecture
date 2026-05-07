const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { saveOrder, getOrder, getProduct } = require("../lib/dynamodb");
const { publishEvent } = require("../lib/sns");

const router = express.Router();

// POST /orders — customer places a new order
router.post("/", async (req, res) => {
  const { customerId, items } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "customerId and a non-empty items array are required",
    });
  }

  for (const item of items) {
    if (!item.productId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({
        error: "Each item must have a productId and quantity >= 1",
      });
    }
  }

  // ── Look up product prices from inventory table ───────────────────────────
  const enrichedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const product = await getProduct(item.productId);

    if (!product) {
      return res.status(404).json({
        error: `Product not found: ${item.productId}`,
      });
    }

    const lineTotal = parseFloat((product.price * item.quantity).toFixed(2));
    totalAmount += lineTotal;

    enrichedItems.push({
      productId: item.productId,
      productName: product.productName,
      quantity: item.quantity,
      unitPrice: product.price,
      lineTotal,
    });
  }

  totalAmount = parseFloat(totalAmount.toFixed(2));

  // ── Build and save order record ───────────────────────────────────────────
  const order = {
    orderId: `ORD-${uuidv4().slice(0, 8).toUpperCase()}`,
    customerId,
    items: enrichedItems,
    totalAmount,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };

  await saveOrder(order);
  console.log(`[Order Service] Order saved: ${order.orderId} | status: PENDING`);

  // ── Publish order.created event to SNS ───────────────────────────────────
  await publishEvent("order.created", {
    orderId: order.orderId,
    customerId: order.customerId,
    items: order.items,
    totalAmount: order.totalAmount,
  });

  return res.status(201).json({
    message: "Order placed successfully",
    orderId: order.orderId,
    status: order.status,
    totalAmount: order.totalAmount,
    items: order.items,
  });
});

// GET /orders/:orderId — fetch current order status
router.get("/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const order = await getOrder(orderId);

  if (!order) {
    return res.status(404).json({ error: `Order not found: ${orderId}` });
  }

  return res.json(order);
});

module.exports = router;
