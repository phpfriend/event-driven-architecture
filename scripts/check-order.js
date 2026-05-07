// Prints the current order record and its full audit event trail.
// Usage: node scripts/check-order.js <orderId>
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env.local") });

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const ddb = DynamoDBDocumentClient.from(client);

async function main() {
  const orderId = process.argv[2];

  if (!orderId) {
    console.error("Usage: node scripts/check-order.js <orderId>");
    process.exit(1);
  }

  // ── Fetch order record ────────────────────────────────────────────────────
  const orderRes = await ddb.send(
    new GetCommand({ TableName: process.env.ORDERS_TABLE, Key: { orderId } })
  );

  if (!orderRes.Item) {
    console.error(`Order not found: ${orderId}`);
    process.exit(1);
  }

  const order = orderRes.Item;

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  Order: ${order.orderId}`);
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Customer    : ${order.customerId}`);
  console.log(`  Status      : ${order.status}`);
  console.log(`  Total       : $${order.totalAmount}`);
  console.log(`  Created     : ${order.createdAt}`);
  console.log(`  Updated     : ${order.updatedAt || "—"}`);

  if (order.transactionId) {
    console.log(`  Transaction : ${order.transactionId}`);
    console.log(`  Charged     : $${order.chargedAmount}`);
  }

  console.log("\n  Items:");
  for (const item of order.items) {
    console.log(`    - ${item.productName} x${item.quantity}  @$${item.unitPrice}  = $${item.lineTotal}`);
  }

  // ── Fetch audit trail ─────────────────────────────────────────────────────
  const eventsRes = await ddb.send(
    new QueryCommand({
      TableName: process.env.EVENTS_TABLE,
      KeyConditionExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
      ScanIndexForward: true,
    })
  );

  const events = eventsRes.Items || [];

  console.log(`\n  Audit Trail (${events.length} event${events.length !== 1 ? "s" : ""}):`);
  console.log("  ─────────────────────────────────────────────────");

  if (events.length === 0) {
    console.log("  No events recorded yet (audit service may still be processing)");
  } else {
    for (const ev of events) {
      console.log(`  [${ev.recordedAt}]  ${ev.eventType}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
