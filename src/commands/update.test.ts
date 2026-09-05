import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
	getArchiveExtractionCommand,
	getReleaseArchiveName,
	replaceBinary,
} from "./update";

async function makeTemp() {
	return mkdtemp(join(tmpdir(), "polar-test-"));
}

describe("getReleaseArchiveName", () => {
	test("uses zip archives for darwin releases", () => {
		expect(getReleaseArchiveName({ os: "darwin", arch: "arm64" })).toBe(
			"polar-darwin-arm64.zip",
		);
		expect(getReleaseArchiveName({ os: "darwin", arch: "x64" })).toBe(
			"polar-darwin-x64.zip",
		);
	});

	test("uses tar.gz archives for linux releases", () => {
		expect(getReleaseArchiveName({ os: "linux", arch: "x64" })).toBe(
			"polar-linux-x64.tar.gz",
		);
	});
});

describe("getArchiveExtractionCommand", () => {
	test("uses ditto for zip archives", () => {
		expect(getArchiveExtractionCommand("/tmp/polar.zip", "/tmp/out")).toEqual([
			"ditto",
			"-x",
			"-k",
			"/tmp/polar.zip",
			"/tmp/out",
		]);
	});

	test("uses tar for tar.gz archives", () => {
		expect(
			getArchiveExtractionCommand("/tmp/polar.tar.gz", "/tmp/out"),
		).toEqual(["tar", "-xzf", "/tmp/polar.tar.gz", "-C", "/tmp/out"]);
	});
});

describe("replaceBinary", () => {
	let dir: string;
	let newBinaryPath: string;
	let binaryPath: string;

	beforeEach(async () => {
		dir = await makeTemp();
		newBinaryPath = join(dir, "polar-new");
		binaryPath = join(dir, "polar");
		await writeFile(newBinaryPath, "#!/bin/sh\necho new");
		await writeFile(binaryPath, "#!/bin/sh\necho old");
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("replaces target binary with new binary content", async () => {
		await Effect.runPromise(replaceBinary(newBinaryPath, binaryPath));

		const content = await readFile(binaryPath, "utf8");
		expect(content).toBe("#!/bin/sh\necho new");
	});

	test("preserves the filesystem cause when chmod fails", async () => {
		await expect(
			Effect.runPromise(replaceBinary(join(dir, "missing"), binaryPath)),
		).rejects.toMatchObject({
			_tag: "UpdateError",
			message: "Failed to chmod new binary",
			cause: { code: "ENOENT" },
		});
		expect(await readFile(binaryPath, "utf8")).toBe("#!/bin/sh\necho old");
	});

	test("sets executable permissions on target binary", async () => {
		await Effect.runPromise(replaceBinary(newBinaryPath, binaryPath));

		const s = await stat(binaryPath);
		// check owner execute bit
		expect(s.mode & 0o111).toBeGreaterThan(0);
	});

	test("leaves no temp file behind after success", async () => {
		await Effect.runPromise(replaceBinary(newBinaryPath, binaryPath));

		// list files in dir — only the replaced binary should remain
		const { readdir } = await import("node:fs/promises");
		const files = await readdir(dir);
		const tempFiles = files.filter((f) => f.startsWith(".polar-update-"));
		expect(tempFiles).toHaveLength(0);
	});

	test("throws and cleans up temp file on non-EACCES write error", async () => {
		// Simulate a generic I/O error during Bun.write (not EACCES)
		const cause = Object.assign(new Error("EIO: input/output error"), {
			code: "EIO",
		});
		const bunSpy = spyOn(Bun, "write").mockImplementationOnce(() =>
			Promise.reject(cause),
		);

		await expect(
			Effect.runPromise(replaceBinary(newBinaryPath, binaryPath)),
		).rejects.toMatchObject({
			_tag: "UpdateError",
			message: "EIO: input/output error",
			code: "EIO",
			cause,
		});

		const { readdir } = await import("node:fs/promises");
		const files = await readdir(dir);
		const tempFiles = files.filter((f) => f.startsWith(".polar-update-"));
		expect(tempFiles).toHaveLength(0);

		bunSpy.mockRestore();
	});

	test("does not throw when EACCES triggers sudo fallback", async () => {
		// Simulate EACCES on rename by mocking Bun.write to throw it
		const bunSpy = spyOn(Bun, "write").mockImplementationOnce(() => {
			const err = Object.assign(new Error("EACCES: permission denied"), {
				code: "EACCES",
			});
			return Promise.reject(err);
		});

		// Mock Bun.spawn so sudo mv appears to succeed
		const spawnSpy = spyOn(Bun, "spawn").mockImplementationOnce(
			() =>
				({
					exited: Promise.resolve(0),
				}) as ReturnType<typeof Bun.spawn>,
		);

		await Effect.runPromise(replaceBinary(newBinaryPath, binaryPath));

		// Verify sudo mv was called with the right args
		expect(spawnSpy).toHaveBeenCalledWith(
			["sudo", "mv", newBinaryPath, binaryPath],
			expect.objectContaining({ stdin: "inherit" }),
		);

		bunSpy.mockRestore();
		spawnSpy.mockRestore();
	});

	test("throws when sudo mv exits non-zero", async () => {
		const bunSpy = spyOn(Bun, "write").mockImplementationOnce(() => {
			const err = Object.assign(new Error("EACCES: permission denied"), {
				code: "EACCES",
			});
			return Promise.reject(err);
		});

		const spawnSpy = spyOn(Bun, "spawn").mockImplementationOnce(
			() =>
				({
					exited: Promise.resolve(1),
				}) as ReturnType<typeof Bun.spawn>,
		);

		await expect(
			Effect.runPromise(replaceBinary(newBinaryPath, binaryPath)),
		).rejects.toMatchObject({
			_tag: "UpdateError",
			message: "sudo mv failed",
		});

		bunSpy.mockRestore();
		spawnSpy.mockRestore();
	});
});
