import { Schema } from "effect";

export const Customer = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});

export type Customer = Schema.Schema.Type<typeof Customer>;
