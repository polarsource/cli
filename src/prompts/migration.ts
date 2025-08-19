import { Prompt } from "@effect/cli";
import { Effect } from "effect";

const migrationProviders = [
  { value: "lemonSqueezy", title: "Lemon Squeezy" },
  { value: "paddle", title: "Paddle", disabled: true },
  { value: "stripe", title: "Stripe", disabled: true },
] as const;

export const providerPrompt = Prompt.select({
  message: "Select Migration Provider",
  choices: migrationProviders,
});

export const migrationPrompt = Prompt.multiSelect({
  message: "Select Entities to Migrate",
  choices: [
    { value: "products", title: "Products" },
    { value: "customers", title: "Customers" },
  ],
});

export const apiKeyPrompt = Prompt.text({
  message: "Enter the API Key",
  validate: (value) => {
    if (value.length === 0) {
      return Effect.fail("API Key is required");
    }

    return Effect.succeed(value);
  },
});
