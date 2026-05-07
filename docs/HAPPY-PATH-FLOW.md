# ShopFlow — Happy Path Flow

## Scenario

Customer **Alice** wants to buy **2 units of Wireless Headphones** (PROD-001, $49.99 each).

- Total amount: **$99.98**
- Stock available: **15 units**
- Payment outcome: **Success**

---

## End-to-End Sequence

```
Step 1   Customer           POST /orders
Step 2   Order Service      Validates → saves to DynamoDB → publishes order.created
Step 3   SNS Topic          Fans out to all 4 SQS queues simultaneously
Step 4   Inventory Service  Checks stock → reserves atomically → publishes inventory.reserved
         Audit Service      Logs order.created  (parallel with Step 4)
Step 5   SNS Topic          Fans out inventory.reserved to Payment + Audit + Notification queues
Step 6   Payment Service    Charges card → publishes payment.processed
         Audit Service      Logs inventory.reserved  (parallel with Step 6)
Step 7   SNS Topic          Fans out payment.processed to Notification + Audit queues
Step 8   Notification Svc   Sends confirmation email → marks order COMPLETED
         Audit Service      Logs payment.processed  (parallel with Step 8)
```

**Total time: ~3 seconds**
**Customer HTTP response: returned in milliseconds at Step 2**

---

## Step-by-Step Detail

### Step 1 — Customer Places Order

The customer calls the Order Service REST API:

```
POST http://localhost:3000/orders
Content-Type: application/json

{
  "customerId": "CUST-001",
  "items": [
    { "productId": "PROD-001", "quantity": 2 }
  ]
}
```

---

### Step 2 — Order Service

**File:** `services/order-service/src/routes/orders.js`

Actions performed in sequence:

1. **Validate** — `customerId` present, `items` array non-empty, each item has `productId` and `quantity >= 1`
2. **Price lookup** — fetches PROD-001 from `shopflow-inventory` DynamoDB table → price: $49.99
3. **Calculate total** — 2 × $49.99 = **$99.98**
4. **Build order record:**

```json
{
  "orderId":     "ORD-A1B2C3D4",
  "customerId":  "CUST-001",
  "status":      "PENDING",
  "totalAmount": 99.98,
  "items": [
    {
      "productId":   "PROD-001",
      "productName": "Wireless Headphones",
      "quantity":    2,
      "unitPrice":   49.99,
      "lineTotal":   99.98
    }
  ],
  "createdAt": "2026-05-07T10:00:00.000Z"
}
```

5. **Save to DynamoDB** — writes to `shopflow-orders` table with `status: PENDING`
6. **Publish to SNS** — publishes `order.created` event:

```json
{
  "eventType": "order.created",
  "version":   "1.0",
  "timestamp": "2026-05-07T10:00:00.000Z",
  "payload": {
    "orderId":     "ORD-A1B2C3D4",
    "customerId":  "CUST-001",
    "totalAmount": 99.98,
    "items": [ ... ]
  }
}
```

7. **Return 201** to customer immediately — no waiting for inventory or payment:

```json
{
  "message":     "Order placed successfully",
  "orderId":     "ORD-A1B2C3D4",
  "status":      "PENDING",
  "totalAmount": 99.98
}
```

> **Why return immediately?** The Order Service's job ends here. Everything downstream happens asynchronously. The customer is not kept waiting while inventory checks or payment processing occur.

---

### Step 3 — SNS Fan-out

SNS topic `shopflow-orders` delivers a copy of `order.created` to **all 4 subscriber queues simultaneously**:

| Queue | Who reads it |
|-------|-------------|
| `shopflow-inventory-queue` | Inventory Service |
| `shopflow-payment-queue` | Payment Service (skips — no handler for `order.created`) |
| `shopflow-notification-queue` | Notification Service (skips — no handler for `order.created`) |
| `shopflow-audit-queue` | Audit Service |

> **Fan-out pattern:** One publish, four deliveries. Adding a fifth service (e.g. Fraud Detection) requires zero changes to any existing service — just subscribe a new queue to the same SNS topic.

---

### Step 4 — Inventory Service + Audit Service (Parallel)

Both services process their copy of `order.created` independently and simultaneously.

**File:** `services/inventory-service/src/handlers/orderCreated.js`

#### Inventory Service

**Phase A — Check stock (all items first):**
- Queries `shopflow-inventory` for PROD-001 → stock: 15, need: 2 ✓

**Phase B — Reserve stock atomically:**
```
UpdateExpression:     SET stock = stock - :qty
ConditionExpression:  stock >= :qty
ExpressionAttributeValues: { ":qty": 2 }
```

DynamoDB decrements stock from 15 → 13 atomically.

> **Why ConditionExpression?** If two orders simultaneously try to buy the last unit, the condition rejects one at the database level. Without it, both could read stock = 1, both pass, and stock would go to -1 (overselling).

Inventory Service then:
- Updates order status in DynamoDB → `INVENTORY_RESERVED`
- Publishes `inventory.reserved` back to SNS

```json
{
  "eventType": "inventory.reserved",
  "payload": {
    "orderId":     "ORD-A1B2C3D4",
    "customerId":  "CUST-001",
    "totalAmount": 99.98,
    "items": [ ... ]
  }
}
```

- Deletes message from SQS (success)

#### Audit Service (parallel)

**File:** `services/audit-service/src/handlers/logEvent.js`

Writes **Record #1** to `shopflow-events` table:

```json
{
  "orderId":    "ORD-A1B2C3D4",
  "eventId":    "1746612000123-xk9f2a",
  "eventType":  "order.created",
  "payload":    { ... full event snapshot ... },
  "recordedAt": "2026-05-07T10:00:00.000Z",
  "storedAt":   "2026-05-07T10:00:00.456Z"
}
```

---

### Step 5 — SNS Fan-out (inventory.reserved)

Inventory Service publishes back to the **same SNS topic** (`shopflow-orders`). SNS fans out `inventory.reserved` to all 4 queues again:

| Queue | Who reads it | Action |
|-------|-------------|--------|
| `shopflow-inventory-queue` | Inventory Service | Skips — no handler for `inventory.reserved` |
| `shopflow-payment-queue` | Payment Service | **Processes it** |
| `shopflow-notification-queue` | Notification Service | Skips — no handler for `inventory.reserved` |
| `shopflow-audit-queue` | Audit Service | **Logs it** |

---

### Step 6 — Payment Service + Audit Service (Parallel)

**File:** `services/payment-service/src/handlers/inventoryReserved.js`

#### Payment Service

1. Extracts `orderId`, `customerId`, `totalAmount` from event payload
2. Simulates gateway network delay: **300–800ms**
3. Payment gateway returns **success** (80% probability in simulation)
4. Generates transaction ID: `TXN-1746612001-XK9F2A`
5. Updates order record in DynamoDB:

```json
{
  "status":        "PAYMENT_PROCESSED",
  "transactionId": "TXN-1746612001-XK9F2A",
  "chargedAmount": 99.98,
  "updatedAt":     "2026-05-07T10:00:02.000Z"
}
```

6. Publishes `payment.processed` back to SNS:

```json
{
  "eventType": "payment.processed",
  "payload": {
    "orderId":       "ORD-A1B2C3D4",
    "customerId":    "CUST-001",
    "transactionId": "TXN-1746612001-XK9F2A",
    "chargedAmount": 99.98,
    "items":         [ ... ]
  }
}
```

7. Deletes message from SQS

#### Audit Service (parallel)

Writes **Record #2** to `shopflow-events`:

```json
{
  "orderId":   "ORD-A1B2C3D4",
  "eventId":   "1746612001456-mn3p7q",
  "eventType": "inventory.reserved",
  "recordedAt":"2026-05-07T10:00:01.000Z"
}
```

---

### Step 7 — SNS Fan-out (payment.processed)

Payment Service publishes back to the same SNS topic. SNS fans out `payment.processed`:

| Queue | Who reads it | Action |
|-------|-------------|--------|
| `shopflow-inventory-queue` | Inventory Service | Skips |
| `shopflow-payment-queue` | Payment Service | Skips |
| `shopflow-notification-queue` | Notification Service | **Processes it** |
| `shopflow-audit-queue` | Audit Service | **Logs it** |

---

### Step 8 — Notification Service + Audit Service (Parallel)

**File:** `services/notification-service/src/handlers/paymentProcessed.js`

#### Notification Service

1. Receives `payment.processed` event
2. Sends order confirmation to customer (logged to console in demo):

```
┌─────────────────────────────────────────────┐
│         📦  ORDER CONFIRMED                  │
├─────────────────────────────────────────────┤
│  To       : CUST-001                        │
│  Order    : ORD-A1B2C3D4                    │
│  Txn      : TXN-1746612001-XK9F2A          │
│  Charged  : $99.98                          │
├─────────────────────────────────────────────┤
│  Items:                                     │
  - Wireless Headphones x2  $99.98
├─────────────────────────────────────────────┤
│  Estimated delivery: 3–5 business days      │
└─────────────────────────────────────────────┘
```

3. Updates order status in DynamoDB → **`COMPLETED`**
4. Deletes message from SQS

#### Audit Service (parallel)

Writes **Record #3** to `shopflow-events`:

```json
{
  "orderId":   "ORD-A1B2C3D4",
  "eventId":   "1746612002789-rz5t1w",
  "eventType": "payment.processed",
  "recordedAt":"2026-05-07T10:00:02.000Z"
}
```

---

## Final State

### Order record in DynamoDB (`shopflow-orders`)

```json
{
  "orderId":       "ORD-A1B2C3D4",
  "customerId":    "CUST-001",
  "status":        "COMPLETED",
  "totalAmount":   99.98,
  "transactionId": "TXN-1746612001-XK9F2A",
  "chargedAmount": 99.98,
  "createdAt":     "2026-05-07T10:00:00.000Z",
  "updatedAt":     "2026-05-07T10:00:03.000Z",
  "items": [
    {
      "productId":   "PROD-001",
      "productName": "Wireless Headphones",
      "quantity":    2,
      "unitPrice":   49.99,
      "lineTotal":   99.98
    }
  ]
}
```

### Audit trail in DynamoDB (`shopflow-events`)

```
orderId: ORD-A1B2C3D4
──────────────────────────────────────────────────────────
Record 1  [10:00:00Z]  order.created
Record 2  [10:00:01Z]  inventory.reserved
Record 3  [10:00:02Z]  payment.processed
```

### Inventory in DynamoDB (`shopflow-inventory`)

```
PROD-001  Wireless Headphones  stock: 13  (was 15, decremented by 2)
```

---

## Status Progression

```
PENDING  →  INVENTORY_RESERVED  →  PAYMENT_PROCESSED  →  COMPLETED
  ↑               ↑                        ↑                  ↑
Order Svc    Inventory Svc           Payment Svc        Notification Svc
```

---

## Key Design Points

| Point | Detail |
|-------|--------|
| **API response time** | Customer gets `201 Created` in milliseconds — before inventory or payment even start |
| **Single SNS topic** | All services publish back to the same topic. There is no separate topic per event type |
| **Audit on every event** | Audit Service receives all 3 events (order.created, inventory.reserved, payment.processed) independently through its own SQS queue |
| **Atomic stock reservation** | DynamoDB ConditionExpression ensures no overselling under concurrent load |
| **No direct service calls** | No service ever calls another service's HTTP endpoint — all communication is through events |
| **Failure isolation** | If Notification Service were down, the order would still be PAYMENT_PROCESSED and the message would wait in SQS until the service recovered |
