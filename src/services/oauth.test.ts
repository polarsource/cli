import { describe, expect, test } from "bun:test"
import { OAUTH_LISTEN_HOST } from "./oauth"

describe("oauth callback listener", () => {
  test("binds OAuth callback server to IPv4 loopback", () => {
    expect(OAUTH_LISTEN_HOST).toBe("127.0.0.1")
  })
})
