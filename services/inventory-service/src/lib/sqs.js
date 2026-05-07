const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const awsConfig = require("./aws");

const sqs = new SQSClient(awsConfig);
const QUEUE_URL = process.env.INVENTORY_QUEUE_URL;

// Long-poll: waits up to 20s for messages before returning empty.
// Reduces unnecessary API calls compared to short polling.
async function receiveMessages() {
  const result = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    })
  );
  return result.Messages || [];
}

async function deleteMessage(receiptHandle) {
  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle })
  );
}

// Parse the nested SNS-over-SQS envelope.
// SNS wraps our event inside a "Message" string field when delivering to SQS.
function parseMessage(sqsMessage) {
  const snsEnvelope = JSON.parse(sqsMessage.Body);
  return JSON.parse(snsEnvelope.Message);
}

module.exports = { receiveMessages, deleteMessage, parseMessage };
