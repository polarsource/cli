import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isHomebrewInstallation } from "./installation";

describe("Homebrew installation detection", () => {
	let directory: string;
	let binary: string;
	let keg: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "polar-installation-"));
		keg = join(directory, "custom-cellar", "polar", "2.0.1");
		binary = join(keg, "bin", "polar");
		await mkdir(join(keg, "bin"), { recursive: true });
		await writeFile(binary, "binary");
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	test("detects a keg through a symlink with a custom Homebrew prefix", async () => {
		await writeFile(join(keg, "INSTALL_RECEIPT.json"), "{}");
		const link = join(directory, "polar");
		await symlink(binary, link);
		expect(isHomebrewInstallation(binary)).toBe(true);
		expect(isHomebrewInstallation(link)).toBe(true);
	});

	test("does not classify a standalone binary as Homebrew", () => {
		expect(isHomebrewInstallation(binary)).toBe(false);
	});

	test("compiled CLI refuses to self-update inside a Homebrew keg", async () => {
		const build = Bun.spawn(
			["bun", "build", "./src/cli.ts", "--compile", "--outfile", binary],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await build.exited).toBe(0);
		await writeFile(join(keg, "INSTALL_RECEIPT.json"), "{}");
		const link = join(directory, "polar");
		await symlink(binary, link);
		const before = Bun.hash(await Bun.file(binary).arrayBuffer());
		const update = Bun.spawn([link, "update"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = await new Response(update.stdout).text();
		expect(await update.exited).toBe(0);
		expect(output).toContain("brew upgrade polarsource/tap/polar");
		expect(output).not.toContain("Checking for updates");
		expect(Bun.hash(await Bun.file(binary).arrayBuffer())).toBe(before);
	}, 30_000);

	test("handles a missing binary without throwing", () => {
		expect(isHomebrewInstallation(join(directory, "missing"))).toBe(false);
	});
});
