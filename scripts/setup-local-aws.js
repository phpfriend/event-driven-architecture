// Creates all SNS topics, SQS queues (with DLQs), SNS→SQS subscriptions,
// and DynamoDB tables needed for local development.
require("dotenv").config({ path: ".env.local" });

const { SNSClient, CreateTopicCommand, SubscribeCommand } = require("@aws-sdk/client-sns");
const {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} = require("@aws-sdk/client-sqs");
const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

const CONFIG = {
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const sns = new SNSClient(CONFIG);
const sqs = new SQSClient(CONFIG);
const ddb = new DynamoDBClient(CONFIG);

// ─── Queues to create ────────────────────────────────────────────────────────

const QUEUES = [
  { name: "shopflow-inventory-queue", dlq: "shopflow-inventory-dlq" },
  { name: "shopflow-payment-queue",   dlq: "shopflow-payment-dlq"   },
  { name: "shopflow-notification-queue", dlq: "shopflow-notification-dlq" },
  { name: "shopflow-audit-queue",     dlq: "shopflow-audit-dlq"     },
];

// ─── DynamoDB tables ─────────────────────────────────────────────────────────

const TABLES = [
  {
    TableName: "shopflow-orders",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "shopflow-inventory",
    KeySchema: [{ AttributeName: "productId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "productId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "shopflow-events",
    KeySchema: [
      { AttributeName: "orderId",  KeyType: "HASH"  },
      { AttributeName: "eventId",  KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "orderId", AttributeType: "S" },
      { AttributeName: "eventId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createDLQ(dlqName) {
  const res = await sqs.send(new CreateQueueCommand({ QueueName: dlqName }));
  console.log(`  DLQ created: ${dlqName}`);
  const attrs = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: res.QueueUrl,
      AttributeNames: ["QueueArn"],
    })
  );
  return { url: res.QueueUrl, arn: attrs.Attributes.QueueArn };
}

async function createQueue(queueName, dlqArn) {
  const res = await sqs.send(
    new CreateQueueCommand({
      QueueName: queueName,
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: dlqArn,
          maxReceiveCount: "3",
        }),
      },
    })
  );
  console.log(`  Queue created: ${queueName}`);
  const attrs = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: res.QueueUrl,
      AttributeNames: ["QueueArn"],
    })
  );
  return { url: res.QueueUrl, arn: attrs.Attributes.QueueArn };
}

async function allowSNSToSendToSQS(queueUrl, queueArn, topicArn) {
  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: { ArnEquals: { "aws:SourceArn": topicArn } },
            },
          ],
        }),
      },
    })
  );
}

async function seedInventory() {
  const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
  const docClient = DynamoDBDocumentClient.from(ddb);

  const products = [
    { productId: "PROD-001", productName: "Wireless Headphones", stock: 15, price: 49.99 },
    { productId: "PROD-002", productName: "Mechanical Keyboard",  stock: 0,  price: 89.99 },
    { productId: "PROD-003", productName: "USB-C Hub",            stock: 30, price: 29.99 },
  ];

  for (const product of products) {
    await docClient.send(new PutCommand({ TableName: "shopflow-inventory", Item: product }));
    console.log(`  Seeded inventory: ${product.productName} (stock: ${product.stock})`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== ShopFlow Local AWS Setup ===\n");

  // 1. Create SNS topic
  console.log("Creating SNS topic...");
  const topicRes = await sns.send(new CreateTopicCommand({ Name: "shopflow-orders" }));
  const topicArn = topicRes.TopicArn;
  console.log(`  Topic created: ${topicArn}`);

  // 2. Create SQS queues and subscribe each to SNS
  console.log("\nCreating SQS queues and DLQs...");
  for (const { name, dlq } of QUEUES) {
    const dlqInfo   = await createDLQ(dlq);
    const queueInfo = await createQueue(name, dlqInfo.arn);
    await allowSNSToSendToSQS(queueInfo.url, queueInfo.arn, topicArn);
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueInfo.arn,
      })
    );
    console.log(`  Subscribed ${name} to SNS topic`);
  }

  // 3. Create DynamoDB tables
  console.log("\nCreating DynamoDB tables...");
  const { TableNames: existing } = await ddb.send(new ListTablesCommand({}));
  for (const tableDef of TABLES) {
    if (existing.includes(tableDef.TableName)) {
      console.log(`  Table already exists: ${tableDef.TableName}`);
      continue;
    }
    await ddb.send(new CreateTableCommand(tableDef));
    console.log(`  Table created: ${tableDef.TableName}`);
  }

  // 4. Seed inventory with sample products
  console.log("\nSeeding inventory data...");
  await seedInventory();

  console.log("\n=== Setup complete. Local environment is ready. ===\n");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
