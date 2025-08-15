import { Scope } from "@polar-sh/sdk/models/components/scope";
import { Schema } from "effect";

export const TokenScope = Schema.Array(Schema.Literal(...Object.values(Scope)));

export const Token = Schema.Struct({
  token: Schema.String,
  refreshToken: Schema.String,
  expiresIn: Schema.DurationFromMillis,
  scope: TokenScope,
  server: Schema.Literal("production", "sandbox"),
});

export type Token = Schema.Schema.Type<typeof Token>;

export const Tokens = Schema.partial(
  Schema.Struct({
    production: Token,
    sandbox: Token,
  })
);

export type Tokens = Schema.Schema.Type<typeof Tokens>;
