import {
  getAuthenticatedUser,
  type ListCustomers,
  type ListProducts,
  lemonSqueezySetup,
  listCustomers,
  listDiscounts,
  listFiles,
  listProducts,
  listStores,
  listVariants,
} from "@lemonsqueezy/lemonsqueezy.js";
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

const parseProducts = (products: LemonSqueezyFetchResponse<ListProducts>) =>
  products.data?.data?.map((product) => ({
    name: product.attributes.name,
    description: product.attributes.description,
    price: product.attributes.price,
  })) ?? [];

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
        try: () => client.listProducts(),
        catch: (error) => {
          throw new LemonSqueezyError({
            message: "Failed to list Lemon Squeezy products",
            cause: error,
          });
        },
      }).pipe(
        Effect.map(parseProducts),
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
