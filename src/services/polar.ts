import { Polar as PolarSDK } from "@polar-sh/sdk";
import { Context, Data, Effect, Layer, Redacted } from "effect";
import * as OAuth from "./oauth";

const SANDBOX_SERVER_URL = "https://sandbox-api.polar.sh";
const PRODUCTION_SERVER_URL = "https://api.polar.sh";

export class PolarError extends Data.TaggedError("PolarError")<{
  message: string;
  cause?: unknown;
}> {}

export class Polar extends Context.Tag("Polar")<Polar, PolarImpl>() {}

interface PolarImpl {
  getClient: (
    server: "production" | "sandbox"
  ) => Effect.Effect<PolarSDK, PolarError, never>;
  use: <A, E>(
    fn: (client: PolarSDK) => Effect.Effect<A, E> | Promise<A>
  ) => Effect.Effect<A, PolarError | E, never>;
}

const PolarRequirementsLayer = Layer.mergeAll(OAuth.layer);

export const make = Effect.gen(function* () {
  const oauth = yield* OAuth.OAuth;

  const getClient = (server: "production" | "sandbox") =>
    Effect.gen(function* () {
      const token = yield* oauth.resolveAccessToken(server);

      const serverUrl =
        server === "production" ? PRODUCTION_SERVER_URL : SANDBOX_SERVER_URL;

      const client = new PolarSDK({
        serverURL: serverUrl,
        accessToken: Redacted.value(token.token),
      });

      return client;
    }).pipe(
      Effect.catchTag("OAuthError", (error) =>
        Effect.fail(
          new PolarError({
            message: "Failed to get Polar SDK client",
            cause: error,
          })
        )
      )
    );

  const use = <A, E>(
    fn: (client: PolarSDK) => Effect.Effect<A, E> | Promise<A>
  ) =>
    Effect.gen(function* () {
      // Default to production server, but could be made configurable
      const client = yield* getClient("production");
      const result = fn(client);

      // Handle both Effect and Promise return types
      return yield* Effect.isEffect(result)
        ? result
        : Effect.promise(() => result);
    });

  return Polar.of({
    getClient,
    use,
  });
});

export const layer = Layer.scoped(Polar, make).pipe(
  Layer.provide(PolarRequirementsLayer)
);
