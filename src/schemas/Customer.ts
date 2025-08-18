import { Schema } from "effect";

export const CustomerCreate = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  billingAddress: Schema.optional(
    Schema.Struct({
      country: Schema.String,
      city: Schema.NullOr(Schema.String),
      state: Schema.NullOr(Schema.String),
    })
  ),
});

export type CustomerCreate = Schema.Schema.Type<typeof CustomerCreate>;
