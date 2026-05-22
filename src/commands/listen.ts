import { Args, Command } from "@effect/cli";
import { Effect, Either, Redacted, Schema } from "effect";
import { EventSource } from "eventsource";
import { environmentPrompt } from "../prompts/environment";
import { organizationLoginPrompt } from "../prompts/organizations";
import {
  ListenAck,
  ListenReconnect,
  ListenWebhookEvent,
} from "../schemas/Events";
import type { Token } from "../schemas/Tokens";
import * as OAuth from "../services/oauth";

const LISTEN_BASE_URLS = {
  production: "https://api.polar.sh/v1/cli/listen",
  sandbox: "https://sandbox-api.polar.sh/v1/cli/listen",
} as const;

const url = Args.text({ name: "url" });

export const listen = Command.make("listen", { url }, ({ url }) =>
  Effect.gen(function* () {
    const environment = yield* environmentPrompt;
    const oauth = yield* OAuth.OAuth;
    const organization = yield* organizationLoginPrompt(environment);
    const listenUrl = `${LISTEN_BASE_URLS[environment]}/${organization.id}`;

    const startListening = (accessToken: string) =>
      Effect.async<void, OAuth.OAuthError>((resume) => {
        const eventSource = new EventSource(listenUrl, {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              headers: {
                ...init.headers,
                Authorization: `Bearer ${accessToken}`,
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
            console.log("");
            console.log(`  ${dim}Waiting for events...${reset}`);
            console.log("");

            return;
          }

          const reconnect = Schema.decodeUnknownEither(ListenReconnect)(json);

          if (Either.isRight(reconnect)) {
            return;
          }

          const webhookEvent =
            Schema.decodeUnknownEither(ListenWebhookEvent)(json);

          if (Either.isLeft(webhookEvent)) {
            console.error(">> Failed to decode event");
            return;
          }

          fetch(url, {
            method: "POST",
            headers: webhookEvent.right.headers,
            body: JSON.stringify(webhookEvent.right.payload.payload),
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
          if (error.code === undefined) {
            return;
          }

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

    const listenWithToken = (
      token: Token,
      retried = false,
    ): Effect.Effect<void, OAuth.OAuthError, never> =>
      startListening(Redacted.value(token.token)).pipe(
        Effect.catchTag("OAuthError", (error) => {
          if (retried || !isUnauthorized(error)) {
            return Effect.fail(error);
          }

          return oauth
            .login(environment)
            .pipe(
              Effect.flatMap((newToken) => listenWithToken(newToken, true)),
            );
        }),
      );

    const token = yield* oauth.resolveAccessToken(environment);
    yield* listenWithToken(token);
  }),
);
