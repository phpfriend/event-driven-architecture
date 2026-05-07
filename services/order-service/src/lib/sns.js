const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const awsConfig = require("./aws");

const sns = new SNSClient(awsConfig);
const TOPIC_ARN = process.env.SNS_TOPIC_ARN;

async function publishEvent(eventType, payload) {
  const envelope = {
    eventType,
    version: "1.0",
    timestamp: new Date().toISOString(),
    payload,
  };

  await sns.send(
    new PublishCommand({
      TopicArn: TOPIC_ARN,
      Message: JSON.stringify(envelope),
      MessageAttributes: {
        eventType: {
          DataType: "String",
          StringValue: eventType,
        },
      },
    })
  );

  console.log(`[SNS] Published: ${eventType} | orderId: ${payload.orderId}`);
}

module.exports = { publishEvent };
