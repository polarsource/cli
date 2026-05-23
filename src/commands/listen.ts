import { ListenAck, ListenWebhookEvent } from "../schemas/Events";
import { organizationLoginPrompt } from "../prompts/organizations";

async function listenToWebhooks(environment: PolarEnvironment = "production") {
  const ackMessage = await organizationLoginPrompt(environment);
  if (!ackMessage) {
    return;
  }
  const secret = ackMessage.secret;

  const url = `http://localhost:8675/webhooks/polar`;
  const headers = { Authorization: `Bearer ${secret}` };

  const wsSource = new EventSource(`${url}?key=${ackMessage.key}`, { headers });

  wsSource.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    console.log(`Received event: ${payload.webhook_event}`);
  };

  wsSource.onerror = (error) => {
    if (error.readyState === EventSource.CLOSED) {
      console.log("WebSocket closed");
    } else {
      console.error("WebSocket error:", error);
    }
  };
}

export default listenToWebhooks;