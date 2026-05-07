const { DynamoDBClient, TransactWriteItemsCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const awsConfig = require("./aws");

const client = new DynamoDBClient(awsConfig);
const ddb = DynamoDBDocumentClient.from(client);

const INVENTORY_TABLE = process.env.INVENTORY_TABLE || "shopflow-inventory";
const ORDERS_TABLE    = process.env.ORDERS_TABLE    || "shopflow-orders";

async function getProduct(productId) {
  const result = await ddb.send(
    new GetCommand({ TableName: INVENTORY_TABLE, Key: { productId } })
  );
  return result.Item || null;
}

// Atomically decrements stock only if enough is available.
// ConditionExpression prevents overselling if two orders race for the last unit.
async function reserveStock(productId, quantity) {
  await ddb.send(
    new UpdateCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId },
      UpdateExpression: "SET stock = stock - :qty",
      ConditionExpression: "stock >= :qty",
      ExpressionAttributeValues: { ":qty": quantity },
    })
  );
}

async function updateOrderStatus(orderId, status) {
  await ddb.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression: "SET #s = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
      },
    })
  );
}

module.exports = { getProduct, reserveStock, updateOrderStatus };
