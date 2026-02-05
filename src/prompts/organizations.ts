import { Prompt } from "@effect/cli";
import { Effect } from "effect";
import { OrganizationCreate } from "../schemas/Organization";
import * as Polar from "../services/polar";
import { slugify } from "../utils";

const selectOrganizationPrompt = Effect.gen(function* () {
  const polar = yield* Polar.Polar;
  const organizations = yield* polar
    .use((client) =>
      client.organizations.list({
        page: 1,
        limit: 100,
      })
    )
    .pipe(Effect.map((organizations) => organizations.result.items));

  return yield* Prompt.select({
    message: "Select Organization",
    choices: [
      ...organizations.map((organization) => ({
        value: organization.id,
        title: organization.name,
      })),
      { value: "new", title: "+ Create New Organization" },
    ],
  });
});

const organizationNamePrompt = Prompt.text({
  message: "Organization Name",
});

const organizationSlugPrompt = (name: string) =>
  Prompt.text({
    message: "Organization Slug",
    default: slugify(name),
  });

const createNewOrganizationPrompt = Effect.gen(function* () {
  const polar = yield* Polar.Polar;
  const name = yield* organizationNamePrompt;
  const slug = yield* organizationSlugPrompt(name);

  const organizationCreate = OrganizationCreate.make({
    name,
    slug,
  });

  const organization = yield* polar.use((client) =>
    client.organizations.create(organizationCreate)
  );

  return organization.id;
});

export const organizationPrompt = selectOrganizationPrompt.pipe(
  Effect.flatMap((organization) => {
    if (organization === "new") {
      return createNewOrganizationPrompt;
    }

    return Effect.succeed(organization);
  })
);

export const organizationLoginPrompt = Effect.gen(function* () {
  const polar = yield* Polar.Polar;
  const organizations = yield* polar
    .use((client) =>
      client.organizations.list({
        page: 1,
        limit: 100,
      })
    )
    .pipe(Effect.map((organizations) => organizations.result.items));

  const selectedId = yield* Prompt.select({
    message: "Select Organization",
    choices: organizations.map((organization) => ({
      value: organization.id,
      title: organization.name,
    })),
  });

  const selected = organizations.find((org) => org.id === selectedId)!;

  return { id: selected.id, slug: selected.slug };
});
