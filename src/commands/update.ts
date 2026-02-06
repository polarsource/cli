import { Command } from "@effect/cli";
import { Console, Effect, Schema } from "effect";
import { createHash } from "crypto";
import { chmod, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { VERSION } from "../version";

const REPO = "polarsource/cli";

const GitHubRelease = Schema.Struct({
  tag_name: Schema.String,
  assets: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      browser_download_url: Schema.String,
    }),
  ),
});

function detectPlatform(): { os: string; arch: string } {
  const platform = process.platform;
  const arch = process.arch;

  let os: string;
  switch (platform) {
    case "darwin":
      os = "darwin";
      break;
    case "linux":
      os = "linux";
      break;
    default:
      throw new Error(`Unsupported OS: ${platform}`);
  }

  let normalizedArch: string;
  switch (arch) {
    case "x64":
      normalizedArch = "x64";
      break;
    case "arm64":
      normalizedArch = "arm64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  if (os === "linux" && normalizedArch === "arm64") {
    throw new Error("Linux arm64 is not yet supported");
  }

  return { os, arch: normalizedArch };
}

const downloadAndUpdate = (
  release: typeof GitHubRelease.Type,
  latestVersion: string,
) =>
  Effect.gen(function* () {
    const bold = "\x1b[1m";
    const cyan = "\x1b[36m";
    const green = "\x1b[32m";
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";

    const { os, arch } = detectPlatform();
    const platform = `${os}-${arch}`;
    const archiveName = `polar-${platform}.tar.gz`;

    const asset = release.assets.find((a) => a.name === archiveName);
    if (!asset) {
      return yield* Effect.fail(
        new Error(`No release asset found for platform: ${platform}`),
      );
    }

    const checksumsAsset = release.assets.find(
      (a) => a.name === "checksums.txt",
    );
    if (!checksumsAsset) {
      return yield* Effect.fail(
        new Error("No checksums.txt found in release"),
      );
    }

    const tempDir = yield* Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), "polar-update-")),
      catch: () => new Error("Failed to create temp directory"),
    });

    yield* Effect.ensuring(
      Effect.gen(function* () {
        yield* Console.log(`${dim}Downloading ${latestVersion}...${reset}`);

        const archiveBuffer = yield* Effect.tryPromise({
          try: () =>
            fetch(asset.browser_download_url).then((res) => {
              if (!res.ok)
                throw new Error(
                  `Download failed: ${res.status} ${res.statusText}`,
                );
              return res.arrayBuffer();
            }),
          catch: (e) =>
            new Error(
              `Failed to download binary: ${e instanceof Error ? e.message : e}`,
            ),
        });

        const archivePath = join(tempDir, archiveName);
        yield* Effect.tryPromise({
          try: () => Bun.write(archivePath, archiveBuffer),
          catch: () => new Error("Failed to write archive to disk"),
        });

        yield* Console.log(`${dim}Verifying checksum...${reset}`);

        const checksumsText = yield* Effect.tryPromise({
          try: () =>
            fetch(checksumsAsset.browser_download_url).then((res) => {
              if (!res.ok) throw new Error("Failed to download checksums");
              return res.text();
            }),
          catch: () => new Error("Failed to download checksums.txt"),
        });

        const expectedChecksum = checksumsText
          .split("\n")
          .find((line) => line.includes(archiveName))
          ?.split(/\s+/)[0];

        if (!expectedChecksum) {
          return yield* Effect.fail(
            new Error(`No checksum found for ${archiveName}`),
          );
        }

        const archiveData = yield* Effect.tryPromise({
          try: () => Bun.file(archivePath).arrayBuffer(),
          catch: () => new Error("Failed to read archive for checksum"),
        });

        const hash = createHash("sha256");
        hash.update(new Uint8Array(archiveData));
        const actualChecksum = hash.digest("hex");

        if (expectedChecksum !== actualChecksum) {
          return yield* Effect.fail(
            new Error(
              `Checksum mismatch!\n  Expected: ${expectedChecksum}\n  Got:      ${actualChecksum}`,
            ),
          );
        }

        yield* Console.log(`${dim}Extracting...${reset}`);

        const tar = Bun.spawn(["tar", "-xzf", archivePath, "-C", tempDir], {
          stdout: "ignore",
          stderr: "pipe",
        });

        const tarExitCode = yield* Effect.tryPromise({
          try: () => tar.exited,
          catch: () => new Error("Failed to extract archive"),
        });

        if (tarExitCode !== 0) {
          const stderr = yield* Effect.tryPromise({
            try: () => new Response(tar.stderr).text(),
            catch: () => new Error("Failed to read tar stderr"),
          });
          return yield* Effect.fail(
            new Error(`Failed to extract archive: ${stderr}`),
          );
        }

        const binaryPath = process.execPath;
        const newBinaryPath = join(tempDir, "polar");

        yield* Console.log(`${dim}Replacing binary...${reset}`);

        yield* Effect.tryPromise({
          try: async () => {
            const newBinary = await Bun.file(newBinaryPath).arrayBuffer();
            await Bun.write(binaryPath, newBinary);
            await chmod(binaryPath, 0o755);
          },
          catch: (e) =>
            new Error(
              `Failed to replace binary: ${e instanceof Error ? e.message : e}`,
            ),
        });

        yield* Console.log("");
        yield* Console.log(
          `  ${bold}${green}Updated successfully!${reset} ${dim}${VERSION}${reset} -> ${bold}${cyan}${latestVersion}${reset}`,
        );
        yield* Console.log("");
      }),
      Effect.promise(() =>
        rm(tempDir, { recursive: true, force: true }).catch(() => {}),
      ),
    );
  });

export const update = Command.make("update", {}, () =>
  Effect.gen(function* () {
    const green = "\x1b[32m";
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";

    yield* Console.log(`${dim}Checking for updates...${reset}`);

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          `https://api.github.com/repos/${REPO}/releases/latest`,
        ).then((res) => res.json()),
      catch: () => new Error("Failed to fetch latest release from GitHub"),
    });

    const release = yield* Schema.decodeUnknown(GitHubRelease)(response);
    const latestVersion = release.tag_name;

    if (latestVersion === VERSION) {
      yield* Console.log(
        `${green}Already up to date${reset} ${dim}(${VERSION})${reset}`,
      );
      return;
    }

    yield* downloadAndUpdate(release, latestVersion);
  }),
);
