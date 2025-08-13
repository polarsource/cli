import { Command } from "@effect/cli";
import { migrate } from "./commands";
import {Effect} from 'effect'
import { NodeContext, NodeRuntime } from "@effect/platform-node";

const VERSION = 'v1.0.0'

const mainCommand = Command.make('polar').pipe(
    Command.withSubcommands([migrate])
)

const cli = Command.run(mainCommand, {
    name: 'Polar CLI',
    version: VERSION
})

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
