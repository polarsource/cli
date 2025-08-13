import { Command, Options } from "@effect/cli";
import { Console, Effect } from "effect";
import { Option } from "effect";
import { Migration } from "./services/migrate";

export const migrationProvider = Options.choice("provider", [
  "lemonSqueezy",
  "paddle",
  "stripe",
]).pipe(Options.withAlias("p"), Options.optional);

export const migrationAPIKey = Options.redacted("migrationAPIKey");

export const migrate = Command.make(
  "migrate",
  { migrationProvider, migrationAPIKey },
  ({ migrationProvider, migrationAPIKey }) =>
    Effect.gen(function* () {
      const provider = Option.match(migrationProvider, {
        onSome: (provider) => provider,
        onNone: () => null,
      });

      yield* Effect.log(provider, migrationAPIKey);

      const migration = yield* Migration;

      const products = yield* migration.products();
      const customers = yield* migration.customers();

      return Console.log(products, customers);
    })
);

export const LemonSqueezyAPIKey = Options.redacted("lemonSqueezyAPIKey");
