import { Schema } from "effect";

export const TokenScope = Schema.Array(
  Schema.Literal(
    "web:read",
    "web:write",
    "openid",
    "profile",
    "email",
    "user:read",
    "organizations:read",
    "organizations:write",
    "products:read",
    "products:write",
    "benefits:read",
    "benefits:write",
    "discounts:read",
    "discounts:write",
    "files:write",
    "files:read",
    "customers:write",
    "customers:read",
  ),
);

export const Token = Schema.Struct({
  token: Schema.Redacted(Schema.String),
  refreshToken: Schema.Redacted(Schema.String),
  expiresIn: Schema.DurationFromMillis,
  expiresAt: Schema.Date,
  scope: TokenScope,
  server: Schema.Literal("production", "sandbox"),
  organizationId: Schema.optional(Schema.String),
  organizationSlug: Schema.optional(Schema.String),
});
export type Token = Schema.Schema.Type<typeof Token>;
export type TokenJSON = Schema.Schema.Encoded<typeof Token>;

export const Tokens = Schema.Struct({
  production: Schema.optional(Token),
  sandbox: Schema.optional(Token),
});
export type Tokens = Schema.Schema.Type<typeof Tokens>;
export type TokensJSON = Schema.Schema.Encoded<typeof Tokens>;
