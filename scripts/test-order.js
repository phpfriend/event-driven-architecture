// Places two test orders and polls until each reaches a terminal status.
// Run after all services are up: npm run test:order
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env.local") });

const http = require("http");

const ORDER_SERVICE_URL = "http://localhost:3000";

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "PAYMENT_FAILED",
  "INVENTORY_FAILED",
]);

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "localhost",
      port: 3000,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${ORDER_SERVICE_URL}${path}`, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Poll until terminal state ─────────────────────────────────────────────────

async function pollUntilDone(orderId, label) {
  console.log(`\n  Polling status for ${orderId}...`);
  const MAX_ATTEMPTS = 20;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await sleep(1500);
    const res = await httpGet(`/orders/${orderId}`);
    const { status } = res.body;
    process.stdout.write(`  [${i + 1}] status: ${status}\n`);

    if (TERMINAL_STATUSES.has(status)) {
      console.log(`\n  ✓ ${label} reached terminal state: ${status}`);
      return res.body;
    }
  }

  console.log(`  ✗ ${label} did not reach terminal state within timeout`);
  return null;
}

// ── Test scenarios ────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ShopFlow — End-to-End Test");
  console.log("═══════════════════════════════════════════════════\n");

  // ── Scenario 1: Happy path (PROD-001 has 15 units in stock) ──
  console.log("Scenario 1: Happy path — 2x Wireless Headphones");
  console.log("─────────────────────────────────────────────────");

  const res1 = await httpPost("/orders", {
    customerId: "CUST-001",
    items: [{ productId: "PROD-001", quantity: 2 }],
  });

  if (res1.status !== 201) {
    console.error("  ✗ Failed to place order:", res1.body);
  } else {
    console.log(`  Order placed: ${res1.body.orderId} | $${res1.body.totalAmount}`);
    const final1 = await pollUntilDone(res1.body.orderId, "Scenario 1");
    if (final1) {
      console.log(`  transactionId : ${final1.transactionId || "N/A"}`);
      console.log(`  chargedAmount : ${final1.chargedAmount ? "$" + final1.chargedAmount : "N/A"}`);
    }
  }

  await sleep(1000);

  // ── Scenario 2: Out of stock (PROD-002 has 0 units) ──
  console.log("\nScenario 2: Out of stock — 1x Mechanical Keyboard");
  console.log("─────────────────────────────────────────────────");

  const res2 = await httpPost("/orders", {
    customerId: "CUST-002",
    items: [{ productId: "PROD-002", quantity: 1 }],
  });

  if (res2.status !== 201) {
    console.error("  ✗ Failed to place order:", res2.body);
  } else {
    console.log(`  Order placed: ${res2.body.orderId} | $${res2.body.totalAmount}`);
    await pollUntilDone(res2.body.orderId, "Scenario 2");
  }

  await sleep(1000);

  // ── Scenario 3: Multi-item order ──
  console.log("\nScenario 3: Multi-item — Headphones + USB-C Hub");
  console.log("─────────────────────────────────────────────────");

  const res3 = await httpPost("/orders", {
    customerId: "CUST-003",
    items: [
      { productId: "PROD-001", quantity: 1 },
      { productId: "PROD-003", quantity: 3 },
    ],
  });

  if (res3.status !== 201) {
    console.error("  ✗ Failed to place order:", res3.body);
  } else {
    console.log(`  Order placed: ${res3.body.orderId} | $${res3.body.totalAmount}`);
    await pollUntilDone(res3.body.orderId, "Scenario 3");
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Tests complete. Check service terminals for the");
  console.log("  full event chain and notification output.");
  console.log("═══════════════════════════════════════════════════\n");
  console.log("  To inspect audit trail for any order:");
  console.log("  node scripts/check-order.js <orderId>\n");
}

runTests().catch((err) => {
  console.error("\nTest failed:", err.message);
  console.error("Is the Order Service running? (npm run dev:all)\n");
  process.exit(1);
});
