const express = require("express");
const { getOrder, getOrderEvents } = require("../lib/dynamodb");

const router = express.Router();

// SSE: streams order status + audit events until terminal state
router.get("/:orderId/stream", async (req, res) => {
  const { orderId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const TERMINAL = new Set(["COMPLETED", "PAYMENT_FAILED", "INVENTORY_FAILED"]);
  const seenEvents = new Set();

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  let lastStatus = null;

  const tick = async () => {
    try {
      const [order, events] = await Promise.all([
        getOrder(orderId),
        getOrderEvents(orderId),
      ]);

      if (!order) {
        send("error", { message: "Order not found" });
        clearInterval(timer);
        res.end();
        return;
      }

      if (order.status !== lastStatus) {
        lastStatus = order.status;
        send("status", { orderId, status: order.status, order });
      }

      for (const ev of events) {
        if (!seenEvents.has(ev.eventId)) {
          seenEvents.add(ev.eventId);
          send("audit", { eventId: ev.eventId, eventType: ev.eventType, recordedAt: ev.recordedAt });
        }
      }

      if (TERMINAL.has(order.status)) {
        clearInterval(timer);
        send("done", { status: order.status });
        res.end();
      }
    } catch (err) {
      send("error", { message: err.message });
      clearInterval(timer);
      res.end();
    }
  };

  const timer = setInterval(tick, 800);
  tick();

  req.on("close", () => clearInterval(timer));
});

// REST: audit log for an order
router.get("/:orderId/events", async (req, res, next) => {
  try {
    const events = await getOrderEvents(req.params.orderId);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
