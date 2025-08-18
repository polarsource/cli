import { Context, Data, Effect, Layer, Schema } from "effect";
import { CustomerCreate } from "../../schemas/Customer";
import type * as OAuth from "../oauth";
import * as Polar from "../polar";
import type * as LemonSqueezy from "./providers/lemonSqueezy";

export class MigrationError extends Data.TaggedError("MigrationError")<{
  message: string;
  cause?: unknown;
}> {}

export interface MigrationImpl {
  products: (
    provider: LemonSqueezy.LemonSqueezyImpl
  ) => Effect.Effect<
    void,
    LemonSqueezy.LemonSqueezyError | Polar.PolarError | OAuth.OAuthError,
    Polar.Polar | OAuth.OAuth
  >;
  customers: (
    provider: LemonSqueezy.LemonSqueezyImpl
  ) => Effect.Effect<
    void,
    LemonSqueezy.LemonSqueezyError | Polar.PolarError | OAuth.OAuthError,
    Polar.Polar | OAuth.OAuth
  >;
}

export class Migration extends Context.Tag("Migration")<
  Migration,
  MigrationImpl
>() {}

export const make = Effect.gen(function* () {
  return Migration.of({
    products: (provider) =>
      Effect.gen(function* () {
        const polar = yield* Polar.Polar;
        const providerProducts = provider.products;

        yield* providerProducts.pipe(
          Effect.flatMap((products) =>
            Effect.all(
              products.map((product) =>
                polar.use((client) => client.products.create(product))
              ),
              {
                concurrency: 10,
              }
            )
          ),
          Effect.tap((products) =>
            Effect.logDebug(`${products.length} products migrated`)
          )
        );

        yield* Effect.log("asd");
      }),
    customers: (provider) =>
      Effect.gen(function* () {
        const polar = yield* Polar.Polar;
        const providerCustomers = provider.customers;

        yield* providerCustomers.pipe(
          Effect.flatMap(Schema.encode(Schema.Array(CustomerCreate))),
          Effect.flatMap((customers) =>
            Effect.all(
              customers.map((customer) =>
                polar.use((client) => client.customers.create(customer))
              ),
              {
                concurrency: 10,
              }
            )
          ),
          Effect.catchTag("ParseError", Effect.die)
        );
      }),
  });
});

export const layer = Layer.scoped(Migration, make);
