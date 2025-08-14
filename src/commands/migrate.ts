import { Command, Options, Prompt } from "@effect/cli";
import { Effect } from "effect";
import * as Migration from "../services/migrate";
import * as LemonSqueezy from "../services/migration/lemonSqueezy";

const migrationProviders = [
  { value: "lemonSqueezy", title: "Lemon Squeezy" },
  { value: "paddle", title: "Paddle", disabled: true },
  { value: "stripe", title: "Stripe", disabled: true },
] as const;

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const selectedProvider = yield* Prompt.select({
      message: "Select Migration Provider",
      choices: migrationProviders,
    }).pipe(Prompt.run);

    const apiKey = yield* Prompt.text({
      message: "Enter the API Key",
      validate: (value) => {
        if (value.length === 0) {
          return Effect.fail("API Key is required");
        }

        return Effect.succeed(value);
      },
    }).pipe(Prompt.run);

    yield* Effect.log(selectedProvider, apiKey);

    const provider = yield* resolveProvider(selectedProvider, apiKey);

    const migration = yield* Effect.gen(function* () {
      const client = yield* Migration.Migration;
      const products = yield* client.products(provider);
      return products;
    });

    yield* Effect.log(migration);
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
      return Effect.die("Invalid provider");
  }
};
