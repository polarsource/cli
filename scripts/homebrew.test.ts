import { describe, expect, test } from "bun:test";
import { generateFormula } from "./homebrew";

const checksums = [
	`${"a".repeat(64)}  polar-darwin-arm64.zip`,
	`${"b".repeat(64)}  polar-darwin-x64.zip`,
	`${"c".repeat(64)}  polar-linux-x64.tar.gz`,
].join("\n");

describe("Homebrew formula generation", () => {
	test("pins platform archives and checksums to the requested release", () => {
		const formula = generateFormula("v2.0.1", checksums);
		expect(formula).toContain("/releases/download/v2.0.1/");
		for (const line of checksums.split("\n")) {
			const [hash, archive] = line.split("  ");
			expect(formula).toContain(`sha256 "${hash}"`);
			expect(formula).toContain(`/releases/download/v2.0.1/${archive}`);
		}
		expect(formula).toContain("depends_on arch: :x86_64");
	});

	test("rejects prereleases and untrusted tag text", () => {
		for (const tag of ["v2.0.1-beta.1", "main", 'v2.0.1"\nend', "v2.0"]) {
			expect(() => generateFormula(tag, checksums)).toThrow(
				"stable release tag",
			);
		}
	});

	test("fails if any supported platform has no checksum", () => {
		for (const line of checksums.split("\n")) {
			expect(() =>
				generateFormula("v2.0.1", checksums.replace(line, "")),
			).toThrow();
		}
	});

	test("rejects malformed and duplicate checksums", () => {
		expect(() =>
			generateFormula("v2.0.1", checksums.replace("a", "z")),
		).toThrow("Invalid checksum");
		expect(() =>
			generateFormula("v2.0.1", `${checksums}\n${checksums}`),
		).toThrow("Duplicate checksum");
	});

	test("accepts sha256sum binary markers, CRLF and extra release assets", () => {
		const text = `${checksums.replaceAll("  ", " *").replaceAll("\n", "\r\n")}\r\n${"d".repeat(64)} *polar-windows-x64.zip\r\n`;
		expect(generateFormula("v2.0.1", text)).toBe(
			generateFormula("v2.0.1", checksums),
		);
	});
});
