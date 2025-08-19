import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { login } from "./commands/login";
import { migrate } from "./commands/migrate";
import { organization } from "./commands/organization";
import * as Migration from "./services/migration/migrate";
import * as OAuth from "./services/oauth";

const VERSION = "v1.0.0";

const mainCommand = Command.make("polar").pipe(
  Command.withSubcommands([login, migrate, organization])
);

const cli = Command.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION,
});

const services = Layer.mergeAll(
  OAuth.layer,
  Migration.layer,
  NodeContext.layer
);

cli(process.argv).pipe(Effect.provide(services), NodeRuntime.runMain);
