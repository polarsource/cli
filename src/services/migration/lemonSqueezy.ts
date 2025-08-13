import { Config, Context, Data, Effect, Layer, Redacted } from "effect";
import {
  getAuthenticatedUser,
  lemonSqueezySetup,
  listDiscounts,
  listFiles,
  listProducts,
  listStores,
  listVariants,
  listCustomers,
} from "@lemonsqueezy/lemonsqueezy.js";

export class LemonSqueezyError extends Data.TaggedError("LemonSqueezyError")<{
  message: string;
  cause?: unknown;
}> {}

export interface LemonSqueezyImpl {
  use: <T>(
    fn: (client: ReturnType<typeof createLemonClient>) => T
  ) => Effect.Effect<Awaited<T>, LemonSqueezyError>;
}

export class LemonSqueezy extends Context.Tag("LemonSqueezy")<
  LemonSqueezy,
  LemonSqueezyImpl
>() {}

export const make = Effect.gen(function* () {
  const client = createLemonClient("");

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

export const layer = Layer.scoped(LemonSqueezy, make);

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
