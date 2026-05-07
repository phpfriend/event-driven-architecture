const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const awsConfig = require("./aws");

const client = new DynamoDBClient(awsConfig);
const ddb = DynamoDBDocumentClient.from(client);

const ORDERS_TABLE = process.env.ORDERS_TABLE || "shopflow-orders";

async function updateOrderStatus(orderId, status, extra = {}) {
  const extraKeys   = Object.keys(extra);
  const extraSet    = extraKeys.map((k) => `${k} = :${k}`).join(", ");
  const extraValues = extraKeys.reduce((acc, k) => ({ ...acc, [`:${k}`]: extra[k] }), {});

  await ddb.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression: `SET #s = :status, updatedAt = :updatedAt${extraSet ? ", " + extraSet : ""}`,
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
        ...extraValues,
      },
    })
  );
}

module.exports = { updateOrderStatus };
