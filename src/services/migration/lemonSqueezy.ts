import {
  getAuthenticatedUser,
  lemonSqueezySetup,
  listCustomers,
  listDiscounts,
  listFiles,
  listProducts,
  listStores,
  listVariants,
} from "@lemonsqueezy/lemonsqueezy.js";
import { Context, Data, Effect, Layer } from "effect";

export class LemonSqueezyError extends Data.TaggedError("LemonSqueezyError")<{
  message: string;
  cause?: unknown;
}> {}

export interface LemonSqueezyImpl {
  use: <T>(
    fn: (client: ReturnType<typeof createLemonClient>) => T
  ) => Effect.Effect<Awaited<T>, LemonSqueezyError, never>;
}

export class LemonSqueezy extends Context.Tag("LemonSqueezy")<
  LemonSqueezy,
  LemonSqueezyImpl
>() {}

export const make = (apiKey: string) =>
  Effect.gen(function* () {
    const client = createLemonClient(apiKey);

    return LemonSqueezy.of({
      use: (fn) =>
        Effect.gen(function* () {
          const result = yield* Effect.try({
            try: () => fn(client),
            catch: (error) =>
              new LemonSqueezyError({
                message: "Failed to fetch data from Lemon Squeezy",
                cause: error,
              }),
          });

          if (result instanceof Promise) {
            return yield* Effect.tryPromise({
              try: () => result,
              catch: (error) =>
                new LemonSqueezyError({
                  message: "Failed to fetch data from Lemon Squeezy",
                  cause: error,
                }),
            });
          }

          return result;
        }),
    });
  });

export const layer = (apiKey: string) =>
  Layer.scoped(LemonSqueezy, make(apiKey));

export const createLemonClient = (apiKey: string) => {
  lemonSqueezySetup({
    apiKey,
    onError: (error) => new LemonSqueezyError({ message: error.message }),
  });

  return {
    getAuthenticatedUser,
    listStores,
    listProducts,
    listDiscounts,
    listFiles,
    listVariants,
    listCustomers,
  };
};
