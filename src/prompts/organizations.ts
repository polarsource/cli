import { Prompt } from "@effect/cli";
import { Effect, Schema } from "effect";
import { OrganizationCreate } from "../schemas/Organization";
import * as Polar from "../services/polar";
import { slugify } from "../utils";

const organizationNamePrompt = Prompt.text({
  message: "Organization Name",
});

const organizationSlugPrompt = (name: string) =>
  Prompt.text({
    message: "Organization Slug",
    default: slugify(name),
  });

const createNewOrganizationPrompt = Effect.gen(function* () {
  const name = yield* organizationNamePrompt;
  const slug = yield* organizationSlugPrompt(name);

  return yield* Schema.decode(OrganizationCreate)({ name, slug });
}).pipe(
  Effect.flatMap((organizationCreate) =>
    Effect.gen(function* () {
      const polar = yield* Polar.Polar;
      const organization = yield* polar.use((client) =>
        client.organizations.create(organizationCreate)
      );

      return organization.id;
    })
  )
);

export const OrganizationPrompt = Effect.gen(function* () {
  const polar = yield* Polar.Polar;
  const organizations = yield* polar
    .use((client) =>
      client.organizations.list({
        page: 1,
        limit: 100,
      })
    )
    .pipe(Effect.map((organizations) => organizations.result.items));

  const organization = yield* Prompt.select({
    message: "Select Organization",
    choices: [
      ...organizations.map((organization) => ({
        value: organization.id,
        title: organization.name,
      })),
      { value: "new", title: "+ Create New Organization" },
    ] as const,
  }).pipe(
    Prompt.run,
    Effect.flatMap((organization) => {
      if (organization === "new") {
        return createNewOrganizationPrompt;
      }

      return Effect.succeed(organization);
    })
  );

  return organization;
});
