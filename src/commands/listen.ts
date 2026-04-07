import { Args, Command, Options } from "@effect/cli";
import { createHmac, randomUUID } from "node:crypto";
import { Effect, Either, Option, Redacted, Schema } from "effect";
import { EventSource } from "eventsource";
import { environmentPrompt } from "../prompts/environment";
import { organizationLoginPrompt } from "../prompts/organizations";
import { ListenAck, ListenWebhookEvent } from "../schemas/Events";
import type { Token } from "../schemas/Tokens";
import * as OAuth from "../services/oauth";
import * as Polar from "../services/polar";

const LISTEN_BASE_URLS = {
  production: "https://api.polar.sh/v1/cli/listen",
  sandbox: "https://sandbox-api.polar.sh/v1/cli/listen",
} as const;

const API_BASE_URLS = {
  production: "https://api.polar.sh",
  sandbox: "https://sandbox-api.polar.sh",
} as const;

const url = Args.text({ name: "url" });

const accessTokenOption = Options.text("access-token").pipe(
  Options.optional,
  Options.withDescription(
    "Personal access token (skips OAuth login). Can also be set via POLAR_ACCESS_TOKEN env var.",
  ),
);

const envOption = Options.choice("env", ["sandbox", "production"]).pipe(
  Options.optional,
  Options.withDescription(
    "Environment to use (skips interactive prompt). Can also be set via POLAR_ENVIRONMENT env var.",
  ),
);

const orgOption = Options.text("org").pipe(
  Options.optional,
  Options.withDescription(
    "Organization slug or ID (skips interactive prompt). Auto-selects if only one org exists.",
  ),
);

const webhookSecretOption = Options.text("webhook-secret").pipe(
  Options.optional,
  Options.withDescription(
    "Webhook secret to re-sign forwarded payloads (standardwebhooks format). " +
      "Can also be set via POLAR_WEBHOOK_SECRET env var. " +
      "When provided, the relay re-signs each payload so the receiving app's " +
      "signature verification passes.",
  ),
);

/**
 * Re-sign a webhook payload using the standardwebhooks format.
 * This matches how @polar-sh/sdk's `validateEvent` verifies signatures:
 * HMAC-SHA256 with base64(secret) as the key, over "msgId.timestamp.body".
 */
function signPayload(
  body: string,
  secret: string,
): Record<string, string> {
  const msgId = `msg_${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const toSign = `${msgId}.${timestamp}.${body}`;
  const key = Buffer.from(secret, "utf-8").toString("base64");
  const sig = createHmac("sha256", Buffer.from(key, "base64"))
    .update(toSign)
    .digest("base64");
  return {
    "webhook-id": msgId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${sig}`,
    "content-type": "application/json",
  };
}

/**
 * Resolve the environment from (in order of priority):
 * 1. --env flag
 * 2. POLAR_ENVIRONMENT env var
 * 3. Interactive prompt
 */
const resolveEnvironment = (
  envFlag: Option.Option<string>,
): Effect.Effect<OAuth.PolarEnvironment> => {
  if (Option.isSome(envFlag)) {
    return Effect.succeed(envFlag.value as OAuth.PolarEnvironment);
  }
  const envVar = process.env.POLAR_ENVIRONMENT;
  if (envVar === "sandbox" || envVar === "production") {
    return Effect.succeed(envVar);
  }
  return environmentPrompt;
};

/**
 * Resolve the access token from (in order of priority):
 * 1. --access-token flag
 * 2. POLAR_ACCESS_TOKEN env var
 * 3. OAuth login flow
 */
const resolveAccessToken = (
  tokenFlag: Option.Option<string>,
  environment: OAuth.PolarEnvironment,
): Effect.Effect<string, OAuth.OAuthError, OAuth.OAuth> => {
  if (Option.isSome(tokenFlag)) {
    return Effect.succeed(tokenFlag.value);
  }
  const envVar = process.env.POLAR_ACCESS_TOKEN;
  if (envVar) {
    return Effect.succeed(envVar);
  }
  return Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    const token = yield* oauth.resolveAccessToken(environment);
    return Redacted.value(token.token);
  });
};

/**
 * Resolve the organization. When using a personal access token (non-OAuth),
 * we fetch orgs directly from the API. When using OAuth, we use the existing
 * interactive prompt.
 *
 * Resolution order:
 * 1. --org flag (slug or ID)
 * 2. Auto-select if only one org
 * 3. Interactive prompt (OAuth flow only)
 */
const resolveOrganization = (
  orgFlag: Option.Option<string>,
  environment: OAuth.PolarEnvironment,
  accessToken: string,
  isPersonalToken: boolean,
): Effect.Effect<
  { id: string; slug: string; name: string },
  OAuth.OAuthError | Polar.PolarError
> => {
  if (isPersonalToken) {
    // When using a personal access token, fetch orgs directly via API
    return Effect.gen(function* () {
      const baseUrl = API_BASE_URLS[environment];
      const res = yield* Effect.tryPromise({
        try: () =>
          fetch(`${baseUrl}/v1/organizations?page=1&limit=100`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }).then(async (r) => {
            if (!r.ok)
              throw new Error(`${r.status} ${await r.text()}`);
            return r.json() as Promise<{
              items: Array<{ id: string; slug: string; name: string }>;
            }>;
          }),
        catch: (error) =>
          new OAuth.OAuthError({
            message: `Failed to fetch organizations: ${error}`,
            cause: error,
          }),
      });

      const orgs = res.items;
      if (orgs.length === 0) {
        return yield* Effect.fail(
          new OAuth.OAuthError({
            message: "No organizations found for this access token",
          }),
        );
      }

      // If --org flag provided, match by slug or ID
      if (Option.isSome(orgFlag)) {
        const match = orgs.find(
          (o) => o.slug === orgFlag.value || o.id === orgFlag.value,
        );
        if (!match) {
          return yield* Effect.fail(
            new OAuth.OAuthError({
              message: `Organization "${orgFlag.value}" not found. Available: ${orgs.map((o) => o.slug).join(", ")}`,
            }),
          );
        }
        return match;
      }

      // Auto-select if only one org
      if (orgs.length === 1) {
        return orgs[0];
      }

      // Multiple orgs, no flag — fail with helpful message in headless mode
      return yield* Effect.fail(
        new OAuth.OAuthError({
          message: `Multiple organizations found. Use --org to select one: ${orgs.map((o) => o.slug).join(", ")}`,
        }),
      );
    });
  }

  // OAuth flow — use the interactive prompt
  return organizationLoginPrompt(environment);
};

export const listen = Command.make(
  "listen",
  { url, accessToken: accessTokenOption, env: envOption, org: orgOption, webhookSecret: webhookSecretOption },
  ({ url, accessToken: accessTokenFlag, env: envFlag, org: orgFlag, webhookSecret: webhookSecretFlag }) =>
    Effect.gen(function* () {
      const webhookSecret = Option.isSome(webhookSecretFlag)
        ? webhookSecretFlag.value
        : process.env.POLAR_WEBHOOK_SECRET ?? null;
      const environment = yield* resolveEnvironment(envFlag);
      const isPersonalToken =
        Option.isSome(accessTokenFlag) || !!process.env.POLAR_ACCESS_TOKEN;
      const accessToken = yield* resolveAccessToken(
        accessTokenFlag,
        environment,
      );
      const organization = yield* resolveOrganization(
        orgFlag,
        environment,
        accessToken,
        isPersonalToken,
      );
      const listenUrl = `${LISTEN_BASE_URLS[environment]}/${organization.id}`;

      const startListening = (token: string) =>
        Effect.async<void, OAuth.OAuthError>((resume) => {
          const eventSource = new EventSource(listenUrl, {
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                headers: {
                  ...init.headers,
                  Authorization: `Bearer ${token}`,
                },
              }),
          });

          eventSource.onmessage = (event) => {
            const json = JSON.parse(event.data);
            const ack = Schema.decodeUnknownEither(ListenAck)(json);

            if (Either.isRight(ack)) {
              const { secret } = ack.right;
              const dim = "\x1b[2m";
              const bold = "\x1b[1m";
              const cyan = "\x1b[36m";
              const reset = "\x1b[0m";

              console.log("");
              console.log(
                `  ${bold}${cyan}Connected${reset}  ${bold}${organization.name}${reset}`,
              );
              console.log(`  ${dim}Secret${reset}     ${secret}`);
              console.log(`  ${dim}Forwarding${reset} ${url}`);
              if (webhookSecret) {
                console.log(`  ${dim}Signing${reset}    enabled (--webhook-secret)`);
              }
              console.log("");
              console.log(`  ${dim}Waiting for events...${reset}`);
              console.log("");

              return;
            }

            const webhookEvent =
              Schema.decodeUnknownEither(ListenWebhookEvent)(json);

            if (Either.isLeft(webhookEvent)) {
              const dim = "\x1b[2m";
              const reset = "\x1b[0m";
              const type = json?.type ?? json?.payload?.type ?? "unknown";
              console.error(`>> Failed to decode event: ${dim}${type}${reset}`);
              console.error(`   ${dim}${JSON.stringify(json).slice(0, 200)}${reset}`);
              return;
            }

            const forwardBody = JSON.stringify(webhookEvent.right.payload.payload);
            const forwardHeaders = webhookSecret
              ? signPayload(forwardBody, webhookSecret)
              : webhookEvent.right.headers;

            fetch(url, {
              method: "POST",
              headers: forwardHeaders,
              body: forwardBody,
            })
              .then((res) => {
                const cyan = "\x1b[36m";
                const reset = "\x1b[0m";
                console.log(
                  `>> '${cyan}${webhookEvent.right.payload.payload.type}${reset}' >> ${res.status} ${res.statusText}`,
                );
              })
              .catch((err) => {
                console.error(`>> Failed to forward event: ${err}`);
              });
          };

          eventSource.onerror = (error) => {
            eventSource.close();
            resume(
              Effect.fail(
                new OAuth.OAuthError({
                  message:
                    error.message ??
                    (error.code
                      ? `Event stream error (${error.code})`
                      : "Event stream error"),
                  cause: error,
                }),
              ),
            );
          };

          return Effect.sync(() => {
            eventSource.close();
          });
        });

      const isUnauthorized = (error: OAuth.OAuthError) =>
        (typeof error.cause === "object" &&
          error.cause !== null &&
          "code" in error.cause &&
          (error.cause as { code?: number }).code === 401) ||
        error.message.includes("401");

      const RECONNECT_DELAY_MS = 3_000;
      const MAX_RECONNECT_DELAY_MS = 30_000;

      const listenWithRetry = (
        token: string,
        authRetried = false,
        reconnectDelay = RECONNECT_DELAY_MS,
      ): Effect.Effect<void, OAuth.OAuthError, never> =>
        startListening(token).pipe(
          Effect.catchTag("OAuthError", (error) => {
            // 401 — try refreshing the token once
            if (isUnauthorized(error)) {
              if (authRetried) return Effect.fail(error);

              if (isPersonalToken) {
                return Effect.fail(
                  new OAuth.OAuthError({
                    message:
                      "Access token was rejected (401). Check that your token is valid and has the required scopes.",
                  }),
                );
              }

              return Effect.gen(function* () {
                const oauth = yield* OAuth.OAuth;
                const newToken = yield* oauth.login(environment);
                return yield* listenWithRetry(
                  Redacted.value(newToken.token),
                  true,
                );
              });
            }

            // Non-auth error (SSE disconnect, network hiccup) — reconnect
            const yellow = "\x1b[33m";
            const dim = "\x1b[2m";
            const reset = "\x1b[0m";
            const delaySec = (reconnectDelay / 1000).toFixed(0);
            console.error(
              `\n  ${yellow}Connection lost${reset} ${dim}(${error.message})${reset}`,
            );
            console.error(
              `  ${dim}Reconnecting in ${delaySec}s...${reset}\n`,
            );

            const nextDelay = Math.min(
              reconnectDelay * 2,
              MAX_RECONNECT_DELAY_MS,
            );
            return Effect.sleep(reconnectDelay).pipe(
              Effect.flatMap(() =>
                listenWithRetry(token, false, nextDelay),
              ),
            );
          }),
        );

      yield* listenWithRetry(accessToken);
    }),
);
