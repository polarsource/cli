import { Schema } from "effect";

export const ListenAck = Schema.Struct({
  key: Schema.Literal("connected"),
  ts: Schema.DateFromString,
  secret: Schema.String,
});

export const ListenWebhookEvent = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  payload: Schema.Struct({
    webhook_event_id: Schema.String,
    payload: Schema.Struct({
      type: Schema.String,
      timestamp: Schema.String,
      data: Schema.Struct({}),
    }),
  }),
  headers: Schema.Struct({
    "user-agent": Schema.Literal("polar.sh webhooks"),
    "content-type": Schema.Literal("application/json"),
    "webhook-id": Schema.String,
    "webhook-timestamp": Schema.String,
    "webhook-signature": Schema.String,
  }),
});

export const ListenEvent = Schema.Union(ListenAck, ListenWebhookEvent);
