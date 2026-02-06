import { Args, Command } from "@effect/cli";
import { Effect, Either, Redacted, Schema } from "effect";
import { EventSource } from "eventsource";
import { organizationLoginPrompt } from "../prompts/organizations";
import { ListenAck } from "../schemas/Events";
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
        let parsed: {
          payload: {
            payload: unknown;
          };
          headers: Record<string, string>;
        };

        try {
          parsed = JSON.parse(event.data);
        } catch {
          console.error("Failed to parse event:", event.data);
          return;
        }

        const ack = Schema.decodeUnknownEither(ListenAck)(parsed);

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

        console.log(parsed);

        fetch(url, {
          method: "POST",
          headers: parsed.headers,
          body: JSON.stringify(parsed.payload?.payload),
        })
          .then((res) => {
            console.log(`>> ${res.status} ${res.statusText}`);
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
