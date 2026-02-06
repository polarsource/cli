import { Schema } from "effect";

export const ListenAck = Schema.Struct({
  key: Schema.Literal("connected"),
  ts: Schema.DateFromString,
  secret: Schema.String,
});
