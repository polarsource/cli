import { Command, Options, Prompt } from "@effect/cli";
import { Effect } from "effect";
import * as Migration from "../services/migration/migrate";
import * as LemonSqueezy from "../services/migration/providers/lemonSqueezy";
import * as Polar from "../services/polar";

const migrationProviders = [
  { value: "lemonSqueezy", title: "Lemon Squeezy" },
  { value: "paddle", title: "Paddle", disabled: true },
  { value: "stripe", title: "Stripe", disabled: true },
] as const;

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const selectedProviderPrompt = Prompt.select({
      message: "Select Migration Provider",
      choices: migrationProviders,
    });

    const entitiesToMigratePrompt = Prompt.multiSelect({
      message: "Select Entities to Migrate",
      choices: [
        { value: "products", title: "Products" },
        { value: "customers", title: "Customers" },
      ],
    });

    const apiKeyPrompt = Prompt.text({
      message: "Enter the API Key",
      validate: (value) => {
        if (value.length === 0) {
          return Effect.fail("API Key is required");
        }

        return Effect.succeed(value);
      },
    });

    const provider = yield* Prompt.all([
      selectedProviderPrompt,
      apiKeyPrompt,
    ]).pipe(
      Prompt.run,
      Effect.flatMap(([provider, apiKey]) => resolveProvider(provider, apiKey))
    );

    const migration = yield* Migration.Migration;

    yield* entitiesToMigratePrompt.pipe(
      Prompt.run,
      Effect.flatMap((entitiesToMigrate) =>
        Effect.all(
          {
            products: entitiesToMigrate.includes("products")
              ? migration.products(provider)
              : Effect.succeed([]),
            customers: entitiesToMigrate.includes("customers")
              ? migration.customers(provider)
              : Effect.succeed([]),
          },
          {
            concurrency: "unbounded",
          }
        )
      ),
      Effect.provide(Polar.layer("production"))
    );
  })
);

export const LemonSqueezyAPIKey = Options.redacted("lemonSqueezyAPIKey");

const resolveProvider = (
  provider: "lemonSqueezy" | "paddle" | "stripe",
  apiKey: string
) => {
  switch (provider) {
    case "lemonSqueezy":
      return LemonSqueezy.make(apiKey);
    default:
      return Effect.die("Unsupported Migration Provider");
  }
};
