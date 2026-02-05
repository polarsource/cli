import { Args, Command } from "@effect/cli";
import { Console, Effect, Redacted } from "effect";
import { EventSource } from "eventsource";
import * as OAuth from "../services/oauth";

const LISTEN_BASE_URL = "https://api.polar.sh/v1/cli/listen";

const url = Args.text({ name: "url" });

export const listen = Command.make("listen", { url }, ({ url }) =>
  Effect.gen(function* () {
    const oauth = yield* OAuth.OAuth;
    const token = yield* oauth.resolveAccessToken("production");
    const accessToken = Redacted.value(token.token);

    if (!token.organizationId) {
      return yield* Effect.fail(
        new OAuth.OAuthError({
          message:
            "No organization selected. Please run `polar login` first to select an organization.",
        }),
      );
    }

    const listenUrl = `${LISTEN_BASE_URL}/${token.organizationId}`;

    yield* Console.log(`Listening for events, forwarding to ${url}...`);

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
