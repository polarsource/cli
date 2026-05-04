import { Args, Command } from "@effect/cli";
import { Effect } from "effect";
import { environmentPrompt } from "../prompts/environment";

const eventType = Args.text({ name: "event" });
const url = Args.text({ name: "url" });

const MOCK_PAYLOADS: Record<string, any> = {
  "subscription.created": {
    type: "subscription.created",
    data: {
      id: "sub_123456",
      status: "active",
      customer_id: "cus_abcdef",
      product_id: "prod_pro_plan",
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }
  },
  "order.created": {
    type: "order.created",
    data: {
      id: "ord_789012",
      amount: 2000,
      currency: "usd",
      customer_id: "cus_abcdef",
      product_id: "prod_digital_ebook",
    }
  },
  "benefit.granted": {
    type: "benefit.granted",
    data: {
      id: "ben_345678",
      customer_id: "cus_abcdef",
      benefit_type: "github_repository",
      properties: {
        repository_owner: "polarsource",
        repository_name: "polar",
      }
    }
  }
};

export const trigger = Command.make("trigger", { event: eventType, url }, ({ event, url }) =>
  Effect.gen(function* () {
    const environment = yield* environmentPrompt;
    
    const payload = MOCK_PAYLOADS[event];
    if (!payload) {
      console.error(`\x1b[31mError:\x1b[0m Unknown event type '${event}'.`);
      console.log("\x1b[2mAvailable events:\x1b[0m");
      Object.keys(MOCK_PAYLOADS).forEach(e => console.log(`  - ${e}`));
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookId = `wh_mock_${Math.random().toString(36).substring(7)}`;
    
    const headers = {
      "user-agent": "polar.sh webhooks",
      "content-type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": "mock_signature_for_local_testing",
    };

    const fullPayload = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    console.log(`\x1b[36mTriggering\x1b[0m '${event}' to ${url}...`);

    try {
      const response = yield* Effect.promise(() => fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(fullPayload),
      }));

      if (response.ok) {
        console.log(`\x1b[32mSuccess!\x1b[0m Webhook received with status ${response.status}`);
      } else {
        console.error(`\x1b[31mFailed:\x1b[0m Receiver returned ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`\x1b[31mError:\x1b[0m Could not reach ${url}. Is your server running?`);
    }
  })
);
