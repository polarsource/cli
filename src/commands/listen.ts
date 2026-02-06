import { Args, Command } from "@effect/cli";
import { Effect, Either, Redacted, Schema } from "effect";
import { EventSource } from "eventsource";
import { organizationLoginPrompt } from "../prompts/organizations";
import { ListenAck, ListenWebhookEvent } from "../schemas/Events";
import * as OAuth from "../services/oauth";

const LISTEN_BASE_URL = "https://api.polar.sh/v1/cli/listen";

const url = Args.text({ name: "url" });

export const listen = Command.make("listen", { url }, ({ url }) =>
  Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    const token = yield* oauth.resolveAccessToken("production");
    const accessToken = Redacted.value(token.token);

    const organization = yield* organizationLoginPrompt;
    const listenUrl = `${LISTEN_BASE_URL}/${organization.id}`;

    yield* Effect.async<void, OAuth.OAuthError>((resume) => {
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
            console.log(
              `>> '${webhookEvent.right.payload.payload.type}' >> ${res.status} ${res.statusText}`,
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
              message: error.message ?? "Event stream error",
              cause: error,
            }),
          ),
        );
      };

      return Effect.sync(() => {
        eventSource.close();
      });
    });
  }),
);
