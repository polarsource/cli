// src/cli.ts
import { Command as Command2 } from "@effect/cli";

// src/commands.ts
import { Command, Options } from "@effect/cli";
var migrationProviders = ["lemonSqueezy", "paddle", "stripe"];
var migrationProviderOption = Options.choice("provider", migrationProviders);
var migrate = Command.make("migrate", { migrationProviderOption });

// src/cli.ts
import { Effect } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
var VERSION = "v1.0.0";
var cli = Command2.run(migrate, {
  name: "Polar CLI",
  version: VERSION
});
cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
