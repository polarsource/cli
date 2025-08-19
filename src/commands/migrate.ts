import { Command, Options, Prompt } from "@effect/cli";
import { Effect } from "effect";
import {
  apiKeyPrompt,
  migrationPrompt,
  providerPrompt,
} from "../prompts/migration";
import * as Migration from "../services/migration/migrate";
import * as LemonSqueezy from "../services/migration/providers/lemonSqueezy";
import * as Polar from "../services/polar";

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const provider = yield* Prompt.all([providerPrompt, apiKeyPrompt]).pipe(
      Prompt.run,
      Effect.flatMap(([provider, apiKey]) => resolveProvider(provider, apiKey))
    );

    const migration = yield* Migration.Migration;

    yield* migrationPrompt.pipe(
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
