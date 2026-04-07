import { describe, expect, it } from "bun:test";
import { Webhook } from "standardwebhooks";
import { signPayload } from "./listen";

/**
 * These tests verify that signPayload produces signatures compatible with
 * both the @polar-sh/sdk's validateEvent and raw standardwebhooks verification.
 *
 * The key derivation chain in @polar-sh/sdk's validateEvent is:
 *   1. base64Encode(secret) → pass to new Webhook()
 *   2. Webhook constructor base64Decodes → raw UTF-8 bytes of secret
 *   3. HMAC-SHA256 with those bytes
 *
 * signPayload must produce the same HMAC, so it uses Buffer.from(secret, "utf-8")
 * directly as the key.
 */

function verifyWithStandardWebhooks(
	body: string,
	headers: Record<string, string>,
	secret: string,
): unknown {
	// Replicate what @polar-sh/sdk's validateEvent does:
	// base64-encode the raw secret, pass to Webhook constructor
	const base64Secret = Buffer.from(secret, "utf-8").toString("base64");
	const wh = new Webhook(base64Secret);
	return wh.verify(body, headers);
}

describe("signPayload", () => {
	it("produces headers that pass standardwebhooks verification", () => {
		const secret = "test-webhook-secret";
		const body = JSON.stringify({
			type: "checkout.created",
			data: { id: "123" },
		});

		const headers = signPayload(body, secret);

		expect(headers["webhook-id"]).toStartWith("msg_");
		expect(headers["webhook-timestamp"]).toBeDefined();
		expect(headers["webhook-signature"]).toStartWith("v1,");
		expect(headers["content-type"]).toBe("application/json");

		// The signature must be verifiable using the same key derivation as validateEvent
		const parsed = verifyWithStandardWebhooks(body, headers, secret);
		expect(parsed).toEqual(JSON.parse(body));
	});

	it("works with secrets containing special characters", () => {
		const secret = "s3cr3t!@#$%^&*()_+-=";
		const body = JSON.stringify({ type: "order.created", data: {} });

		const headers = signPayload(body, secret);
		const parsed = verifyWithStandardWebhooks(body, headers, secret);
		expect(parsed).toEqual(JSON.parse(body));
	});

	it("works with long secrets", () => {
		const secret = "a".repeat(256);
		const body = JSON.stringify({
			type: "subscription.active",
			data: { id: "sub_1" },
		});

		const headers = signPayload(body, secret);
		const parsed = verifyWithStandardWebhooks(body, headers, secret);
		expect(parsed).toEqual(JSON.parse(body));
	});

	it("fails verification with a different secret", () => {
		const body = JSON.stringify({ type: "checkout.created", data: {} });
		const headers = signPayload(body, "correct-secret");

		expect(() =>
			verifyWithStandardWebhooks(body, headers, "wrong-secret"),
		).toThrow();
	});

	it("fails verification if body is tampered", () => {
		const secret = "test-secret";
		const body = JSON.stringify({
			type: "checkout.created",
			data: { id: "123" },
		});
		const headers = signPayload(body, secret);

		const tampered = JSON.stringify({
			type: "checkout.created",
			data: { id: "456" },
		});
		expect(() =>
			verifyWithStandardWebhooks(tampered, headers, secret),
		).toThrow();
	});

	it("produces unique message IDs per call", () => {
		const body = JSON.stringify({ type: "test", data: {} });
		const h1 = signPayload(body, "secret");
		const h2 = signPayload(body, "secret");

		expect(h1["webhook-id"]).not.toBe(h2["webhook-id"]);
	});
});
