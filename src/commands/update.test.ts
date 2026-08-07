import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Effect } from "effect";
import {
  findReleaseAsset,
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

describe("findReleaseAsset", () => {
  test("prefers the exact expected archive name when present", () => {
    const assets = [
      { name: "polar-darwin-arm64.zip", browser_download_url: "zip-url" },
      { name: "polar-darwin-arm64.tar.gz", browser_download_url: "targz-url" },
      { name: "checksums.txt", browser_download_url: "checksums-url" },
    ];
    const found = findReleaseAsset(assets, { os: "darwin", arch: "arm64" });
    expect(found?.name).toBe("polar-darwin-arm64.zip");
  });

  test("falls back to a different extension for the same platform (issue #18)", () => {
    // Reproduces the darwin .tar.gz -> .zip rename (v1.3.4): a binary
    // built when releases still shipped .tar.gz must still find an
    // update once the release only ships .zip.
    const assets = [
      { name: "polar-darwin-arm64.zip", browser_download_url: "zip-url" },
      { name: "polar-linux-x64.tar.gz", browser_download_url: "linux-url" },
      { name: "checksums.txt", browser_download_url: "checksums-url" },
    ];
    const found = findReleaseAsset(assets, { os: "darwin", arch: "arm64" });
    expect(found?.name).toBe("polar-darwin-arm64.zip");
    expect(found?.browser_download_url).toBe("zip-url");
  });

  test("does not match a different platform's asset", () => {
    const assets = [
      { name: "polar-linux-x64.tar.gz", browser_download_url: "linux-url" },
      { name: "checksums.txt", browser_download_url: "checksums-url" },
    ];
    const found = findReleaseAsset(assets, { os: "darwin", arch: "arm64" });
    expect(found).toBeUndefined();
  });

  test("returns undefined when no asset matches the platform at all", () => {
    const assets = [
      { name: "checksums.txt", browser_download_url: "checksums-url" },
    ];
    const found = findReleaseAsset(assets, { os: "darwin", arch: "arm64" });
    expect(found).toBeUndefined();
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

  test("sets executable permissions on target binary", async () => {
    await Effect.runPromise(replaceBinary(newBinaryPath, binaryPath));

    const s = await stat(binaryPath);
    // check owner execute bit
    expect(s.mode & 0o111).toBeGreaterThan(0);
  });

  test("leaves no temp file behind after success", async () => {
    await Effect.runPromise(replaceBinary(newBinaryPath, binaryPath));

    // list files in dir — only the replaced binary should remain
    const { readdir } = await import("fs/promises");
    const files = await readdir(dir);
    const tempFiles = files.filter((f) => f.startsWith(".polar-update-"));
    expect(tempFiles).toHaveLength(0);
  });

  test("throws and cleans up temp file on non-EACCES write error", async () => {
    // Simulate a generic I/O error during Bun.write (not EACCES)
    const bunSpy = spyOn(Bun, "write").mockImplementationOnce(() =>
      Promise.reject(new Error("EIO: input/output error")),
    );

    await expect(
      Effect.runPromise(replaceBinary(newBinaryPath, binaryPath)),
    ).rejects.toThrow("EIO");

    const { readdir } = await import("fs/promises");
    const files = await readdir(dir);
    const tempFiles = files.filter((f) => f.startsWith(".polar-update-"));
    expect(tempFiles).toHaveLength(0);

    bunSpy.mockRestore();
  });

  test("does not throw when EACCES triggers sudo fallback", async () => {
    // Simulate EACCES on rename by mocking Bun.write to throw it
    const bunSpy = spyOn(Bun, "write").mockImplementationOnce(() => {
      const err: any = new Error("EACCES: permission denied");
      err.code = "EACCES";
      return Promise.reject(err);
    });

    // Mock Bun.spawn so sudo mv appears to succeed
    const spawnSpy = spyOn(Bun, "spawn").mockImplementationOnce(() => ({
      exited: Promise.resolve(0),
    }));

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
      const err: any = new Error("EACCES: permission denied");
      err.code = "EACCES";
      return Promise.reject(err);
    });

    const spawnSpy = spyOn(Bun, "spawn").mockImplementationOnce(() => ({
      exited: Promise.resolve(1),
    }));

    await expect(
      Effect.runPromise(replaceBinary(newBinaryPath, binaryPath)),
    ).rejects.toThrow("sudo mv failed");

    bunSpy.mockRestore();
    spawnSpy.mockRestore();
  });
});
