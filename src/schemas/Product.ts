import { Schema } from "effect";

export const Product = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  price: Schema.Number,
});

export type Product = Schema.Schema.Type<typeof Product>;
