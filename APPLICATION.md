# ShopFlow — Order Processing System

## What is ShopFlow?

ShopFlow is a simplified e-commerce backend that handles the complete lifecycle of a customer order — from the moment a customer clicks "Buy Now" to the point they receive a confirmation on their phone or email.

It is built to demonstrate how large-scale systems handle order processing **without services talking directly to each other**, using events as the communication backbone.

---

## The Business Problem

When a customer places an order, several things must happen:

1. Stock must be reserved so two customers cannot buy the same last item
2. Payment must be collected
3. The customer must be notified of success or failure
4. Every action must be logged for audit and compliance

In a traditional system, one big service does all of this sequentially. If the payment provider is slow, the entire order hangs. If the notification service crashes, the order may fail even though payment succeeded.

ShopFlow solves this by breaking each responsibility into an independent service that reacts to events.

---

## Who Uses ShopFlow?

| Actor | Description |
|-------|-------------|
| **Customer** | Places orders via a REST API (simulates a mobile/web frontend) |
| **Operations Team** | Monitors the real-time dashboard to see order status |
| **Finance/Compliance** | Reads the audit log for every event that occurred on an order |

---

## Core Business Flows

### Flow 1 — Happy Path (Order Succeeds)

```
Customer places order
        ↓
Order is created with status: PENDING
        ↓
Inventory Service checks stock
  → Stock available → reserves it → status: INVENTORY_RESERVED
        ↓
Payment Service charges the customer
  → Payment succeeds → status: PAYMENT_PROCESSED
        ↓
Notification Service sends confirmation email/SMS
  → status: COMPLETED
        ↓
Audit Service logs every step above
```

**Customer experience:** Places order, receives confirmation notification within seconds.

---

### Flow 2 — Out of Stock

```
Customer places order
        ↓
Order is created with status: PENDING
        ↓
Inventory Service checks stock
  → Stock NOT available → status: INVENTORY_FAILED
        ↓
Notification Service sends "Sorry, item out of stock" message
        ↓
Audit Service logs the failure
```

**Customer experience:** Receives an out-of-stock notification. No payment is attempted.

---

### Flow 3 — Payment Fails

```
Customer places order
        ↓
Order is created with status: PENDING
        ↓
Inventory Service reserves stock → status: INVENTORY_RESERVED
        ↓
Payment Service charges the customer
  → Payment DECLINED → releases reserved stock → status: PAYMENT_FAILED
        ↓
Notification Service sends "Payment failed" message
        ↓
Audit Service logs the failure
```

**Customer experience:** Receives payment failure notification. Stock is released back so others can purchase.

---

### Flow 4 — System Failure (Dead Letter Queue)

```
Any service crashes or throws an unhandled error
        ↓
Message is retried up to 3 times automatically
        ↓
After 3 failures → message moves to Dead Letter Queue (DLQ)
        ↓
CloudWatch Alarm fires → alerts operations team
        ↓
Operations team investigates and can replay the message manually
```

**Business value:** No order is silently lost. Every failure is captured and recoverable.

---

## Order Status Lifecycle

```
PENDING
  ├─→ INVENTORY_RESERVED
  │       └─→ PAYMENT_PROCESSED → COMPLETED
  │       └─→ PAYMENT_FAILED
  └─→ INVENTORY_FAILED
```

Every status change is an event. The order record in the database always reflects the latest status.

---

## Data Involved

### Order
| Field | Description |
|-------|-------------|
| orderId | Unique identifier (UUID) |
| customerId | Who placed the order |
| items | List of products with quantity |
| totalAmount | Total price in USD |
| status | Current status in the lifecycle |
| createdAt | Timestamp |

### Inventory Item
| Field | Description |
|-------|-------------|
| productId | Product identifier |
| productName | Human-readable name |
| stock | Available units |
| price | Price per unit in USD |

### Audit Log Entry
| Field | Description |
|-------|-------------|
| eventId | Unique ID of the event |
| orderId | Which order this event belongs to |
| eventType | e.g. `order.created`, `payment.failed` |
| payload | Full event data snapshot |
| timestamp | When the event occurred |

---

## Sample Order Scenario

**Customer:** Alice wants to buy 2 units of "Wireless Headphones" (productId: `PROD-001`, $49.99 each)

1. Alice calls `POST /orders` with her cart
2. System creates order `ORD-8821` for $99.98, status: `PENDING`
3. Inventory checks — 15 units in stock, reserves 2 → status: `INVENTORY_RESERVED`
4. Payment charges Alice's card → succeeds → status: `PAYMENT_PROCESSED`
5. Alice receives: *"Your order ORD-8821 is confirmed! Estimated delivery: 3-5 days."*
6. Audit log has 4 entries, one per event, permanently stored

**Total time from order to notification: ~2-3 seconds**

---

## What the Demo Does NOT Cover

To keep the scope focused, the following are intentionally excluded:

- User authentication / login
- Real payment gateway (Stripe etc.) — payment success/failure is simulated with a random 80/20 outcome
- Real email/SMS — notifications are logged to console and stored in DB
- Order cancellation or returns
- Multi-region deployment

These exclusions keep the demo buildable in a short time while still showcasing all core EDA patterns.

---

## Why Event-Driven Architecture for This?

| Problem | EDA Solution |
|---------|-------------|
| Payment provider is slow | Payment service runs independently; order API returns immediately |
| Notification service crashes | Message stays in SQS queue; delivered when service recovers |
| Need to add a new service (e.g. Fraud Detection) | Subscribe it to existing events — zero changes to other services |
| Audit requirement | Audit service passively listens; producers don't know it exists |
| Scale inventory checks independently | Deploy more Lambda instances behind the inventory queue |
