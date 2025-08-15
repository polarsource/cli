import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import * as OAuth from "../services/oauth";

export const login = Command.make("login", {}, () =>
  Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    yield* oauth.login("production");

    yield* Console.log("Successfully logged into Polar");
  })
);
