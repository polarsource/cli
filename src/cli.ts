import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { migrate } from "./commands/migrate";
import * as Migration from "./services/migrate";

const VERSION = "v1.0.0";

const mainCommand = Command.make("polar").pipe(
  Command.withSubcommands([migrate])
);

const cli = Command.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION,
});

const AllServices = Layer.mergeAll(Migration.layer, NodeContext.layer);

cli(process.argv).pipe(Effect.provide(AllServices), NodeRuntime.runMain);
