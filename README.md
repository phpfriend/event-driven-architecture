# ShopFlow — Event-Driven Architecture Demo

A fully working event-driven microservices system built with **Node.js** and **AWS** (SNS, SQS, DynamoDB). Designed to demonstrate real-world EDA patterns used in production systems.

---

## What It Does

A customer places an order through a REST API. That single action triggers an asynchronous chain across five independent services — no service ever calls another directly. All communication happens through events.

```
Customer  →  POST /orders
                 │
            Order Service  ──publishes──▶  SNS Topic (shopflow-orders)
                                                │
                          ┌─────────────────────┼──────────────────────┐
                          ▼                     ▼                      ▼
                   Inventory Svc         Payment Svc           Audit Svc
                  (reserves stock)    (charges card)        (logs every event)
                          │
                    publishes back to same SNS topic
                          │
                   Notification Svc
                  (sends confirmation, marks COMPLETED)
```

**Customer gets a `201 Created` response in milliseconds.** Everything else happens in the background.

---

## Architecture

### Services

| Service | Port | Responsibility |
|---|---|---|
| **Order Service** | 3000 | REST API, shopping UI, publishes `order.created` |
| **Inventory Service** | — | Reserves stock atomically, publishes `inventory.reserved` |
| **Payment Service** | — | Simulates payment gateway, publishes `payment.processed` |
| **Notification Service** | — | Sends order confirmation, marks order `COMPLETED` |
| **Audit Service** | — | Logs every event to DynamoDB (append-only audit trail) |

### AWS Resources

| Resource | Name | Purpose |
|---|---|---|
| SNS Topic | `shopflow-orders` | Single topic — all events fan out through here |
| SQS Queue × 4 | `shopflow-*-queue` | One dedicated queue per service |
| DLQ × 4 | `shopflow-*-dlq` | Dead-letter queue (messages retry 3× before landing here) |
| DynamoDB | `shopflow-orders` | Order records |
| DynamoDB | `shopflow-inventory` | Product catalogue + stock levels |
| DynamoDB | `shopflow-events` | Append-only audit log |

### Event Flow

```
order.created       →  Inventory Service (reserves stock)
                    →  Audit Service     (logs event)

inventory.reserved  →  Payment Service  (charges card)
                    →  Audit Service     (logs event)

payment.processed   →  Notification Service (sends confirmation)
                    →  Audit Service        (logs event)
```

### Order Status Progression

```
PENDING  →  INVENTORY_RESERVED  →  PAYMENT_PROCESSED  →  COMPLETED
```

Failure paths:
```
PENDING  →  INVENTORY_FAILED   (out of stock)
PENDING  →  INVENTORY_RESERVED  →  PAYMENT_FAILED  (card declined)
```

---

## Key Design Patterns

| Pattern | How It's Used |
|---|---|
| **Fan-out (pub/sub)** | One SNS publish → all 4 SQS queues receive a copy simultaneously |
| **Single SNS topic** | All services publish back to the same topic — no per-event topics |
| **Atomic reservation** | DynamoDB `ConditionExpression: stock >= :qty` prevents overselling under concurrent load |
| **Correlation ID** | `orderId` threads through every event and every DynamoDB write |
| **Event sourcing** | Audit Service appends every event to `shopflow-events` — full history preserved |
| **Failure isolation** | If Notification Service is down, the message waits in SQS and retries automatically |
| **No direct calls** | No service ever calls another service's HTTP endpoint |

---

## Project Structure

```
shopflow/
├── docker-compose.yml          # LocalStack (SNS + SQS + DynamoDB)
├── package.json                # Root scripts
├── .env.example                # Environment variable template
├── scripts/
│   ├── setup-local-aws.js      # Creates all AWS resources + seeds products
│   ├── wait-for-localstack.js  # Health-check before setup runs
│   ├── test-order.js           # Places 3 test orders via REST
│   └── check-order.js          # Polls an order by ID
├── docs/
│   └── HAPPY-PATH-FLOW.md      # Step-by-step walkthrough with JSON payloads
└── services/
    ├── order-service/          # REST API + shopping UI (port 3000)
    │   └── src/
    │       ├── public/         # Shopping UI served as static files
    │       ├── routes/         # orders.js, products.js, stream.js (SSE)
    │       └── lib/            # DynamoDB + SNS wrappers
    ├── inventory-service/
    ├── payment-service/
    ├── notification-service/
    └── audit-service/
```

Each service follows the same internal structure:
```
src/
├── index.js        # Entry point — loads .env, starts consumer
├── consumer.js     # SQS long-poll loop
├── handlers/       # One file per event type handled
└── lib/            # aws.js, dynamodb.js, sns.js, sqs.js
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for LocalStack)

### 1. Install dependencies

```bash
# Root dependencies
npm install

# Each service
cd services/order-service && npm install
cd ../inventory-service  && npm install
cd ../payment-service    && npm install
cd ../notification-service && npm install
cd ../audit-service      && npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

No changes needed — the defaults work with LocalStack out of the box.

### 3. Start infrastructure

```bash
npm run infra:up
```

This starts LocalStack, waits for it to be healthy, then creates the SNS topic, 4 SQS queues, 4 DLQs, 3 DynamoDB tables, and seeds 3 products.

### 4. Start all services

```bash
npm run dev:all
```

Five services start in parallel with colour-coded output:

```
[ORDER]     Running on http://localhost:3000
[INVENTORY] Consumer started, polling shopflow-inventory-queue
[PAYMENT]   Consumer started, polling shopflow-payment-queue
[NOTIFY]    Consumer started, polling shopflow-notification-queue
[AUDIT]     Consumer started, polling shopflow-audit-queue
```

### 5. Open the UI

```
http://localhost:3000
```

Or place a test order from the terminal:

```bash
npm run test:order
```

---

## npm Scripts

| Script | What it does |
|---|---|
| `npm run infra:up` | Start LocalStack + create all AWS resources |
| `npm run infra:down` | Stop LocalStack |
| `npm run infra:reset` | Wipe and recreate all infrastructure |
| `npm run infra:status` | Show LocalStack container status |
| `npm run dev:all` | Start all 5 services with coloured output |
| `npm run test:order` | Place 3 test orders (happy path, out-of-stock, multi-item) |
| `npm run check:order` | Poll a specific order by ID |

---

## Shopping UI

The Order Service serves a shopping UI at `http://localhost:3000`:

- **Product grid** — loaded from DynamoDB, shows live stock levels
- **Cart** — add/remove items, quantity controls
- **Real-time order tracker** — uses Server-Sent Events (SSE) to stream status changes as events flow through the system
- **Live audit log** — shows each event (`order.created`, `inventory.reserved`, `payment.processed`) as the Audit Service writes them

---

## Seeded Products

| ID | Name | Price | Stock |
|---|---|---|---|
| PROD-001 | Wireless Headphones | $49.99 | 15 |
| PROD-002 | Mechanical Keyboard | $89.99 | 0 ← out-of-stock demo |
| PROD-003 | USB-C Hub | $29.99 | 30 |

---

## Local vs Real AWS

This project runs entirely on **LocalStack** — no real AWS account required. LocalStack accepts `test`/`test` as credentials and emulates SNS, SQS, and DynamoDB on `localhost:4566`.

To deploy to real AWS:
1. Remove `AWS_ENDPOINT_URL` from `.env.local`
2. Replace `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` with real IAM credentials
3. Create the SNS/SQS/DynamoDB resources (via console, CDK, or Terraform) and update the ARNs/URLs in `.env.local`

---

## Tech Stack

- **Runtime** — Node.js 18+
- **HTTP** — Express
- **Messaging** — AWS SNS (fan-out) + SQS (queue per service)
- **Database** — AWS DynamoDB
- **Local AWS** — LocalStack 3.4
- **AWS SDK** — AWS SDK v3 (`@aws-sdk/client-*`)
- **Real-time UI** — Server-Sent Events (SSE)
- **Dev tooling** — concurrently, dotenv, Docker Compose
