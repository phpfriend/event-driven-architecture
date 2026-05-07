require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env.local") });

const app = require("./app");

const PORT = process.env.ORDER_SERVICE_PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Order Service] Running on http://localhost:${PORT}`);
  console.log(`[Order Service] SNS Topic: ${process.env.SNS_TOPIC_ARN}`);
  console.log(`[Order Service] DynamoDB endpoint: ${process.env.AWS_ENDPOINT_URL}`);
});
