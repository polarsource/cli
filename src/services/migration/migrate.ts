import { Context, Data, Effect, Layer, Schema } from "effect";
import { CustomerCreate } from "../../schemas/Customer";
import type { MigrationContext } from "../../schemas/Migration";
import { ProductCreate } from "../../schemas/Product";
import * as OAuth from "../oauth";
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
        // @ts-expect-error - OAuth is required for type requirements but not directly used
        const _oauth = yield* OAuth.OAuth;
        const providerProducts = provider.products(migration.from);

        yield* providerProducts.pipe(
          Effect.flatMap(Schema.encode(Schema.Array(ProductCreate))),
          Effect.mapError((error) =>
            new Polar.PolarError({
              message: "Failed to encode products",
              cause: error,
            })
          ),
          Effect.flatMap((products) =>
            Effect.all(
              products.map((product) =>
                polar.use((client) =>
                  Effect.tryPromise({
                    try: () =>
                      client.products.create({
                        ...product,
                        organizationId: migration.to,
                      }),
                    catch: (error) =>
                      new Polar.PolarError({
                        message: "Failed to create product",
                        cause: error,
                      }),
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
          )
        );
      }),
    customers: (provider, migration) =>
      Effect.gen(function* () {
        const polar = yield* Polar.Polar;
        // @ts-expect-error - OAuth is required for type requirements but not directly used
        const _oauth = yield* OAuth.OAuth;
        const providerCustomers = provider.customers(migration.from);

        yield* providerCustomers.pipe(
          Effect.flatMap(Schema.encode(Schema.Array(CustomerCreate))),
          Effect.mapError((error) =>
            new Polar.PolarError({
              message: "Failed to encode customers",
              cause: error,
            })
          ),
          Effect.flatMap((customers) =>
            Effect.all(
              customers.map((customer) =>
                polar.use((client) =>
                  Effect.tryPromise({
                    try: () =>
                      client.customers.create({
                        ...customer,
                        organizationId: migration.to,
                      }),
                    catch: (error) =>
                      new Polar.PolarError({
                        message: "Failed to create customer",
                        cause: error,
                      }),
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
          )
        );
      }),
  });
});

export const layer = Layer.scoped(Migration, make);
