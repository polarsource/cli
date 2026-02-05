import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { organizationLoginPrompt } from "../prompts/organizations";
import * as OAuth from "../services/oauth";

export const login = Command.make("login", {}, () =>
  Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    yield* oauth.login("production");

    const organization = yield* organizationLoginPrompt;
    yield* oauth.setOrganization(
      "production",
      organization.id,
      organization.slug,
    );

    yield* Console.log(
      `Successfully logged into Polar (organization: ${organization.slug})`,
    );
  })
);
