import { Schema } from "effect";
import { Customer } from "./Customer";
import { Product } from "./Product";

export const Migration = Schema.Struct({
  products: Schema.Array(Product),
  customers: Schema.Array(Customer),
});

export type Migration = Schema.Schema.Type<typeof Migration>;
