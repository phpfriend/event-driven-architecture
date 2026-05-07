// Polls LocalStack health endpoint until it is ready, then exits.
// Called before setup-local-aws.js so resources are not created on a cold container.
const http = require("http");

const MAX_RETRIES = 30;
const INTERVAL_MS = 2000;
const HEALTH_URL = "http://localhost:4566/_localstack/health";

function checkHealth(attempt) {
  http
    .get(HEALTH_URL, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          const services = json.services || {};
          const ready = ["sns", "sqs", "dynamodb"].every(
            (s) => services[s] === "running" || services[s] === "available"
          );
          if (ready) {
            console.log("LocalStack is ready.");
            process.exit(0);
          }
        } catch (_) {}
        retry(attempt);
      });
    })
    .on("error", () => retry(attempt));
}

function retry(attempt) {
  if (attempt >= MAX_RETRIES) {
    console.error("LocalStack did not become ready in time.");
    process.exit(1);
  }
  console.log(`Waiting for LocalStack... (${attempt + 1}/${MAX_RETRIES})`);
  setTimeout(() => checkHealth(attempt + 1), INTERVAL_MS);
}

checkHealth(0);
