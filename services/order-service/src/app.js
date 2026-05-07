const path = require("path");
const express = require("express");
const ordersRouter = require("./routes/orders");
const productsRouter = require("./routes/products");
const streamRouter = require("./routes/stream");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ service: "order-service", status: "ok", timestamp: new Date().toISOString() });
});

app.use("/orders", ordersRouter);
app.use("/products", productsRouter);
app.use("/orders", streamRouter);

app.use((err, req, res, next) => {
  console.error("[Order Service] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
