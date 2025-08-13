import { Command, Options } from "@effect/cli";
import { Console } from "effect";
import { Option } from "effect";

const migrationProvider = Options.choice("provider", [
  "lemonSqueezy",
  "paddle",
  "stripe",
]).pipe(Options.withAlias("p"), Options.optional);

export const migrate = Command.make(
  "migrate",
  { migrationProvider },
  ({ migrationProvider }) => {
    const provider = Option.match(migrationProvider, {
      onSome: (provider) => provider,
      onNone: () => null,
    });

    return Console.log("Test", provider);
  }
);

export const LemonSqueezyAPIKey = Options.redacted("lemonSqueezyAPIKey");
