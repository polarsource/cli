import { Command } from "@effect/cli";
import { migrate } from "./commands";
import { Effect, Layer } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import * as LemonSqueezy from "./services/migration/lemonSqueezy";
import * as Migration from "./services/migrate";

const VERSION = "v1.0.0";

const mainCommand = Command.make("polar").pipe(
  Command.withSubcommands([migrate])
);

const cli = Command.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION,
});

const MigrationProviders = Layer.mergeAll(LemonSqueezy.layer);

const AllServices = Layer.mergeAll(
  Layer.provideMerge(Migration.layer, MigrationProviders),
  NodeContext.layer
);

cli(process.argv).pipe(Effect.provide(AllServices), NodeRuntime.runMain);
