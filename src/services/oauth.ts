import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Context, Data, Effect, Layer, Redacted, Schema } from "effect";
import open from "open";
import os from "os";
import { Token, Tokens } from "../schemas/Tokens";

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
    server: "production" | "sandbox"
  ) => Effect.Effect<Redacted.Redacted<string>, OAuthError, never>;
  refresh: (token: Token) => Effect.Effect<Token, OAuthError, never>;
  isAuthenticated: (
    server: "production" | "sandbox"
  ) => Effect.Effect<boolean, OAuthError, never>;
  getAccessToken: (
    server: "production" | "sandbox"
  ) => Effect.Effect<Redacted.Redacted<string>, OAuthError, never>;
}

const OAuthRequirementsLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer);

export const make = Effect.gen(function* () {
  return OAuth.of({
    login: (server) =>
      Effect.gen(function* () {
        const token = yield* getAccessToken(server);
        const savedToken = yield* saveToken(token);

        return savedToken.token;
      }).pipe(
        Effect.provide(OAuthRequirementsLayer),
        Effect.catchAll(Effect.die)
      ),
    refresh: (token) =>
      Effect.gen(function* () {
        const refreshedToken = yield* refreshAccessToken(token);
        return yield* saveToken(refreshedToken);
      }).pipe(
        Effect.provide(OAuthRequirementsLayer),
        Effect.catchAll(Effect.die)
      ),
    isAuthenticated: (server) =>
      Effect.gen(function* () {
        const token = yield* readTokenFile;
        const tokenExpired =
          (token[server]?.expiresAt ?? new Date()) < new Date();

        return !tokenExpired;
      }).pipe(
        Effect.provide(OAuthRequirementsLayer),
        Effect.catchAll(Effect.die)
      ),
    getAccessToken: (server) =>
      Effect.gen(function* () {
        const token = yield* readTokenFile;

        if (!token[server]) {
          throw new OAuthError({
            message: "No access token found for the selected server",
          });
        }

        return token[server].token;
      }).pipe(
        Effect.provide(OAuthRequirementsLayer),
        Effect.catchAll(Effect.die)
      ),
  });
});

export const layer = Layer.scoped(OAuth, make);

const tokenFilePath = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join(os.homedir(), ".polar", "tokens.json");
});

const writeToTokenFile = (token: Token) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const filePath = yield* tokenFilePath;

    yield* Effect.logDebug("Writing token to file...");

    const currentTokens = yield* readTokenFile;

    yield* fileSystem.access(filePath).pipe(
      Effect.catchTag("SystemError", (_SystemError) => {
        return fileSystem.makeDirectory(path.dirname(filePath), {
          recursive: true,
        });
      })
    );

    return yield* fileSystem.writeFile(
      filePath,
      new TextEncoder().encode(
        JSON.stringify({
          ...currentTokens,
          [token.server]: token,
        })
      )
    );
  });

const readTokenFile = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const filePath = yield* tokenFilePath;

  yield* Effect.logDebug("Reading token file...");

  return yield* fileSystem.readFile(filePath).pipe(
    Effect.map((buffer) => new TextDecoder().decode(buffer)),
    Schema.decodeUnknown(Tokens),
    Effect.catchAll(Effect.die)
  );
});

const saveToken = (token: Token) =>
  Effect.gen(function* () {
    return yield* writeToTokenFile(token).pipe(Effect.map(() => token));
  });

const getAccessToken = (server: "production" | "sandbox") =>
  Effect.gen(function* () {
    const codeVerifier = yield* generateRandomString;
    const codeChallenge = yield* generateHash(codeVerifier);
    const state = yield* generateRandomString;
    const authorizationUrl = yield* buildAuthorizationUrl(
      server,
      state,
      codeChallenge
    );

    const accessToken = yield* Effect.async<Token, OAuthError>((resume) => {
      let httpServer: Server | null;

      httpServer = createServer((request, response) => {
        if (httpServer != null) {
          // Complete the incoming HTTP request when a login response is received
          response.write("Login completed for the console client ...");
          response.end();
          httpServer.close();
          httpServer = null;

          resume(
            redeemCodeForAccessToken(
              server,
              request.url ?? "",
              state,
              codeVerifier
            )
          );
        }
      });

      httpServer?.listen(3333, () => {
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

const refreshAccessToken = (token: Token) =>
  Effect.gen(function* () {
    const refreshToken = token.refreshToken;

    if (!refreshToken) {
      return yield* Effect.fail(
        new OAuthError({
          message: "No refresh token found",
        })
      );
    }

    let body = "grant_type=refresh_token";
    body += `&client_id=${encodeURIComponent(
      token.server === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID
    )}`;
    body += `&refresh_token=${encodeURIComponent(
      Redacted.value(refreshToken)
    )}`;
    body += `&scope=${encodeURIComponent(config.scopes.join(" "))}`;

    console.log(body);

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          token.server === "production"
            ? PRODUCTION_TOKEN_URL
            : SANDBOX_TOKEN_URL,
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
          message: "Failed to refresh access token",
          cause: error,
        }),
    });

    if (response.status >= 400) {
      const details = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) =>
          new OAuthError({
            message: "Failed to get response text",
            cause: error,
          }),
      });

      return yield* Effect.fail(
        new OAuthError({
          message: `Problem encountered refreshing the access token: ${response.status}, ${details}`,
        })
      );
    }

    const data = yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          access_token: string;
          token_type: "Bearer";
          expires_in: number;
          refresh_token: string | null;
          scope: string;
          id_token: string;
        }>,
      catch: (error) =>
        new OAuthError({
          message: "Failed to redeem code for access token",
          cause: error,
        }),
    });

    return yield* Schema.decodeUnknown(Token)({
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      expiresAt: new Date(Date.now() + data.expires_in).toISOString(),
      scope: data.scope.split(" "),
      server: token.server,
    }).pipe(
      Effect.catchTag("ParseError", (error) =>
        Effect.die(
          new OAuthError({
            message: "Failed to parse token response into a Token Schema",
            cause: error,
          })
        )
      )
    );
  });

const redeemCodeForAccessToken = (
  server: "production" | "sandbox",
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
      server === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID
    )}`;
    body += `&redirect_uri=${encodeURIComponent(config.redirectUrl)}`;
    body += `&code=${encodeURIComponent(code)}`;
    body += `&code_verifier=${encodeURIComponent(codeVerifier)}`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          server === "production" ? PRODUCTION_TOKEN_URL : SANDBOX_TOKEN_URL,
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
      const details = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) =>
          new OAuthError({
            message: "Failed to get response text",
            cause: error,
          }),
      });

      return yield* Effect.fail(
        new OAuthError({
          message: `Problem encountered redeeming the code for tokens: ${response.status}, ${details}`,
        })
      );
    }

    const data = yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{
          access_token: string;
          token_type: "Bearer";
          expires_in: number;
          refresh_token: string | null;
          scope: string;
          id_token: string;
        }>,
      catch: (error) =>
        new OAuthError({
          message: "Failed to redeem code for access token",
          cause: error,
        }),
    });

    return yield* Schema.decodeUnknown(Token)({
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      expiresAt: new Date(Date.now() + data.expires_in).toISOString(),
      scope: data.scope.split(" "),
      server,
    }).pipe(
      Effect.catchTag("ParseError", (error) =>
        Effect.die(
          new OAuthError({
            message: "Failed to parse token response into a Token Schema",
            cause: error,
          })
        )
      )
    );
  });
