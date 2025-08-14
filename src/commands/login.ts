import { Command } from "@effect/cli";
import { Effect } from "effect";
import * as OAuth from "../services/oauth";

export const login = Command.make("login", {}, () =>
  Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    const accessToken = yield* oauth.login("production");

    yield* Effect.log(accessToken);
  })
);
