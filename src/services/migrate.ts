import { Context, Data, Effect, Layer, pipe, Schema } from "effect";
import { Customer } from "../schemas/Customer";
import { Product } from "../schemas/Product";
import type * as LemonSqueezy from "./migration/lemonSqueezy";

export class MigrationError extends Data.TaggedError("MigrationError")<{
  message: string;
  cause?: unknown;
}> {}

export interface MigrationImpl {
  products: (
    provider: LemonSqueezy.LemonSqueezyImpl
  ) => Effect.Effect<
    readonly Product[],
    LemonSqueezy.LemonSqueezyError | MigrationError,
    never
  >;
  customers: (
    provider: LemonSqueezy.LemonSqueezyImpl
  ) => Effect.Effect<
    readonly Customer[],
    LemonSqueezy.LemonSqueezyError | MigrationError,
    never
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
        const providerProducts = yield* provider
          .use((client) =>
            client.listProducts().then(
              (query) =>
                query.data?.data.map((product) => ({
                  id: product.id,
                  name: product.attributes.name,
                  description: product.attributes.description,
                  price: product.attributes.price,
                })) ?? []
            )
          )
          .pipe(Effect.catchAll((error) => Effect.die(error)));

        return yield* pipe(
          providerProducts,
          Schema.decodeUnknown(Schema.Array(Product)),
          Effect.catchTag(
            "ParseError",
            (error) =>
              new MigrationError({
                message: "Failed to parse products",
                cause: error,
              })
          )
        );
      }),
    customers: (provider) =>
      Effect.gen(function* () {
        const providerCustomers = yield* provider.use((client) =>
          client.listCustomers().then((query) => query.data?.data ?? [])
        );

        return yield* pipe(
          providerCustomers,
          Schema.decodeUnknown(Schema.Array(Customer)),
          Effect.catchTag(
            "ParseError",
            (error) =>
              new MigrationError({
                message: "Failed to parse customers",
                cause: error,
              })
          )
        );
      }),
  });
});

export const layer = Layer.scoped(Migration, make);
