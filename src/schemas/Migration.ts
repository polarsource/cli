import { Schema } from "effect";

export const MigrationOrigin = Schema.String.pipe(
  Schema.brand("MigrationOrigin")
);
export type MigrationOrigin = Schema.Schema.Type<typeof MigrationOrigin>;

export const MigrationDestination = Schema.String.pipe(
  Schema.brand("MigrationDestination")
);
export type MigrationDestination = Schema.Schema.Type<
  typeof MigrationDestination
>;

export const MigrationContext = Schema.Struct({
  from: MigrationOrigin,
  to: MigrationDestination,
});
export type MigrationContext = Schema.Schema.Type<typeof MigrationContext>;
