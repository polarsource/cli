// src/cli.ts
import { Command as Command5 } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect as Effect11, Layer as Layer5 } from "effect";

// src/commands/listen.ts
import { Args, Command } from "@effect/cli";
import { Effect as Effect4, Either, Redacted as Redacted3, Schema as Schema5 } from "effect";
import { EventSource } from "eventsource";

// src/prompts/organizations.ts
import { Prompt } from "@effect/cli";
import { Effect as Effect3 } from "effect";

// src/schemas/Organization.ts
import { Schema } from "effect";
var OrganizationCreate = Schema.Struct({
  name: Schema.String,
  slug: Schema.String
});

// src/services/polar.ts
import { Polar as PolarSDK } from "@polar-sh/sdk";
import { Context as Context2, Data as Data2, Effect as Effect2, Layer as Layer2, Redacted as Redacted2 } from "effect";

// src/services/oauth.ts
import { createHash, randomBytes } from "crypto";
import { createServer } from "http";
import path from "path";
import { FileSystem, Path } from "@effect/platform";
import { BunFileSystem } from "@effect/platform-bun";
import { Context, Data, Effect, Layer, Redacted, Schema as Schema3 } from "effect";
import open from "open";
import os from "os";

// src/schemas/Tokens.ts
import { Schema as Schema2 } from "effect";
var TokenScope = Schema2.Array(
  Schema2.Literal(
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
    "customers:read"
  )
);
var Token = Schema2.Struct({
  token: Schema2.Redacted(Schema2.String),
  refreshToken: Schema2.Redacted(Schema2.String),
  expiresIn: Schema2.DurationFromMillis,
  expiresAt: Schema2.Date,
  scope: TokenScope,
  server: Schema2.Literal("production", "sandbox")
});
var Tokens = Schema2.Struct({
  production: Schema2.optional(Token),
  sandbox: Schema2.optional(Token)
});

// src/services/oauth.ts
var SANDBOX_CLIENT_ID = "polar_ci_KTj3Pfw3PE54dsjgcjVT6w";
var PRODUCTION_CLIENT_ID = "polar_ci_gBnJ_Yv_uSGm5mtoPa2cCA";
var SANDBOX_AUTHORIZATION_URL = "https://sandbox.polar.sh/oauth2/authorize";
var PRODUCTION_AUTHORIZATION_URL = "https://polar.sh/oauth2/authorize";
var SANDBOX_TOKEN_URL = "https://sandbox-api.polar.sh/v1/oauth2/token";
var PRODUCTION_TOKEN_URL = "https://api.polar.sh/v1/oauth2/token";
var config = {
  scopes: [
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
    "customers:read"
  ],
  redirectUrl: "http://127.0.0.1:3333/oauth/callback"
};
var captureAccessTokenFromHTTPServer = (server) => Effect.gen(function* () {
  const codeVerifier = yield* generateRandomString;
  const codeChallenge = yield* generateHash(codeVerifier);
  const state = yield* generateRandomString;
  const authorizationUrl = yield* buildAuthorizationUrl(
    server,
    state,
    codeChallenge
  );
  let httpServer;
  yield* Effect.addFinalizer(() => {
    if (httpServer !== null) {
      httpServer.close();
      httpServer = null;
    }
    return Effect.logDebug("Temporary HTTP Server Closed");
  });
  const accessToken = yield* Effect.async((resume) => {
    httpServer = createServer((request, response) => {
      if (httpServer !== null) {
        response.write("Login completed for the console client ...");
        response.end();
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
var OAuthError = class extends Data.TaggedError("OAuthError") {
};
var OAuth = class extends Context.Tag("OAuth")() {
};
var OAuthRequirementsLayer = Layer.mergeAll(BunFileSystem.layer, Path.layer);
var make = Effect.gen(function* () {
  const getAccessToken = (server) => Effect.gen(function* () {
    const token = yield* readTokenFile;
    if (!token || !token[server]) {
      return yield* Effect.fail(
        new OAuthError({
          message: "No access token found for the selected server"
        })
      );
    }
    return token[server];
  }).pipe(Effect.provide(OAuthRequirementsLayer));
  const login2 = (server) => Effect.gen(function* () {
    const token = yield* captureAccessTokenFromHTTPServer(server);
    const savedToken = yield* saveToken(token);
    return savedToken;
  }).pipe(Effect.scoped, Effect.provide(OAuthRequirementsLayer));
  const refresh = (token) => Effect.gen(function* () {
    const refreshedToken = yield* refreshAccessToken(token);
    return yield* saveToken(refreshedToken);
  }).pipe(Effect.provide(OAuthRequirementsLayer));
  const isAuthenticated = (server) => Effect.gen(function* () {
    const tokens = yield* readTokenFile;
    if (!tokens) {
      return false;
    }
    const serverToken = tokens[server];
    if (!serverToken) {
      return false;
    }
    const tokenExpired = serverToken.expiresAt < /* @__PURE__ */ new Date();
    return !tokenExpired;
  }).pipe(Effect.provide(OAuthRequirementsLayer));
  const resolveAccessToken = (server) => Effect.gen(function* () {
    const authenticated = yield* isAuthenticated(server);
    if (!authenticated) {
      return yield* login2(server);
    }
    return yield* getAccessToken(server);
  }).pipe(Effect.provide(OAuthRequirementsLayer));
  return OAuth.of({
    login: login2,
    refresh,
    isAuthenticated,
    getAccessToken,
    resolveAccessToken
  });
});
var layer = Layer.scoped(OAuth, make);
var tokenFilePath = Effect.gen(function* () {
  const path2 = yield* Path.Path;
  return path2.join(os.homedir(), ".polar", "tokens.json");
});
var ensureTokenFile = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const filePath = yield* tokenFilePath;
  return yield* Effect.orElse(
    fileSystem.access(filePath),
    () => fileSystem.makeDirectory(path.dirname(filePath), {
      recursive: true
    }).pipe(Effect.andThen(fileSystem.writeFileString(filePath, "{}")))
  ).pipe(
    Effect.catchAll(
      (error) => Effect.fail(
        new OAuthError({
          message: "Failed to ensure token file exists",
          cause: error
        })
      )
    )
  );
});
var writeToTokenFile = (token) => Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const filePath = yield* tokenFilePath;
  yield* Effect.logDebug("Writing token to file...");
  const currentTokens = yield* readTokenFile;
  const mergedTokens = Tokens.make({
    ...currentTokens,
    [token.server]: token
  });
  return yield* ensureTokenFile.pipe(
    Effect.andThen(
      () => Schema3.encode(Tokens)(mergedTokens).pipe(
        Effect.map(
          (encoded) => new TextEncoder().encode(JSON.stringify(encoded))
        ),
        Effect.andThen((encoded) => fileSystem.writeFile(filePath, encoded))
      )
    ),
    Effect.catchAll(
      (error) => Effect.fail(
        new OAuthError({
          message: "Failed to write token to file",
          cause: error
        })
      )
    )
  );
});
var readTokenFile = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const filePath = yield* tokenFilePath;
  yield* Effect.logDebug("Reading token file...");
  return yield* ensureTokenFile.pipe(
    Effect.flatMap(() => fileSystem.readFileString(filePath)),
    Effect.flatMap(Schema3.decode(Schema3.parseJson(Tokens))),
    Effect.catchAll(
      (error) => Effect.fail(
        new OAuthError({
          message: "Failed to read token file",
          cause: error
        })
      )
    )
  );
});
var saveToken = (token) => Effect.gen(function* () {
  yield* Effect.logDebug("Saving token to file...");
  return yield* writeToTokenFile(token).pipe(Effect.map(() => token));
});
var generateRandomString = Effect.sync(() => randomBytes(48).toString("hex"));
var generateHash = (value) => Effect.sync(() => {
  const hash = createHash("sha256").update(value).digest("base64");
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
});
var buildAuthorizationUrl = (mode, state, codeChallenge) => Effect.sync(() => {
  const baseUrl = mode === "production" ? PRODUCTION_AUTHORIZATION_URL : SANDBOX_AUTHORIZATION_URL;
  const clientId = mode === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: config.redirectUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  const url2 = `${baseUrl}?${params.toString()}`;
  return url2;
});
var getLoginResult = (responseUrl) => Effect.gen(function* () {
  const url2 = new URL(responseUrl, config.redirectUrl);
  const code = url2.searchParams.get("code");
  const state = url2.searchParams.get("state");
  if (!code || !state) {
    return yield* Effect.fail(
      new OAuthError({
        message: "Authorization code or state is missing in the response URL"
      })
    );
  }
  return [code, state];
});
var refreshAccessToken = (token) => Effect.gen(function* () {
  const refreshToken = token.refreshToken;
  if (!refreshToken) {
    return yield* Effect.fail(
      new OAuthError({
        message: "No refresh token found"
      })
    );
  }
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: token.server === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID,
    refresh_token: Redacted.value(refreshToken),
    scope: config.scopes.join(" ")
  });
  const response = yield* Effect.tryPromise({
    try: () => fetch(
      token.server === "production" ? PRODUCTION_TOKEN_URL : SANDBOX_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    ),
    catch: (error) => new OAuthError({
      message: "Failed to refresh access token",
      cause: error
    })
  });
  if (response.status >= 400) {
    const details = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => new OAuthError({
        message: "Failed to get response text",
        cause: error
      })
    });
    return yield* Effect.fail(
      new OAuthError({
        message: `Problem encountered refreshing the access token: ${response.status}, ${details}`
      })
    );
  }
  const data = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (error) => new OAuthError({
      message: "Failed to redeem code for access token",
      cause: error
    })
  });
  return yield* Schema3.decodeUnknown(Token)({
    token: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in).toISOString(),
    scope: data.scope.split(" "),
    server: token.server
  }).pipe(
    Effect.catchTag(
      "ParseError",
      (error) => Effect.die(
        new OAuthError({
          message: "Failed to parse token response into a Token Schema",
          cause: error
        })
      )
    )
  );
});
var redeemCodeForAccessToken = (server, responseUrl, requestState, codeVerifier) => Effect.gen(function* () {
  const [code, responseState] = yield* getLoginResult(responseUrl);
  if (responseState !== requestState) {
    throw new Error("An invalid authorization response state was received");
  }
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: server === "production" ? PRODUCTION_CLIENT_ID : SANDBOX_CLIENT_ID,
    redirect_uri: config.redirectUrl,
    code,
    code_verifier: codeVerifier
  });
  const response = yield* Effect.tryPromise({
    try: () => fetch(
      server === "production" ? PRODUCTION_TOKEN_URL : SANDBOX_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    ),
    catch: (error) => new OAuthError({
      message: "Failed to redeem code for access token",
      cause: error
    })
  });
  if (response.status >= 400) {
    const details = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => new OAuthError({
        message: "Failed to get response text",
        cause: error
      })
    });
    return yield* Effect.fail(
      new OAuthError({
        message: `Problem encountered redeeming the code for tokens: ${response.status}, ${details}`
      })
    );
  }
  const data = yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (error) => new OAuthError({
      message: "Failed to redeem code for access token",
      cause: error
    })
  });
  return yield* Schema3.decodeUnknown(Token)({
    token: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in).toISOString(),
    scope: data.scope.split(" "),
    server
  }).pipe(
    Effect.catchTag(
      "ParseError",
      (error) => Effect.die(
        new OAuthError({
          message: "Failed to parse token response into a Token Schema",
          cause: error
        })
      )
    )
  );
});

// src/services/polar.ts
var SANDBOX_SERVER_URL = "https://sandbox-api.polar.sh";
var PRODUCTION_SERVER_URL = "https://api.polar.sh";
var PolarError = class extends Data2.TaggedError("PolarError") {
};
var Polar = class extends Context2.Tag("Polar")() {
};
var PolarRequirementsLayer = Layer2.mergeAll(layer);
var make2 = Effect2.gen(function* () {
  const oauth = yield* OAuth;
  const getClient = (server) => Effect2.gen(function* () {
    const token = yield* oauth.resolveAccessToken(server);
    const serverUrl = server === "production" ? PRODUCTION_SERVER_URL : SANDBOX_SERVER_URL;
    const client = new PolarSDK({
      serverURL: serverUrl,
      accessToken: Redacted2.value(token.token)
    });
    return client;
  }).pipe(
    Effect2.catchTag(
      "OAuthError",
      (error) => Effect2.fail(
        new PolarError({
          message: "Failed to get Polar SDK client",
          cause: error
        })
      )
    )
  );
  const use = (fn) => Effect2.gen(function* () {
    const client = yield* getClient("production");
    const result = fn(client);
    return yield* Effect2.isEffect(result) ? result : Effect2.promise(() => result);
  });
  return Polar.of({
    getClient,
    use
  });
});
var layer2 = Layer2.scoped(Polar, make2).pipe(
  Layer2.provide(PolarRequirementsLayer)
);

// src/utils.ts
var slugify = (...args) => {
  const value = args.join(" ");
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-");
};
var fetchAllPages = async (task) => {
  const { data, lastPage } = await task(1);
  const allItems = [...data ?? []];
  if (!data) {
    return allItems;
  }
  const results = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) => task(i + 2))
  );
  return [...allItems, ...results.flatMap((result) => result.data ?? [])];
};

// src/prompts/organizations.ts
var selectOrganizationPrompt = Effect3.gen(function* () {
  const polar = yield* Polar;
  const organizations = yield* polar.use(
    (client) => client.organizations.list({
      page: 1,
      limit: 100
    })
  ).pipe(Effect3.map((organizations2) => organizations2.result.items));
  return yield* Prompt.select({
    message: "Select Organization",
    choices: [
      ...organizations.map((organization) => ({
        value: organization.id,
        title: organization.name
      })),
      { value: "new", title: "+ Create New Organization" }
    ]
  });
});
var organizationNamePrompt = Prompt.text({
  message: "Organization Name"
});
var organizationSlugPrompt = (name) => Prompt.text({
  message: "Organization Slug",
  default: slugify(name)
});
var createNewOrganizationPrompt = Effect3.gen(function* () {
  const polar = yield* Polar;
  const name = yield* organizationNamePrompt;
  const slug = yield* organizationSlugPrompt(name);
  const organizationCreate = OrganizationCreate.make({
    name,
    slug
  });
  const organization = yield* polar.use(
    (client) => client.organizations.create(organizationCreate)
  );
  return organization.id;
});
var organizationPrompt = selectOrganizationPrompt.pipe(
  Effect3.flatMap((organization) => {
    if (organization === "new") {
      return createNewOrganizationPrompt;
    }
    return Effect3.succeed(organization);
  })
);
var organizationLoginPrompt = Effect3.gen(function* () {
  const polar = yield* Polar;
  const organizations = yield* polar.use(
    (client) => client.organizations.list({
      page: 1,
      limit: 100
    })
  ).pipe(Effect3.map((organizations2) => organizations2.result.items));
  const selectedId = yield* Prompt.select({
    message: "Select Organization",
    choices: organizations.map((organization) => ({
      value: organization.id,
      title: organization.name
    }))
  });
  const selected = organizations.find((org) => org.id === selectedId);
  return { id: selected.id, slug: selected.slug, name: selected.name };
});

// src/schemas/Events.ts
import { Schema as Schema4 } from "effect";
var ListenAck = Schema4.Struct({
  key: Schema4.Literal("connected"),
  ts: Schema4.DateFromString,
  secret: Schema4.String
});
var ListenWebhookEvent = Schema4.Struct({
  id: Schema4.String,
  key: Schema4.String,
  payload: Schema4.Struct({
    webhook_event_id: Schema4.String,
    payload: Schema4.Struct({
      type: Schema4.String,
      timestamp: Schema4.String,
      data: Schema4.Struct({})
    })
  }),
  headers: Schema4.Struct({
    "user-agent": Schema4.Literal("polar.sh webhooks"),
    "content-type": Schema4.Literal("application/json"),
    "webhook-id": Schema4.String,
    "webhook-timestamp": Schema4.String,
    "webhook-signature": Schema4.String
  })
});
var ListenEvent = Schema4.Union(ListenAck, ListenWebhookEvent);

// src/commands/listen.ts
var LISTEN_BASE_URL = "https://api.polar.sh/v1/cli/listen";
var url = Args.text({ name: "url" });
var listen = Command.make(
  "listen",
  { url },
  ({ url: url2 }) => Effect4.gen(function* () {
    const oauth = yield* OAuth;
    const token = yield* oauth.resolveAccessToken("production");
    const accessToken = Redacted3.value(token.token);
    const organization = yield* organizationLoginPrompt;
    const listenUrl = `${LISTEN_BASE_URL}/${organization.id}`;
    yield* Effect4.async((resume) => {
      const eventSource = new EventSource(listenUrl, {
        fetch: (input, init) => fetch(input, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${accessToken}`
          }
        })
      });
      eventSource.onmessage = (event) => {
        const json = JSON.parse(event.data);
        const ack = Schema5.decodeUnknownEither(ListenAck)(json);
        if (Either.isRight(ack)) {
          const { secret } = ack.right;
          const dim = "\x1B[2m";
          const bold = "\x1B[1m";
          const cyan = "\x1B[36m";
          const reset = "\x1B[0m";
          console.log("");
          console.log(
            `  ${bold}${cyan}Connected${reset}  ${bold}${organization.name}${reset}`
          );
          console.log(`  ${dim}Secret${reset}     ${secret}`);
          console.log(`  ${dim}Forwarding${reset} ${url2}`);
          console.log("");
          console.log(`  ${dim}Waiting for events...${reset}`);
          console.log("");
          return;
        }
        const webhookEvent = Schema5.decodeUnknownEither(ListenWebhookEvent)(json);
        if (Either.isLeft(webhookEvent)) {
          console.error(">> Failed to decode event");
          return;
        }
        fetch(url2, {
          method: "POST",
          headers: webhookEvent.right.headers,
          body: JSON.stringify(webhookEvent.right.payload.payload)
        }).then((res) => {
          const cyan = "\x1B[36m";
          const reset = "\x1B[0m";
          console.log(
            `>> '${cyan}${webhookEvent.right.payload.payload.type}${reset}' >> ${res.status} ${res.statusText}`
          );
        }).catch((err) => {
          console.error(`>> Failed to forward event: ${err}`);
        });
      };
      eventSource.onerror = (error) => {
        eventSource.close();
        resume(
          Effect4.fail(
            new OAuthError({
              message: error.message ?? "Event stream error",
              cause: error
            })
          )
        );
      };
      return Effect4.sync(() => {
        eventSource.close();
      });
    });
  })
);

// src/commands/login.ts
import { Command as Command2 } from "@effect/cli";
import { Console, Effect as Effect5 } from "effect";
var login = Command2.make(
  "login",
  {},
  () => Effect5.gen(function* () {
    const oauth = yield* OAuth;
    yield* oauth.login("production");
    yield* Console.log("Successfully logged into Polar");
  })
);

// src/commands/migrate.ts
import { Command as Command3, Options, Prompt as Prompt3 } from "@effect/cli";
import { Effect as Effect9 } from "effect";

// src/prompts/migration.ts
import { Prompt as Prompt2 } from "@effect/cli";
import { Effect as Effect6 } from "effect";
var migrationProviders = [
  { value: "lemonSqueezy", title: "Lemon Squeezy" },
  { value: "paddle", title: "Paddle", disabled: true },
  { value: "stripe", title: "Stripe", disabled: true }
];
var providerPrompt = Prompt2.select({
  message: "Select Migration Provider",
  choices: migrationProviders
});
var migrationPrompt = Prompt2.multiSelect({
  message: "Select Entities to Migrate",
  choices: [
    { value: "products", title: "Products" },
    { value: "customers", title: "Customers" }
  ]
});
var apiKeyPrompt = Prompt2.text({
  message: "Enter the API Key",
  validate: (value) => {
    if (value.length === 0) {
      return Effect6.fail("API Key is required");
    }
    return Effect6.succeed(value);
  }
});
var storePrompt = (provider) => Effect6.gen(function* () {
  const stores = yield* provider.stores();
  return yield* Prompt2.select({
    message: "Select Store to Migrate",
    choices: stores.data.map((store) => ({
      value: store.id,
      title: store.attributes.name
    }))
  });
});

// src/schemas/Migration.ts
import { Schema as Schema6 } from "effect";
var MigrationOrigin = Schema6.String.pipe(
  Schema6.brand("MigrationOrigin")
);
var MigrationDestination = Schema6.String.pipe(
  Schema6.brand("MigrationDestination")
);
var MigrationContext = Schema6.Struct({
  from: MigrationOrigin,
  to: MigrationDestination
});

// src/services/migration/lemon/provider.ts
import {
  getAuthenticatedUser,
  lemonSqueezySetup,
  listCustomers,
  listDiscounts,
  listFiles,
  listProducts,
  listStores,
  listVariants
} from "@lemonsqueezy/lemonsqueezy.js";
import { Context as Context3, Data as Data3, Effect as Effect7, Layer as Layer3, Schema as Schema9 } from "effect";

// src/schemas/Customer.ts
import { Schema as Schema7 } from "effect";
var CustomerCreate = Schema7.Struct({
  name: Schema7.String,
  email: Schema7.String,
  billingAddress: Schema7.optional(
    Schema7.Struct({
      country: Schema7.String,
      city: Schema7.NullOr(Schema7.String),
      state: Schema7.NullOr(Schema7.String)
    })
  )
});

// src/schemas/Product.ts
import { Schema as Schema8 } from "effect";
var CreateProductPriceCustom = Schema8.mutable(
  Schema8.Struct({
    amountType: Schema8.Literal("custom"),
    priceCurrency: Schema8.Literal("USD"),
    minimumAmount: Schema8.optional(Schema8.Number),
    maximumAmount: Schema8.optional(Schema8.Number),
    presetAmount: Schema8.optional(Schema8.Number)
  })
);
var CreateProductPriceFree = Schema8.mutable(
  Schema8.Struct({
    amountType: Schema8.Literal("free")
  })
);
var CreateProductPriceFixed = Schema8.mutable(
  Schema8.Struct({
    amountType: Schema8.Literal("fixed"),
    priceCurrency: Schema8.Literal("usd"),
    priceAmount: Schema8.Number
  })
);
var ProductCreate = Schema8.mutable(
  Schema8.Struct({
    name: Schema8.String,
    description: Schema8.String,
    recurringInterval: Schema8.NullOr(Schema8.Literal("month", "year")),
    prices: Schema8.mutable(
      Schema8.Tuple(
        Schema8.Union(
          CreateProductPriceCustom,
          CreateProductPriceFree,
          CreateProductPriceFixed
        )
      )
    )
  })
);

// src/services/migration/lemon/transform.ts
var parseCustomers = (customers) => customers.map((customer) => ({
  name: customer.attributes.name,
  email: customer.attributes.email,
  billingAddress: customer.attributes.country ? {
    country: customer.attributes.country,
    city: customer.attributes.city,
    state: customer.attributes.region
  } : void 0
})) ?? [];
var parseInterval = (interval) => {
  switch (interval) {
    case "month":
      return "month";
    case "year":
      return "year";
    default:
      return null;
  }
};
var parseVariants = (variants) => variants.map((variant) => ({
  name: variant.attributes.name,
  description: variant.attributes.description,
  prices: [parsePrice(variant)],
  recurringInterval: parseInterval(variant.attributes.interval)
})) ?? [];
var parsePrice = (variant) => {
  const priceCurrency = "usd";
  const priceAmount = variant.attributes.price;
  if (priceAmount > 0) {
    return {
      amountType: "fixed",
      priceAmount,
      priceCurrency
    };
  }
  const payWhatYouWant = variant.attributes.pay_what_you_want;
  if (payWhatYouWant) {
    return {
      amountType: "custom",
      priceAmount,
      priceCurrency,
      minimumAmount: variant.attributes.min_price < 50 ? 50 : variant.attributes.min_price,
      presetAmount: variant.attributes.suggested_price
    };
  }
  if (priceAmount > 0) {
    return {
      amountType: "fixed",
      priceAmount,
      priceCurrency
    };
  }
  return {
    amountType: "free"
  };
};

// src/services/migration/lemon/provider.ts
var LemonSqueezyError = class extends Data3.TaggedError("LemonSqueezyError") {
};
var LemonSqueezy = class extends Context3.Tag("LemonSqueezy")() {
};
var make3 = (apiKey) => Effect7.gen(function* () {
  const client = yield* createLemonClient(apiKey);
  return LemonSqueezy.of({
    stores: () => Effect7.tryPromise({
      try: () => client.listStores().then(
        (response) => response.data ?? []
      ),
      catch: (error) => new LemonSqueezyError({
        message: "Failed to list Lemon Squeezy stores",
        cause: error
      })
    }),
    customers: (storeId) => Effect7.tryPromise({
      try: async () => {
        const customers = await fetchAllPages(
          (pageNumber) => client.listCustomers({
            filter: {
              storeId
            },
            page: {
              number: pageNumber,
              size: 50
            }
          }).then((response) => ({
            data: response.data?.data,
            lastPage: response.data?.meta.page.lastPage ?? 1
          }))
        );
        return customers;
      },
      catch: (error) => new LemonSqueezyError({
        message: "Failed to list Lemon Squeezy customers",
        cause: error
      })
    }).pipe(
      Effect7.map(parseCustomers),
      Effect7.flatMap(Schema9.decodeUnknown(Schema9.Array(CustomerCreate))),
      Effect7.catchTag(
        "ParseError",
        (error) => new LemonSqueezyError({
          message: "Failed to parse customers",
          cause: error
        })
      )
    ),
    products: (_storeId) => Effect7.tryPromise({
      try: async () => {
        return await fetchAllPages(
          (pageNumber) => client.listVariants({
            page: {
              number: pageNumber,
              size: 50
            }
          }).then((response) => ({
            data: response.data?.data,
            lastPage: response.data?.meta.page.lastPage ?? 1
          }))
        );
      },
      catch: (error) => new LemonSqueezyError({
        message: "Failed to list Lemon Squeezy products",
        cause: error
      })
    }).pipe(
      Effect7.map(parseVariants),
      Effect7.flatMap(Schema9.decodeUnknown(Schema9.Array(ProductCreate))),
      Effect7.catchTag(
        "ParseError",
        (error) => new LemonSqueezyError({
          message: "Failed to parse products",
          cause: error
        })
      )
    )
  });
});
var createLemonClient = (apiKey) => Effect7.try(() => {
  lemonSqueezySetup({
    apiKey,
    onError: (error) => {
      throw new LemonSqueezyError({
        message: "Failed to setup Lemon Squeezy client",
        cause: error
      });
    }
  });
  return {
    getAuthenticatedUser,
    listStores,
    listProducts,
    listDiscounts,
    listFiles,
    listVariants,
    listCustomers
  };
});

// src/services/migration/migrate.ts
import { Context as Context4, Data as Data4, Effect as Effect8, Layer as Layer4, Schema as Schema10 } from "effect";
var MigrationError = class extends Data4.TaggedError("MigrationError") {
};
var Migration = class extends Context4.Tag("Migration")() {
};
var make4 = Effect8.gen(function* () {
  return Migration.of({
    products: (provider, migration) => Effect8.gen(function* () {
      const polar = yield* Polar;
      const _oauth = yield* OAuth;
      const providerProducts = provider.products(migration.from);
      yield* providerProducts.pipe(
        Effect8.flatMap(Schema10.encode(Schema10.Array(ProductCreate))),
        Effect8.mapError(
          (error) => new PolarError({
            message: "Failed to encode products",
            cause: error
          })
        ),
        Effect8.flatMap(
          (products) => Effect8.all(
            products.map(
              (product) => polar.use(
                (client) => Effect8.tryPromise({
                  try: () => client.products.create({
                    ...product,
                    organizationId: migration.to
                  }),
                  catch: (error) => new PolarError({
                    message: "Failed to create product",
                    cause: error
                  })
                })
              )
            ),
            {
              concurrency: 10
            }
          )
        ),
        Effect8.tap(
          (products) => Effect8.logDebug(`${products.length} products migrated`)
        )
      );
    }),
    customers: (provider, migration) => Effect8.gen(function* () {
      const polar = yield* Polar;
      const _oauth = yield* OAuth;
      const providerCustomers = provider.customers(migration.from);
      yield* providerCustomers.pipe(
        Effect8.flatMap(Schema10.encode(Schema10.Array(CustomerCreate))),
        Effect8.mapError(
          (error) => new PolarError({
            message: "Failed to encode customers",
            cause: error
          })
        ),
        Effect8.flatMap(
          (customers) => Effect8.all(
            customers.map(
              (customer) => polar.use(
                (client) => Effect8.tryPromise({
                  try: () => client.customers.create({
                    ...customer,
                    organizationId: migration.to
                  }),
                  catch: (error) => new PolarError({
                    message: "Failed to create customer",
                    cause: error
                  })
                })
              )
            ),
            {
              concurrency: 10
            }
          )
        ),
        Effect8.tap(
          (customers) => Effect8.logDebug(`${customers.length} customers migrated`)
        )
      );
    })
  });
});
var layer3 = Layer4.scoped(Migration, make4);

// src/commands/migrate.ts
var migrate = Command3.make(
  "migrate",
  {},
  () => Effect9.gen(function* () {
    const provider = yield* Prompt3.all([providerPrompt, apiKeyPrompt]).pipe(
      Prompt3.run,
      Effect9.flatMap(([provider2, apiKey]) => resolveProvider(provider2, apiKey))
    );
    const migration = yield* Migration;
    const storeToMigrate = yield* storePrompt(provider);
    const entitiesToMigrate = yield* migrationPrompt;
    const organizationId = yield* organizationPrompt;
    const migrationContext = MigrationContext.make({
      from: MigrationOrigin.make(storeToMigrate),
      to: MigrationDestination.make(organizationId)
    });
    yield* Effect9.all(
      {
        products: entitiesToMigrate.includes("products") ? migration.products(provider, migrationContext) : Effect9.succeed([]),
        customers: entitiesToMigrate.includes("customers") ? migration.customers(provider, migrationContext) : Effect9.succeed([])
      },
      {
        concurrency: "unbounded"
      }
    );
  })
);
var LemonSqueezyAPIKey = Options.redacted("lemonSqueezyAPIKey");
var resolveProvider = (provider, apiKey) => {
  switch (provider) {
    case "lemonSqueezy":
      return make3(apiKey);
    default:
      return Effect9.die("Unsupported Migration Provider");
  }
};

// src/commands/update.ts
import { Command as Command4 } from "@effect/cli";
import { Console as Console2, Effect as Effect10, Schema as Schema11 } from "effect";
import { createHash as createHash2 } from "crypto";
import { chmod, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// src/version.ts
var VERSION = "v1.0.0";

// src/commands/update.ts
var REPO = "polarsource/cli";
var GitHubRelease = Schema11.Struct({
  tag_name: Schema11.String,
  assets: Schema11.Array(
    Schema11.Struct({
      name: Schema11.String,
      browser_download_url: Schema11.String
    })
  )
});
function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  let os2;
  switch (platform) {
    case "darwin":
      os2 = "darwin";
      break;
    case "linux":
      os2 = "linux";
      break;
    default:
      throw new Error(`Unsupported OS: ${platform}`);
  }
  let normalizedArch;
  switch (arch) {
    case "x64":
      normalizedArch = "x64";
      break;
    case "arm64":
      normalizedArch = "arm64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
  if (os2 === "linux" && normalizedArch === "arm64") {
    throw new Error("Linux arm64 is not yet supported");
  }
  return { os: os2, arch: normalizedArch };
}
var downloadAndUpdate = (release, latestVersion) => Effect10.gen(function* () {
  const bold = "\x1B[1m";
  const cyan = "\x1B[36m";
  const green = "\x1B[32m";
  const dim = "\x1B[2m";
  const reset = "\x1B[0m";
  const { os: os2, arch } = detectPlatform();
  const platform = `${os2}-${arch}`;
  const archiveName = `polar-${platform}.tar.gz`;
  const asset = release.assets.find((a) => a.name === archiveName);
  if (!asset) {
    return yield* Effect10.fail(
      new Error(`No release asset found for platform: ${platform}`)
    );
  }
  const checksumsAsset = release.assets.find(
    (a) => a.name === "checksums.txt"
  );
  if (!checksumsAsset) {
    return yield* Effect10.fail(
      new Error("No checksums.txt found in release")
    );
  }
  const tempDir = yield* Effect10.tryPromise({
    try: () => mkdtemp(join(tmpdir(), "polar-update-")),
    catch: () => new Error("Failed to create temp directory")
  });
  yield* Effect10.ensuring(
    Effect10.gen(function* () {
      yield* Console2.log(`${dim}Downloading ${latestVersion}...${reset}`);
      const archiveBuffer = yield* Effect10.tryPromise({
        try: () => fetch(asset.browser_download_url).then((res) => {
          if (!res.ok)
            throw new Error(
              `Download failed: ${res.status} ${res.statusText}`
            );
          return res.arrayBuffer();
        }),
        catch: (e) => new Error(
          `Failed to download binary: ${e instanceof Error ? e.message : e}`
        )
      });
      const archivePath = join(tempDir, archiveName);
      yield* Effect10.tryPromise({
        try: () => Bun.write(archivePath, archiveBuffer),
        catch: () => new Error("Failed to write archive to disk")
      });
      yield* Console2.log(`${dim}Verifying checksum...${reset}`);
      const checksumsText = yield* Effect10.tryPromise({
        try: () => fetch(checksumsAsset.browser_download_url).then((res) => {
          if (!res.ok) throw new Error("Failed to download checksums");
          return res.text();
        }),
        catch: () => new Error("Failed to download checksums.txt")
      });
      const expectedChecksum = checksumsText.split("\n").find((line) => line.includes(archiveName))?.split(/\s+/)[0];
      if (!expectedChecksum) {
        return yield* Effect10.fail(
          new Error(`No checksum found for ${archiveName}`)
        );
      }
      const archiveData = yield* Effect10.tryPromise({
        try: () => Bun.file(archivePath).arrayBuffer(),
        catch: () => new Error("Failed to read archive for checksum")
      });
      const hash = createHash2("sha256");
      hash.update(new Uint8Array(archiveData));
      const actualChecksum = hash.digest("hex");
      if (expectedChecksum !== actualChecksum) {
        return yield* Effect10.fail(
          new Error(
            `Checksum mismatch!
  Expected: ${expectedChecksum}
  Got:      ${actualChecksum}`
          )
        );
      }
      yield* Console2.log(`${dim}Extracting...${reset}`);
      const tar = Bun.spawn(["tar", "-xzf", archivePath, "-C", tempDir], {
        stdout: "ignore",
        stderr: "pipe"
      });
      const tarExitCode = yield* Effect10.tryPromise({
        try: () => tar.exited,
        catch: () => new Error("Failed to extract archive")
      });
      if (tarExitCode !== 0) {
        const stderr = yield* Effect10.tryPromise({
          try: () => new Response(tar.stderr).text(),
          catch: () => new Error("Failed to read tar stderr")
        });
        return yield* Effect10.fail(
          new Error(`Failed to extract archive: ${stderr}`)
        );
      }
      const binaryPath = process.execPath;
      const newBinaryPath = join(tempDir, "polar");
      yield* Console2.log(`${dim}Replacing binary...${reset}`);
      yield* Effect10.tryPromise({
        try: async () => {
          const newBinary = await Bun.file(newBinaryPath).arrayBuffer();
          await Bun.write(binaryPath, newBinary);
          await chmod(binaryPath, 493);
        },
        catch: (e) => new Error(
          `Failed to replace binary: ${e instanceof Error ? e.message : e}`
        )
      });
      yield* Console2.log("");
      yield* Console2.log(
        `  ${bold}${green}Updated successfully!${reset} ${dim}${VERSION}${reset} -> ${bold}${cyan}${latestVersion}${reset}`
      );
      yield* Console2.log("");
    }),
    Effect10.promise(
      () => rm(tempDir, { recursive: true, force: true }).catch(() => {
      })
    )
  );
});
var update = Command4.make(
  "update",
  {},
  () => Effect10.gen(function* () {
    const green = "\x1B[32m";
    const dim = "\x1B[2m";
    const reset = "\x1B[0m";
    yield* Console2.log(`${dim}Checking for updates...${reset}`);
    const response = yield* Effect10.tryPromise({
      try: () => fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`
      ).then((res) => res.json()),
      catch: () => new Error("Failed to fetch latest release from GitHub")
    });
    const release = yield* Schema11.decodeUnknown(GitHubRelease)(response);
    const latestVersion = release.tag_name;
    if (latestVersion === VERSION) {
      yield* Console2.log(
        `${green}Already up to date${reset} ${dim}(${VERSION})${reset}`
      );
      return;
    }
    yield* downloadAndUpdate(release, latestVersion);
  })
);

// src/cli.ts
var mainCommand = Command5.make("polar").pipe(
  Command5.withSubcommands([login, migrate, listen, update])
);
var cli = Command5.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION
});
var services = Layer5.mergeAll(
  layer,
  layer2,
  layer3,
  BunContext.layer
);
cli(process.argv).pipe(Effect11.provide(services), BunRuntime.runMain);
