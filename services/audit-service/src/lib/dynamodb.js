const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const awsConfig = require("./aws");

const client = new DynamoDBClient(awsConfig);
const ddb = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE || "shopflow-events";

// Append-only — never updates or deletes an existing event log entry
async function appendEvent(entry) {
  await ddb.send(new PutCommand({ TableName: EVENTS_TABLE, Item: entry }));
}

// Retrieve the full event history for one order (useful for demos and debugging)
async function getEventsByOrder(orderId) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: EVENTS_TABLE,
      KeyConditionExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
      ScanIndexForward: true, // chronological order
    })
  );
  return result.Items || [];
}

module.exports = { appendEvent, getEventsByOrder };
