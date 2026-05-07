require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env.local") });

const { startConsumer } = require("./consumer");

console.log("[Notification Service] Starting...");
console.log(`[Notification Service] Queue: ${process.env.NOTIFICATION_QUEUE_URL}`);

startConsumer().catch((err) => {
  console.error("[Notification Service] Fatal error:", err.message);
  process.exit(1);
});
