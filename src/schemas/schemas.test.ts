import { describe, expect, test } from "bun:test";
import { Duration, Effect, Exit, Redacted, Schema } from "effect";
import { CustomerCreate } from "./Customer";
import {
	MigrationContext,
	MigrationDestination,
	MigrationOrigin,
} from "./Migration";
import { ProductCreate } from "./Product";
import { Token, type TokenJSON, Tokens } from "./Tokens";

const tokenJSON: TokenJSON = {
	token: "access-token",
	refreshToken: "refresh-token",
	expiresIn: 3600000,
	expiresAt: "2030-01-01T00:00:00.000Z",
	scope: ["openid", "products:read"],
	server: "production",
};

// These are the on-disk representations written by the Effect 3 CLI.
describe("token file compatibility", () => {
	test("decodes and re-encodes both environments without changing the JSON format", async () => {
		const stored = {
			production: tokenJSON,
			sandbox: { ...tokenJSON, server: "sandbox" },
		};
		const codec = Schema.fromJsonString(Tokens);
		const tokens = await Effect.runPromise(
			Schema.decodeUnknownEffect(codec)(JSON.stringify(stored)),
		);

		const production = tokens.production;
		if (!production) throw new Error("Missing production token");
		expect(production.expiresAt).toEqual(new Date(tokenJSON.expiresAt));
		expect(Duration.toMillis(production.expiresIn)).toBe(tokenJSON.expiresIn);
		expect(Redacted.value(production.token)).toBe("access-token");
		expect(Redacted.value(production.refreshToken)).toBe("refresh-token");
		expect(String(production.token)).not.toContain("access-token");
		expect(tokens.sandbox?.server).toBe("sandbox");

		const encoded = await Effect.runPromise(
			Schema.encodeEffect(codec)(Tokens.make(tokens)),
		);
		expect(JSON.parse(encoded)).toEqual(stored);
	});

	test("accepts empty files and missing optional environments", () => {
		const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Tokens));
		expect(decode("{}")).toEqual({});
		expect(
			decode(JSON.stringify({ production: tokenJSON })).sandbox,
		).toBeUndefined();
	});

	test("rejects malformed JSON, invalid dates, environments, and non-string secrets", () => {
		expect(
			Exit.isFailure(
				Schema.decodeUnknownExit(Schema.fromJsonString(Tokens))("{"),
			),
		).toBe(true);
		for (const input of [
			{ ...tokenJSON, expiresAt: "not-a-date" },
			{ ...tokenJSON, server: "staging" },
			{ ...tokenJSON, token: 42 },
			{ ...tokenJSON, refreshToken: null },
		]) {
			expect(Exit.isFailure(Schema.decodeUnknownExit(Token)(input))).toBe(true);
		}
	});
});

describe("migration schemas", () => {
	test("constructs branded migration identifiers", () => {
		expect<unknown>(
			MigrationContext.make({
				from: MigrationOrigin.make("store-1"),
				to: MigrationDestination.make("org-1"),
			}),
		).toEqual({ from: "store-1", to: "org-1" });
	});

	test("round-trips fixed, free, and custom prices with each recurrence", async () => {
		for (const price of [
			{ amountType: "fixed", priceCurrency: "usd", priceAmount: 1000 },
			{ amountType: "free" },
			{
				amountType: "custom",
				priceCurrency: "usd",
				minimumAmount: 50,
				presetAmount: 100,
			},
		]) {
			for (const recurringInterval of ["month", "year", null]) {
				const input = {
					name: "Product",
					description: "Description",
					recurringInterval,
					prices: [price],
				};
				const decoded = await Effect.runPromise(
					Schema.decodeUnknownEffect(ProductCreate)(input),
				);
				expect<unknown>(
					await Effect.runPromise(Schema.encodeEffect(ProductCreate)(decoded)),
				).toEqual(input);
			}
		}
	});

	test("requires exactly one price and a supported recurrence", () => {
		const input = {
			name: "Product",
			description: "Description",
			recurringInterval: null,
		};
		const decode = Schema.decodeUnknownExit(ProductCreate);
		expect(Exit.isFailure(decode({ ...input, prices: [] }))).toBe(true);
		expect(
			Exit.isFailure(
				decode({
					...input,
					prices: [{ amountType: "free" }, { amountType: "free" }],
				}),
			),
		).toBe(true);
		expect(
			Exit.isFailure(
				decode({
					...input,
					recurringInterval: "week",
					prices: [{ amountType: "free" }],
				}),
			),
		).toBe(true);
	});

	test("accepts optional billing addresses and validates SDK country codes", async () => {
		for (const billingAddress of [
			undefined,
			{ country: "US", city: null, state: null },
		]) {
			const input = {
				name: "Customer",
				email: "customer@example.com",
				billingAddress,
			};
			const decoded = await Effect.runPromise(
				Schema.decodeUnknownEffect(CustomerCreate)(input),
			);
			expect<unknown>(
				await Effect.runPromise(Schema.encodeEffect(CustomerCreate)(decoded)),
			).toEqual(input);
		}
		expect(
			Exit.isFailure(
				Schema.decodeUnknownExit(CustomerCreate)({
					name: "Customer",
					email: "customer@example.com",
					billingAddress: { country: "invalid", city: null, state: null },
				}),
			),
		).toBe(true);
	});
});
