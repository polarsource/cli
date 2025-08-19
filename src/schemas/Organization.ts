import { Schema } from "effect";

export const OrganizationCreate = Schema.Struct({
  name: Schema.String,
  slug: Schema.String,
});

export type OrganizationCreate = Schema.Schema.Type<typeof OrganizationCreate>;
