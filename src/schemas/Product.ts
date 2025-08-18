import { Schema } from "effect";

export const CreateProductPriceCustom = Schema.mutable(
  Schema.Struct({
    amountType: Schema.Literal("custom"),
    priceCurrency: Schema.Literal("USD"),
    minimumAmount: Schema.optional(Schema.Number),
    maximumAmount: Schema.optional(Schema.Number),
    presetAmount: Schema.optional(Schema.Number),
  })
);

export const CreateProductPriceFree = Schema.mutable(
  Schema.Struct({
    amountType: Schema.Literal("free"),
  })
);

export const CreateProductPriceFixed = Schema.mutable(
  Schema.Struct({
    amountType: Schema.Literal("fixed"),
    priceCurrency: Schema.Literal("USD"),
    priceAmount: Schema.Number,
  })
);

export const ProductCreate = Schema.mutable(
  Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    recurringInterval: Schema.NullOr(Schema.Literal("month", "year")),
    prices: Schema.mutable(
      Schema.Tuple(
        Schema.Union(
          CreateProductPriceCustom,
          CreateProductPriceFree,
          CreateProductPriceFixed
        )
      )
    ),
  })
);

export type ProductCreate = Schema.Schema.Type<typeof ProductCreate>;
