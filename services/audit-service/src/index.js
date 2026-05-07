require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env.local") });

const { startConsumer } = require("./consumer");

console.log("[Audit Service] Starting...");
console.log(`[Audit Service] Queue:  ${process.env.AUDIT_QUEUE_URL}`);
console.log(`[Audit Service] Table:  ${process.env.EVENTS_TABLE}`);

startConsumer().catch((err) => {
  console.error("[Audit Service] Fatal error:", err.message);
  process.exit(1);
});
