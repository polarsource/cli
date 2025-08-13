import { Context, Effect, Layer, pipe, Schema } from "effect";
import * as LemonSqueezy from "./migration/lemonSqueezy";
import { Product } from "../schemas/Product";
import { Customer } from "../schemas/Customer";

export interface MigrationImpl {
  products: () => Effect.Effect<readonly Product[]>;
  customers: () => Effect.Effect<readonly Customer[]>;
}

export class Migration extends Context.Tag("Migration")<
  Migration,
  MigrationImpl
>() {}

export const make = Effect.gen(function* () {
  const migrationProvider = yield* resolveMigrationProvider("lemonSqueezy");

  return Migration.of({
    products: () =>
      Effect.gen(function* () {
        const products = migrationProvider.use(async (client) => {
          const products = await client.listProducts();
          return products.data?.data ?? [];
        });

        const parsedProducts = yield* products.pipe(
          Effect.map((productData) =>
            productData.map((product) => ({
              id: product.id,
              name: product.attributes.name,
              description: product.attributes.description,
              price: product.attributes.price,
            }))
          ),
          Schema.decodeUnknown(Schema.Array(Product)),
          Effect.catchTag("ParseError", (error) =>
            Effect.die(new Error(error.message))
          )
        );

        return parsedProducts;
      }),
    customers: () =>
      Effect.gen(function* () {
        const customers = migrationProvider.use(async (client) => {
          const customers = await client.listCustomers();
          return customers.data?.data ?? [];
        });

        const parsedCustomers = yield* customers.pipe(
          Effect.map((customerData) =>
            customerData.map((customer) => ({
              id: customer.id,
              name: customer.attributes.name,
              email: customer.attributes.email,
            }))
          ),
          Schema.decodeUnknown(Schema.Array(Customer)),
          Effect.catchTag("ParseError", (error) =>
            Effect.die(new Error(error.message))
          )
        );

        return parsedCustomers;
      }),
  });
});

export const layer = Layer.scoped(Migration, make);

const resolveMigrationProvider = (provider: "lemonSqueezy" | "stripe") =>
  Effect.gen(function* () {
    switch (provider) {
      case "lemonSqueezy":
        return yield* LemonSqueezy.LemonSqueezy;
      default:
        throw new Error("Invalid migration provider");
    }
  });
