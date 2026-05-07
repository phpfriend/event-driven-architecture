require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env.local") });

const { startConsumer } = require("./consumer");

console.log("[Payment Service] Starting...");
console.log(`[Payment Service] Queue: ${process.env.PAYMENT_QUEUE_URL}`);
console.log(`[Payment Service] SNS Topic: ${process.env.SNS_TOPIC_ARN}`);

startConsumer().catch((err) => {
  console.error("[Payment Service] Fatal error:", err.message);
  process.exit(1);
});
