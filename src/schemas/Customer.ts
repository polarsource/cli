import { Schema } from "effect";

export const Customer = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  organizationId: Schema.String,
  billingAddress: Schema.partial(
    Schema.Struct({
      addressLine1: Schema.String,
      addressLine2: Schema.String,
      city: Schema.String,
      state: Schema.String,
      zip: Schema.String,
    })
  ),
});

export type Customer = Schema.Schema.Type<typeof Customer>;
