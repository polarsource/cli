import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Context, Data, Effect, Layer } from "effect";
import open from "open";
import os from "os";

const SANDBOX_CLIENT_ID = "polar_ci_KTj3Pfw3PE54dsjgcjVT6w";
const PRODUCTION_CLIENT_ID = "polar_ci_gBnJ_Yv_uSGm5mtoPa2cCA";

const SANDBOX_AUTHORIZATION_URL = "https://sandbox.polar.sh/oauth2/authorize";
const PRODUCTION_AUTHORIZATION_URL = "https://polar.sh/oauth2/authorize";

const SANDBOX_TOKEN_URL = "https://sandbox-api.polar.sh/v1/oauth2/token";
const PRODUCTION_TOKEN_URL = "https://api.polar.sh/v1/oauth2/token";

const config = {
  scopes: [
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
    "files:read",
    "files:write",
    "discounts:read",
    "discounts:write",
    "customers:read",
    "customers:write",
  ],
  redirectUrl: "http://127.0.0.1:3333/oauth/callback",
};

export class OAuthError extends Data.TaggedError("OAuthError")<{
  message: string;
  cause?: unknown;
}> {}

export class OAuth extends Context.Tag("OAuth")<OAuth, OAuthImpl>() {}

interface OAuthImpl {
  login: (
    mode: "production" | "sandbox"
  ) => Effect.Effect<string, OAuthError, never>;
}

export const make = Effect.gen(function* () {
  return OAuth.of({
    login: (mode) =>
      Effect.gen(function* () {
        const accessToken = yield* getAccessToken(mode);
        yield* saveAccessToken(accessToken);
        return accessToken;
      }),
  });
});

export const layer = Layer.scoped(OAuth, make);

const tokenFilePath = Effect.sync(() =>
  path.join(os.homedir(), ".polar", "tokens.json")
);

const tokenFileExists = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const filePath = yield* tokenFilePath;
  return yield* fileSystem.exists(filePath);
});

const writeToTokenFile = (accessToken: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const filePath = yield* tokenFilePath;

    yield* fileSystem.writeFile(
      filePath,
      new TextEncoder().encode(accessToken)
    );
  });

const readTokenFile = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const filePath = yield* tokenFilePath;
  return yield* fileSystem.readFile(filePath).pipe(
    Effect.map((buffer) => new TextDecoder().decode(buffer)),
    Effect.catchAll(Effect.die)
  );
});

const createTokenFile = () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const filePath = yield* tokenFilePath;
    yield* Effect.log("Creating token file");
    yield* fileSystem.writeFile(filePath, new TextEncoder().encode(""));
  });

const saveAccessToken = (accessToken: string) =>
  Effect.gen(function* () {
    return yield* writeToTokenFile(accessToken).pipe(
      Effect.whenEffect(tokenFileExists),
      Effect.orElse(createTokenFile),
      Effect.map(() => accessToken),
      Effect.catchAll(Effect.die),
      Effect.provide(NodeFileSystem.layer)
    );
  });

const getAccessToken = (mode: "production" | "sandbox") =>
  Effect.gen(function* () {
    const codeVerifier = yield* generateRandomString;
    const codeChallenge = yield* generateHash(codeVerifier);
    const state = yield* generateRandomString;
    const authorizationUrl = yield* buildAuthorizationUrl(
      mode,
      state,
      codeChallenge
    );

    const accessToken = yield* Effect.async<string, OAuthError>((resume) => {
      let server: Server | null;

      server = createServer((request, response) => {
        if (server != null) {
          // Complete the incoming HTTP request when a login response is received
          response.write("Login completed for the console client ...");
          response.end();
          server.close();
          server = null;

          resume(
            redeemCodeForAccessToken(
              mode,
              request.url ?? "",
              state,
              codeVerifier
            )
          );
        }
      });

      server?.listen(3333, () => {
        open(authorizationUrl);
      });
    });

    return accessToken;
  });

const generateRandomString = Effect.sync(() => randomBytes(48).toString("hex"));

const generateHash = (value: string) =>
  Effect.sync(() => {
    const hash = createHash("sha256").update(value).digest("base64");
    return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  });

const buildAuthorizationUrl = (
  mode: "production" | "sandbox",
  state: string,
  codeChallenge: string
) =>
  Effect.sync(() => {
    let url =
      mode === "production"
        ? PRODUCTION_AUTHORIZATION_URL
        : SANDBOX_AUTHORIZATION_URL;
    url += `?client_id=${encodeURIComponent(
      mode === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID
    )}`;
    url += `&redirect_uri=${encodeURIComponent(config.redirectUrl)}`;
    url += "&response_type=code";
    url += `&scope=${encodeURIComponent(config.scopes.join(" "))}`;
    url += `&state=${encodeURIComponent(state)}`;
    url += `&code_challenge=${encodeURIComponent(codeChallenge)}`;
    url += "&code_challenge_method=S256";

    return url;
  });

const getLoginResult = (
  responseUrl: string
): Effect.Effect<[string, string], OAuthError, never> =>
  Effect.gen(function* () {
    const url = new URL(responseUrl, config.redirectUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return yield* Effect.fail(
        new OAuthError({
          message: "Authorization code or state is missing in the response URL",
        })
      );
    }

    return [code, state];
  });

const redeemCodeForAccessToken = (
  mode: "production" | "sandbox",
  responseUrl: string,
  requestState: string,
  codeVerifier: string
) =>
  Effect.gen(function* () {
    const [code, responseState] = yield* getLoginResult(responseUrl);

    if (responseState !== requestState) {
      throw new Error("An invalid authorization response state was received");
    }

    let body = "grant_type=authorization_code";
    body += `&client_id=${encodeURIComponent(
      mode === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID
    )}`;
    body += `&redirect_uri=${encodeURIComponent(config.redirectUrl)}`;
    body += `&code=${encodeURIComponent(code)}`;
    body += `&code_verifier=${encodeURIComponent(codeVerifier)}`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          mode === "production" ? PRODUCTION_TOKEN_URL : SANDBOX_TOKEN_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          }
        ),
      catch: (error) =>
        new OAuthError({
          message: "Failed to redeem code for access token",
          cause: error,
        }),
    });

    if (response.status >= 400) {
      const details = response.text();
      return yield* Effect.fail(
        new OAuthError({
          message: `Problem encountered redeeming the code for tokens: ${response.status}, ${details}`,
        })
      );
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ access_token: string }>,
      catch: (error) =>
        new OAuthError({
          message: "Failed to redeem code for access token",
          cause: error,
        }),
    });

    return data.access_token;
  });
