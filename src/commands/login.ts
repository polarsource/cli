import { Command, Prompt } from "@effect/cli";
import { Effect } from "effect";

export const login = Command.make("login", {}, () =>
  Effect.gen(function* () {
    const apiKey = yield* Prompt.text({
      message: "Enter the API Key",
    }).pipe(Prompt.run);
  })
);
