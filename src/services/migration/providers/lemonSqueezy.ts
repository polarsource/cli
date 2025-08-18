import {
  getAuthenticatedUser,
  type ListCustomers,
  type ListVariants,
  lemonSqueezySetup,
  listCustomers,
  listDiscounts,
  listFiles,
  listProducts,
  listStores,
  listVariants,
} from "@lemonsqueezy/lemonsqueezy.js";
import type { ProductPriceCustomCreate } from "@polar-sh/sdk/models/components/productpricecustomcreate.js";
import type { ProductPriceFixedCreate } from "@polar-sh/sdk/models/components/productpricefixedcreate.js";
import type { ProductPriceFreeCreate } from "@polar-sh/sdk/models/components/productpricefreecreate.js";
import type { SubscriptionRecurringInterval } from "@polar-sh/sdk/models/components/subscriptionrecurringinterval.js";
import { Context, Data, Effect, Layer, Schema } from "effect";
import { CustomerCreate } from "../../../schemas/Customer";
import { ProductCreate } from "../../../schemas/Product";

type LemonSqueezyFetchResponse<T> =
  | {
      statusCode: number;
      data: T;
      error: null;
    }
  | {
      statusCode: number | null;
      data: T | null;
      error: Error;
    };

export class LemonSqueezyError extends Data.TaggedError("LemonSqueezyError")<{
  message: string;
  cause?: unknown;
}> {}

export interface LemonSqueezyImpl {
  customers: Effect.Effect<readonly CustomerCreate[], LemonSqueezyError, never>;
  products: Effect.Effect<readonly ProductCreate[], LemonSqueezyError, never>;
}

export class LemonSqueezy extends Context.Tag("LemonSqueezy")<
  LemonSqueezy,
  LemonSqueezyImpl
>() {}

const parseCustomers = (customers: LemonSqueezyFetchResponse<ListCustomers>) =>
  customers.data?.data?.map((customer) => ({
    name: customer.attributes.name,
    email: customer.attributes.email,
    billingAddress: customer.attributes.country
      ? {
          country: customer.attributes.country,
          city: customer.attributes.city,
          state: customer.attributes.region,
        }
      : undefined,
  })) ?? [];

const parseInterval = (
  interval: ListVariants["data"][number]["attributes"]["interval"]
): SubscriptionRecurringInterval | null => {
  switch (interval) {
    case "month":
      return "month";
    case "year":
      return "year";
    default:
      return null;
  }
};

const parseVariants = (variants: LemonSqueezyFetchResponse<ListVariants>[]) =>
  variants.flatMap(
    (variant) =>
      variant.data?.data?.map((variant) => ({
        name: variant.attributes.name,
        description: variant.attributes.description,
        prices: [parsePrice(variant)],
        recurringInterval: parseInterval(variant.attributes.interval),
      })) ?? []
  );

const parsePrice = (
  variant: ListVariants["data"][number]
):
  | ProductPriceFixedCreate
  | ProductPriceFreeCreate
  | ProductPriceCustomCreate => {
  const priceCurrency = "usd";
  const priceAmount = variant.attributes.price;

  if (priceAmount > 0) {
    return {
      amountType: "fixed",
      priceAmount,
      priceCurrency,
    };
  }

  const payWhatYouWant = variant.attributes.pay_what_you_want;

  if (payWhatYouWant) {
    return {
      amountType: "custom",
      priceAmount,
      priceCurrency,
      minimumAmount:
        variant.attributes.min_price < 50 ? 50 : variant.attributes.min_price,
      presetAmount: variant.attributes.suggested_price,
    } as ProductPriceCustomCreate;
  }

  if (priceAmount > 0) {
    return {
      amountType: "fixed",
      priceAmount,
      priceCurrency,
    } as ProductPriceFixedCreate;
  }

  return {
    amountType: "free",
  };
};

export const make = (apiKey: string) =>
  Effect.gen(function* () {
    const client = yield* createLemonClient(apiKey);

    return LemonSqueezy.of({
      customers: Effect.tryPromise({
        try: () => client.listCustomers(),
        catch: (error) => {
          throw new LemonSqueezyError({
            message: "Failed to list Lemon Squeezy customers",
            cause: error,
          });
        },
      }).pipe(
        Effect.map(parseCustomers),
        Effect.flatMap(Schema.decodeUnknown(Schema.Array(CustomerCreate))),
        Effect.catchTag(
          "ParseError",
          (error) =>
            new LemonSqueezyError({
              message: "Failed to parse customers",
              cause: error,
            })
        )
      ),
      products: Effect.tryPromise({
        try: () =>
          client.listProducts().then((products) =>
            Promise.all(
              products.data?.data?.map((product) =>
                client.listVariants({
                  filter: {
                    productId: product.id,
                  },
                })
              ) ?? []
            )
          ),
        catch: (error) => {
          throw new LemonSqueezyError({
            message: "Failed to list Lemon Squeezy products",
            cause: error,
          });
        },
      }).pipe(
        Effect.map(parseVariants),
        Effect.flatMap(Schema.decodeUnknown(Schema.Array(ProductCreate))),
        Effect.catchTag(
          "ParseError",
          (error) =>
            new LemonSqueezyError({
              message: "Failed to parse products",
              cause: error,
            })
        )
      ),
    });
  });

export const layer = (apiKey: string) =>
  Layer.scoped(LemonSqueezy, make(apiKey));

export const createLemonClient = (apiKey: string) =>
  Effect.try(() => {
    lemonSqueezySetup({
      apiKey,
      onError: (error) => {
        throw new LemonSqueezyError({
          message: "Failed to setup Lemon Squeezy client",
          cause: error,
        });
      },
    });

    return {
      getAuthenticatedUser,
      listStores,
      listProducts,
      listDiscounts,
      listFiles,
      listVariants,
      listCustomers,
    };
  });
