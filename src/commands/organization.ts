import { Command } from "@effect/cli";
import { Effect } from "effect";
import { OrganizationPrompt } from "../prompts/organizations";
import * as Polar from "../services/polar";

export const organization = Command.make("organization", {}, () =>
  Effect.gen(function* () {
    const organization = yield* OrganizationPrompt;

    yield* Effect.log(organization);
  }).pipe(Effect.provide(Polar.layer("production")))
);
