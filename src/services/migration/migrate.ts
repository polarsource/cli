import { Context, Data, Effect, Layer, Schema } from "effect";
import { CustomerCreate } from "../../schemas/Customer";
import type { MigrationContext } from "../../schemas/Migration";
import { ProductCreate } from "../../schemas/Product";
import type * as OAuth from "../oauth";
import * as Polar from "../polar";
import type * as LemonSqueezy from "./lemon/provider";

export class MigrationError extends Data.TaggedError("MigrationError")<{
  message: string;
  cause?: unknown;
}> {}

export interface MigrationImpl {
  products: (
    provider: LemonSqueezy.LemonSqueezyImpl,
    migration: MigrationContext
  ) => Effect.Effect<
    void,
    LemonSqueezy.LemonSqueezyError | Polar.PolarError | OAuth.OAuthError,
    Polar.Polar | OAuth.OAuth
  >;
  customers: (
    provider: LemonSqueezy.LemonSqueezyImpl,
    migration: MigrationContext
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
    products: (provider, migration) =>
      Effect.gen(function* () {
        const polar = yield* Polar.Polar;
        const providerProducts = provider.products(migration.from);

        yield* providerProducts.pipe(
          Effect.flatMap(Schema.encode(Schema.Array(ProductCreate))),
          Effect.flatMap((products) =>
            Effect.all(
              products.map((product) =>
                polar.use((client) =>
                  client.products.create({
                    ...product,
                    organizationId: migration.to,
                  })
                )
              ),
              {
                concurrency: 10,
              }
            )
          ),
          Effect.tap((products) =>
            Effect.logDebug(`${products.length} products migrated`)
          ),
          Effect.catchTag("ParseError", Effect.logError),
          Effect.catchTag("PolarError", Effect.logError)
        );

        yield* Effect.log("asd");
      }),
    customers: (provider, migration) =>
      Effect.gen(function* () {
        const polar = yield* Polar.Polar;
        const providerCustomers = provider.customers(migration.from);

        yield* providerCustomers.pipe(
          Effect.flatMap(Schema.encode(Schema.Array(CustomerCreate))),
          Effect.flatMap((customers) =>
            Effect.all(
              customers.map((customer) =>
                polar.use((client) =>
                  client.customers.create({
                    ...customer,
                    organizationId: migration.to,
                  })
                )
              ),
              {
                concurrency: 10,
              }
            )
          ),
          Effect.tap((customers) =>
            Effect.logDebug(`${customers.length} customers migrated`)
          ),
          Effect.catchTag("ParseError", Effect.logError),
          Effect.catchTag("PolarError", Effect.logError)
        );
      }),
  });
});

export const layer = Layer.scoped(Migration, make);
