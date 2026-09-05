import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execPath } from "node:process";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version";

let home: string;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "polar-cli-test-"));
	await mkdir(join(home, ".polar"));
	// Keep CLI smoke tests offline and away from the user's credentials.
	await writeFile(
		join(home, ".polar", "update-check.json"),
		JSON.stringify({
			lastChecked: new Date().toISOString(),
			latestVersion: VERSION,
		}),
	);
});

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
});

const runCli = async (...args: string[]) => {
	const process = Bun.spawn(
		[execPath, fileURLToPath(new URL("./cli.ts", import.meta.url)), ...args],
		{
			env: { ...Bun.env, HOME: home, NO_COLOR: "1" },
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	return { exitCode, output: stdout + stderr };
};

describe("CLI argument parsing and services", () => {
	test("shows root help with every subcommand", async () => {
		const result = await runCli("--help");
		expect(result.exitCode).toBe(0);
		for (const command of ["login", "logout", "migrate", "listen", "update"]) {
			expect(result.output).toContain(command);
		}
	});

	for (const command of ["login", "logout", "migrate", "listen", "update"]) {
		test(`shows ${command} help without running its handler`, async () => {
			const result = await runCli(command, "--help");
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain(command);
		});
	}

	test("prints the version", async () => {
		const result = await runCli("--version");
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain(`polar ${VERSION}`);
		expect(result.output).not.toContain("vv");
	});

	test("rejects a missing listen URL before prompting", async () => {
		const result = await runCli("listen");
		expect(result.exitCode).not.toBe(0);
		expect(result.output).toContain("url");
	});

	test("rejects unknown commands", async () => {
		expect((await runCli("unknown-command")).exitCode).not.toBe(0);
	});

	test("provides the OAuth filesystem layer for logout", async () => {
		const tokenPath = join(home, ".polar", "tokens.json");
		await writeFile(tokenPath, "{}");
		expect((await runCli("logout")).exitCode).toBe(0);
		expect(await Bun.file(tokenPath).exists()).toBe(false);
	});
});
