import { Command, Options, Prompt } from "@effect/cli";
import { Console, Effect } from "effect";
import { Migration } from "./services/migrate";

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    const selectedProvider = yield* Prompt.select({
      message: "Select Migration Provider",
      choices: [
        { value: "lemonSqueezy", title: "Lemon Squeezy" },
        { value: "paddle", title: "Paddle" },
        { value: "stripe", title: "Stripe" },
      ],
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

    const migration = yield* Migration;
    const products = yield* migration.products();
    const customers = yield* migration.customers();

    return Console.log(products, customers);
  })
);

export const LemonSqueezyAPIKey = Options.redacted("lemonSqueezyAPIKey");
