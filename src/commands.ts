import { Command, Options } from "@effect/cli";
import { Console } from "effect";

const migrationProvider = Options.choice("provider", [
	"lemonSqueezy",
	"paddle",
	"stripe",
]).pipe(Options.withAlias("p"), Options.optional);

export const migrate = Command.make(
	"migrate",
	{ migrationProvider },
	({ migrationProvider }) => {
		return Console.log("Test", migrationProvider);
	},
);
