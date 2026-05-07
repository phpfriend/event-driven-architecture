const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const awsConfig = require("./aws");

const client = new DynamoDBClient(awsConfig);
const ddb = DynamoDBDocumentClient.from(client);

const ORDERS_TABLE    = process.env.ORDERS_TABLE    || "shopflow-orders";
const INVENTORY_TABLE = process.env.INVENTORY_TABLE || "shopflow-inventory";
const EVENTS_TABLE    = process.env.EVENTS_TABLE    || "shopflow-events";

async function saveOrder(order) {
  await ddb.send(new PutCommand({ TableName: ORDERS_TABLE, Item: order }));
}

async function getOrder(orderId) {
  const result = await ddb.send(
    new GetCommand({ TableName: ORDERS_TABLE, Key: { orderId } })
  );
  return result.Item || null;
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

async function getProduct(productId) {
  const result = await ddb.send(
    new GetCommand({ TableName: INVENTORY_TABLE, Key: { productId } })
  );
  return result.Item || null;
}

async function getAllProducts() {
  const result = await ddb.send(new ScanCommand({ TableName: INVENTORY_TABLE }));
  return result.Items || [];
}

async function getOrderEvents(orderId) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: EVENTS_TABLE,
      KeyConditionExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
      ScanIndexForward: true,
    })
  );
  return result.Items || [];
}

module.exports = { saveOrder, getOrder, updateOrderStatus, getProduct, getAllProducts, getOrderEvents };
