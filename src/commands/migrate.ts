import { Command, Options, Prompt } from "@effect/cli";
import { Console, Effect, type Redacted } from "effect";
import * as LemonSqueezy from "../services/migration/lemonSqueezy";
import * as OAuth from "../services/oauth";

const migrationProviders = [
  { value: "lemonSqueezy", title: "Lemon Squeezy" },
  { value: "paddle", title: "Paddle", disabled: true },
  { value: "stripe", title: "Stripe", disabled: true },
] as const;

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    const isAuthenticated = yield* oauth.isAuthenticated("production");

    let accessToken: Redacted.Redacted<string>;

    if (!isAuthenticated) {
      accessToken = yield* oauth.login("production");
    } else {
      accessToken = yield* oauth.getAccessToken("production");
    }

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

    const [selectedProvider, entitiesToMigrate, apiKey] = yield* Prompt.all([
      selectedProviderPrompt,
      entitiesToMigratePrompt,
      apiKeyPrompt,
    ]).pipe(Prompt.run);

    const provider = yield* resolveProvider(selectedProvider, apiKey);
    const entities = yield* Effect.all(
      entitiesToMigrate.map((entity) => {
        switch (entity) {
          case "products":
            return provider.use((client) => client.listProducts());
          case "customers":
            return provider.use((client) => client.listCustomers());
        }
      })
    );

    yield* Console.log(entities);
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
