// src/cli.ts
import { Command as Command3 } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect as Effect9, Layer as Layer5 } from "effect";

// src/commands/login.ts
import { Command } from "@effect/cli";
import { Console, Effect as Effect2 } from "effect";

// src/services/oauth.ts
import { createHash, randomBytes } from "crypto";
import { createServer } from "http";
import path from "path";
import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Context, Data, Effect, Layer, Redacted, Schema as Schema2 } from "effect";
import open from "open";
import os from "os";

// src/schemas/Tokens.ts
import { Scope } from "@polar-sh/sdk/models/components/scope";
import { Schema } from "effect";
var TokenScope = Schema.Array(Schema.Literal(...Object.values(Scope)));
var Token = Schema.Struct({
  token: Schema.Redacted(Schema.String),
  refreshToken: Schema.Redacted(Schema.String),
  expiresIn: Schema.DurationFromMillis,
  expiresAt: Schema.Date,
  scope: TokenScope,
  server: Schema.Literal("production", "sandbox")
});
var Tokens = Schema.Struct({
  production: Schema.optional(Token),
  sandbox: Schema.optional(Token)
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
    "openid",
    "profile",
    "email",
    "web:read",
    "web:write"
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
var OAuthRequirementsLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer);
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
      () => Schema2.encode(Tokens)(mergedTokens).pipe(
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
    Effect.flatMap(Schema2.decode(Schema2.parseJson(Tokens))),
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
  const url = `${baseUrl}?${params.toString()}`;
  return url;
});
var getLoginResult = (responseUrl) => Effect.gen(function* () {
  const url = new URL(responseUrl, config.redirectUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
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
  return yield* Schema2.decodeUnknown(Token)({
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
  return yield* Schema2.decodeUnknown(Token)({
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

// src/commands/login.ts
var login = Command.make(
  "login",
  {},
  () => Effect2.gen(function* () {
    const oauth = yield* OAuth;
    yield* oauth.login("production");
    yield* Console.log("Successfully logged into Polar");
  })
);

// src/commands/migrate.ts
import { Command as Command2, Options, Prompt as Prompt3 } from "@effect/cli";
import { Effect as Effect8 } from "effect";

// src/prompts/migration.ts
import { Prompt } from "@effect/cli";
import { Effect as Effect3 } from "effect";
var migrationProviders = [
  { value: "lemonSqueezy", title: "Lemon Squeezy" },
  { value: "paddle", title: "Paddle", disabled: true },
  { value: "stripe", title: "Stripe", disabled: true }
];
var providerPrompt = Prompt.select({
  message: "Select Migration Provider",
  choices: migrationProviders
});
var migrationPrompt = Prompt.multiSelect({
  message: "Select Entities to Migrate",
  choices: [
    { value: "products", title: "Products" },
    { value: "customers", title: "Customers" }
  ]
});
var apiKeyPrompt = Prompt.text({
  message: "Enter the API Key",
  validate: (value) => {
    if (value.length === 0) {
      return Effect3.fail("API Key is required");
    }
    return Effect3.succeed(value);
  }
});
var storePrompt = (provider) => Effect3.gen(function* () {
  const stores = yield* provider.stores();
  return yield* Prompt.select({
    message: "Select Store to Migrate",
    choices: stores.data.map((store) => ({
      value: store.id,
      title: store.attributes.name
    }))
  });
});

// src/prompts/organizations.ts
import { Prompt as Prompt2 } from "@effect/cli";
import { Effect as Effect5 } from "effect";

// src/schemas/Organization.ts
import { Schema as Schema3 } from "effect";
var OrganizationCreate = Schema3.Struct({
  name: Schema3.String,
  slug: Schema3.String
});

// src/services/polar.ts
import { Polar as PolarSDK } from "@polar-sh/sdk";
import { Context as Context2, Data as Data2, Effect as Effect4, Layer as Layer2, Redacted as Redacted2 } from "effect";
var SANDBOX_SERVER_URL = "https://sandbox-api.polar.sh";
var PRODUCTION_SERVER_URL = "https://api.polar.sh";
var PolarError = class extends Data2.TaggedError("PolarError") {
};
var Polar = class extends Context2.Tag("Polar")() {
};
var PolarRequirementsLayer = Layer2.mergeAll(layer);
var make2 = Effect4.gen(function* () {
  const oauth = yield* OAuth;
  const getClient = (server) => Effect4.gen(function* () {
    const token = yield* oauth.resolveAccessToken(server);
    const serverUrl = server === "production" ? PRODUCTION_SERVER_URL : SANDBOX_SERVER_URL;
    const client = new PolarSDK({
      serverURL: serverUrl,
      accessToken: Redacted2.value(token.token)
    });
    return client;
  }).pipe(
    Effect4.catchTag(
      "OAuthError",
      (error) => Effect4.fail(
        new PolarError({
          message: "Failed to get Polar SDK client",
          cause: error
        })
      )
    )
  );
  const use = (fn) => Effect4.gen(function* () {
    const client = yield* getClient("production");
    const result = fn(client);
    return yield* Effect4.isEffect(result) ? result : Effect4.promise(() => result);
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
var selectOrganizationPrompt = Effect5.gen(function* () {
  const polar = yield* Polar;
  const organizations = yield* polar.use(
    (client) => client.organizations.list({
      page: 1,
      limit: 100
    })
  ).pipe(Effect5.map((organizations2) => organizations2.result.items));
  return yield* Prompt2.select({
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
var organizationNamePrompt = Prompt2.text({
  message: "Organization Name"
});
var organizationSlugPrompt = (name) => Prompt2.text({
  message: "Organization Slug",
  default: slugify(name)
});
var createNewOrganizationPrompt = Effect5.gen(function* () {
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
  Effect5.flatMap((organization) => {
    if (organization === "new") {
      return createNewOrganizationPrompt;
    }
    return Effect5.succeed(organization);
  })
);

// src/schemas/Migration.ts
import { Schema as Schema4 } from "effect";
var MigrationOrigin = Schema4.String.pipe(
  Schema4.brand("MigrationOrigin")
);
var MigrationDestination = Schema4.String.pipe(
  Schema4.brand("MigrationDestination")
);
var MigrationContext = Schema4.Struct({
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
import { Context as Context3, Data as Data3, Effect as Effect6, Layer as Layer3, Schema as Schema7 } from "effect";

// src/schemas/Customer.ts
import { Schema as Schema5 } from "effect";
var CustomerCreate = Schema5.Struct({
  name: Schema5.String,
  email: Schema5.String,
  billingAddress: Schema5.optional(
    Schema5.Struct({
      country: Schema5.String,
      city: Schema5.NullOr(Schema5.String),
      state: Schema5.NullOr(Schema5.String)
    })
  )
});

// src/schemas/Product.ts
import { Schema as Schema6 } from "effect";
var CreateProductPriceCustom = Schema6.mutable(
  Schema6.Struct({
    amountType: Schema6.Literal("custom"),
    priceCurrency: Schema6.Literal("USD"),
    minimumAmount: Schema6.optional(Schema6.Number),
    maximumAmount: Schema6.optional(Schema6.Number),
    presetAmount: Schema6.optional(Schema6.Number)
  })
);
var CreateProductPriceFree = Schema6.mutable(
  Schema6.Struct({
    amountType: Schema6.Literal("free")
  })
);
var CreateProductPriceFixed = Schema6.mutable(
  Schema6.Struct({
    amountType: Schema6.Literal("fixed"),
    priceCurrency: Schema6.Literal("usd"),
    priceAmount: Schema6.Number
  })
);
var ProductCreate = Schema6.mutable(
  Schema6.Struct({
    name: Schema6.String,
    description: Schema6.String,
    recurringInterval: Schema6.NullOr(Schema6.Literal("month", "year")),
    prices: Schema6.mutable(
      Schema6.Tuple(
        Schema6.Union(
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
var make3 = (apiKey) => Effect6.gen(function* () {
  const client = yield* createLemonClient(apiKey);
  return LemonSqueezy.of({
    stores: () => Effect6.tryPromise({
      try: () => client.listStores().then(
        (response) => response.data ?? []
      ),
      catch: (error) => new LemonSqueezyError({
        message: "Failed to list Lemon Squeezy stores",
        cause: error
      })
    }),
    customers: (storeId) => Effect6.tryPromise({
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
      Effect6.map(parseCustomers),
      Effect6.flatMap(Schema7.decodeUnknown(Schema7.Array(CustomerCreate))),
      Effect6.catchTag(
        "ParseError",
        (error) => new LemonSqueezyError({
          message: "Failed to parse customers",
          cause: error
        })
      )
    ),
    products: (_storeId) => Effect6.tryPromise({
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
      Effect6.map(parseVariants),
      Effect6.flatMap(Schema7.decodeUnknown(Schema7.Array(ProductCreate))),
      Effect6.catchTag(
        "ParseError",
        (error) => new LemonSqueezyError({
          message: "Failed to parse products",
          cause: error
        })
      )
    )
  });
});
var createLemonClient = (apiKey) => Effect6.try(() => {
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
import { Context as Context4, Data as Data4, Effect as Effect7, Layer as Layer4, Schema as Schema8 } from "effect";
var MigrationError = class extends Data4.TaggedError("MigrationError") {
};
var Migration = class extends Context4.Tag("Migration")() {
};
var make4 = Effect7.gen(function* () {
  return Migration.of({
    products: (provider, migration) => Effect7.gen(function* () {
      const polar = yield* Polar;
      const _oauth = yield* OAuth;
      const providerProducts = provider.products(migration.from);
      yield* providerProducts.pipe(
        Effect7.flatMap(Schema8.encode(Schema8.Array(ProductCreate))),
        Effect7.mapError(
          (error) => new PolarError({
            message: "Failed to encode products",
            cause: error
          })
        ),
        Effect7.flatMap(
          (products) => Effect7.all(
            products.map(
              (product) => polar.use(
                (client) => Effect7.tryPromise({
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
        Effect7.tap(
          (products) => Effect7.logDebug(`${products.length} products migrated`)
        )
      );
    }),
    customers: (provider, migration) => Effect7.gen(function* () {
      const polar = yield* Polar;
      const _oauth = yield* OAuth;
      const providerCustomers = provider.customers(migration.from);
      yield* providerCustomers.pipe(
        Effect7.flatMap(Schema8.encode(Schema8.Array(CustomerCreate))),
        Effect7.mapError(
          (error) => new PolarError({
            message: "Failed to encode customers",
            cause: error
          })
        ),
        Effect7.flatMap(
          (customers) => Effect7.all(
            customers.map(
              (customer) => polar.use(
                (client) => Effect7.tryPromise({
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
        Effect7.tap(
          (customers) => Effect7.logDebug(`${customers.length} customers migrated`)
        )
      );
    })
  });
});
var layer3 = Layer4.scoped(Migration, make4);

// src/commands/migrate.ts
var migrate = Command2.make(
  "migrate",
  {},
  () => Effect8.gen(function* () {
    const provider = yield* Prompt3.all([providerPrompt, apiKeyPrompt]).pipe(
      Prompt3.run,
      Effect8.flatMap(([provider2, apiKey]) => resolveProvider(provider2, apiKey))
    );
    const migration = yield* Migration;
    const storeToMigrate = yield* storePrompt(provider);
    const entitiesToMigrate = yield* migrationPrompt;
    const organizationId = yield* organizationPrompt;
    const migrationContext = MigrationContext.make({
      from: MigrationOrigin.make(storeToMigrate),
      to: MigrationDestination.make(organizationId)
    });
    yield* Effect8.all(
      {
        products: entitiesToMigrate.includes("products") ? migration.products(provider, migrationContext) : Effect8.succeed([]),
        customers: entitiesToMigrate.includes("customers") ? migration.customers(provider, migrationContext) : Effect8.succeed([])
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
      return Effect8.die("Unsupported Migration Provider");
  }
};

// src/cli.ts
var VERSION = "v1.0.0";
var mainCommand = Command3.make("polar").pipe(
  Command3.withSubcommands([login, migrate])
);
var cli = Command3.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION
});
var services = Layer5.mergeAll(
  layer,
  layer2,
  layer3,
  NodeContext.layer
);
cli(process.argv).pipe(Effect9.provide(services), NodeRuntime.runMain);
