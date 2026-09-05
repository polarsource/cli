import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Effect, Schema } from "effect";
import { Token } from "../schemas/Tokens";
import * as OAuth from "./oauth";

const token = Schema.decodeUnknownSync(Token)({
	token: "access-token",
	refreshToken: "refresh-token",
	expiresIn: 3600000,
	expiresAt: "2030-01-01T00:00:00.000Z",
	scope: ["openid"],
	server: "sandbox",
});

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;

afterEach(() => {
	fetchSpy?.mockRestore();
});

describe("OAuth error mapping", () => {
	test("wraps v4 SchemaError as OAuthError when a refresh response is invalid", async () => {
		fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
			Response.json({
				access_token: 42,
				refresh_token: "new-refresh-token",
				expires_in: 3600000,
				scope: "openid",
			}),
		);

		const program = Effect.gen(function* () {
			const oauth = yield* OAuth.OAuth;
			return yield* oauth.refresh(token);
		}).pipe(Effect.provide(OAuth.layer));

		// Invalid responses fail before writing anything to the token file.
		await expect(Effect.runPromise(program)).rejects.toMatchObject({
			_tag: "OAuthError",
			message: "Failed to parse token response into a Token Schema",
			cause: { _tag: "SchemaError" },
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://sandbox-api.polar.sh/v1/oauth2/token",
			expect.objectContaining({ method: "POST" }),
		);
	});
});
