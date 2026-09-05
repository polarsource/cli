import { describe, expect, mock, test } from "bun:test";
import { Effect } from "effect";
import { CustomerCreate } from "../../schemas/Customer";
import {
	MigrationContext,
	MigrationDestination,
	MigrationOrigin,
} from "../../schemas/Migration";
import { ProductCreate } from "../../schemas/Product";
import * as Polar from "../polar";
import type { LemonSqueezyImpl } from "./lemon/provider";
import * as Migration from "./migrate";

const context = MigrationContext.make({
	from: MigrationOrigin.make("store-1"),
	to: MigrationDestination.make("org-1"),
});

const product = ProductCreate.make({
	name: "Product",
	description: "Description",
	recurringInterval: null,
	prices: [{ amountType: "free" }],
});
const customer = CustomerCreate.make({
	name: "Customer",
	email: "customer@example.com",
});

describe("Migration dependencies", () => {
	for (const entity of ["products", "customers"] as const) {
		test(`${entity} uses the Polar service captured during construction`, async () => {
			const error = new Polar.PolarError({ message: "API unavailable" });
			const use = mock(() => Effect.fail(error));
			const polar = Polar.Polar.of({
				getClient: () => Effect.fail(error),
				use,
			});
			const migration = await Effect.runPromise(
				Migration.make.pipe(Effect.provideService(Polar.Polar, polar)),
			);
			const provider: LemonSqueezyImpl = {
				stores: () => Effect.succeed([]),
				products: mock(() => Effect.succeed([product])),
				customers: mock(() => Effect.succeed([customer])),
			};

			// Callers supply neither Polar nor OAuth; the captured service handles the request.
			await expect(
				Effect.runPromise(migration[entity](provider, context)),
			).rejects.toBe(error);
			expect(provider[entity]).toHaveBeenCalledWith("store-1");
			expect(use).toHaveBeenCalledTimes(1);
		});
	}

	test("the default layer provides its dependencies without caller wiring", async () => {
		const provider: LemonSqueezyImpl = {
			stores: () => Effect.succeed([]),
			products: () => Effect.succeed([]),
			customers: () => Effect.succeed([]),
		};
		const program = Effect.gen(function* () {
			const migration = yield* Migration.Migration;
			// Empty migrations exercise layer construction without network or credential access.
			yield* migration.products(provider, context);
			yield* migration.customers(provider, context);
		}).pipe(Effect.provide(Migration.layer));

		await expect(Effect.runPromise(program)).resolves.toBeUndefined();
	});
});
