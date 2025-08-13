// src/cli.ts
import { Command as Command2 } from "@effect/cli";

// src/commands.ts
import { Command, Options, Prompt } from "@effect/cli";
import { Console, Effect as Effect3 } from "effect";
import { Option } from "effect";

// src/services/migrate.ts
import { Context as Context2, Effect as Effect2, Schema as Schema3 } from "effect";

// src/services/migration/lemonSqueezy.ts
import { Config, Context, Data, Effect, Layer, Redacted } from "effect";
import {
  getAuthenticatedUser,
  lemonSqueezySetup,
  listDiscounts,
  listFiles,
  listProducts,
  listStores,
  listVariants,
  listCustomers
} from "@lemonsqueezy/lemonsqueezy.js";
var LemonSqueezyError = class extends Data.TaggedError("LemonSqueezyError") {
};
var LemonSqueezy = class extends Context.Tag("LemonSqueezy")() {
};
var make = Effect.gen(function* () {
  const apiKey = yield* Config.redacted(Config.string("LEMON_SQUEEZY_API_KEY"));
  const client = createLemonClient(Redacted.value(apiKey));
  return LemonSqueezy.of({
    use: (fn) => Effect.gen(function* () {
      const result = yield* Effect.try({
        try: () => fn(client),
        catch: (error) => new LemonSqueezyError({
          message: "Failed to fetch data from Lemon Squeezy",
          cause: error
        })
      });
      if (result instanceof Promise) {
        return yield* Effect.tryPromise({
          try: () => result,
          catch: (error) => new LemonSqueezyError({
            message: "Failed to fetch data from Lemon Squeezy",
            cause: error
          })
        });
      }
      return result;
    })
  });
});
var layer = Layer.scoped(LemonSqueezy, make);
var createLemonClient = (apiKey) => {
  lemonSqueezySetup({
    apiKey,
    onError: (error) => new LemonSqueezyError({ message: error.message })
  });
  return {
    getAuthenticatedUser,
    listStores,
    listProducts,
    listDiscounts,
    listFiles,
    listVariants,
    listCustomers
  };
};

// src/schemas/Product.ts
import { Schema } from "effect";
var Product = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  price: Schema.Number
});

// src/schemas/Customer.ts
import { Schema as Schema2 } from "effect";
var Customer = Schema2.Struct({
  id: Schema2.String,
  name: Schema2.String,
  email: Schema2.String
});

// src/services/migrate.ts
var Migration = class extends Context2.Tag("Migration")() {
};
var make2 = Effect2.gen(function* () {
  const migrationProvider2 = yield* resolveMigrationProvider("lemonSqueezy");
  return Migration.of({
    products: () => Effect2.gen(function* () {
      const products = migrationProvider2.use(async (client) => {
        const products2 = await client.listProducts();
        return products2.data?.data ?? [];
      });
      const parsedProducts = yield* products.pipe(
        Effect2.map(
          (productData) => productData.map((product) => ({
            id: product.id,
            name: product.attributes.name,
            description: product.attributes.description,
            price: product.attributes.price
          }))
        ),
        Schema3.decodeUnknown(Schema3.Array(Product)),
        Effect2.catchTag(
          "ParseError",
          (error) => Effect2.die(new Error(error.message))
        )
      );
      return parsedProducts;
    }),
    customers: () => Effect2.gen(function* () {
      const customers = migrationProvider2.use(async (client) => {
        const customers2 = await client.listCustomers();
        return customers2.data?.data ?? [];
      });
      const parsedCustomers = yield* customers.pipe(
        Effect2.map(
          (customerData) => customerData.map((customer) => ({
            id: customer.id,
            name: customer.attributes.name,
            email: customer.attributes.email
          }))
        ),
        Schema3.decodeUnknown(Schema3.Array(Customer)),
        Effect2.catchTag(
          "ParseError",
          (error) => Effect2.die(new Error(error.message))
        )
      );
      return parsedCustomers;
    })
  });
});
var resolveMigrationProvider = (provider) => Effect2.gen(function* () {
  switch (provider) {
    case "lemonSqueezy":
      return yield* LemonSqueezy;
    default:
      throw new Error("Invalid migration provider");
  }
});

// src/commands.ts
var migrationProvider = Options.choice("provider", [
  "lemonSqueezy",
  "paddle",
  "stripe"
]).pipe(Options.withAlias("p"), Options.optional);
var migrationAPIKey = Options.redacted("migrationAPIKey");
var migrate = Command.make(
  "migrate",
  { migrationProvider, migrationAPIKey },
  ({ migrationProvider: migrationProvider2, migrationAPIKey: migrationAPIKey2 }) => Effect3.gen(function* () {
    const provider = Option.match(migrationProvider2, {
      onSome: (provider2) => provider2,
      onNone: () => null
    });
    yield* Effect3.log(provider, migrationAPIKey2);
    const migration = yield* Migration;
    const products = yield* migration.products();
    const customers = yield* migration.customers();
    Prompt.text({
      message: "Enter the API key for the migration provider",
      validate: (value) => {
        if (value.length === 0) {
          return Effect3.fail("API Key is required");
        }
        return Effect3.succeed(value);
      }
    }).pipe(Prompt.run);
    return Console.log(products, customers);
  })
);
var LemonSqueezyAPIKey = Options.redacted("lemonSqueezyAPIKey");

// src/cli.ts
import { Effect as Effect4, Layer as Layer2 } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
var VERSION = "v1.0.0";
var mainCommand = Command2.make("polar").pipe(
  Command2.withSubcommands([migrate])
);
var cli = Command2.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION
});
var AllServices = Layer2.mergeAll(layer, NodeContext.layer);
cli(process.argv).pipe(Effect4.provide(AllServices), NodeRuntime.runMain);
