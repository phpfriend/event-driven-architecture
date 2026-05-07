require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env.local") });

const { startConsumer } = require("./consumer");

console.log("[Inventory Service] Starting...");
console.log(`[Inventory Service] Queue: ${process.env.INVENTORY_QUEUE_URL}`);
console.log(`[Inventory Service] SNS Topic: ${process.env.SNS_TOPIC_ARN}`);

startConsumer().catch((err) => {
  console.error("[Inventory Service] Fatal error:", err.message);
  process.exit(1);
});
