import { Schema } from "effect";

export const ProductCreate = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  price: Schema.Number,
});

export type ProductCreate = Schema.Schema.Type<typeof ProductCreate>;
