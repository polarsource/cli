import { Command } from "@effect/cli";
import { Console, Effect, Schema } from "effect";
import { createHash } from "crypto";
import { chmod, mkdtemp, rename, rm, unlink } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import * as OAuth from "../services/oauth";
import { VERSION } from "../version";

const fsError = (e: unknown): Error =>
  Object.assign(
    new Error(e instanceof Error ? e.message : String(e)),
    { code: (e as any)?.code },
  );

export const replaceBinary = (
  newBinaryPath: string,
  binaryPath: string,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => chmod(newBinaryPath, 0o755),
      catch: () => new Error("Failed to chmod new binary"),
    });

    const tempPath = join(dirname(binaryPath), `.polar-update-${Date.now()}`);

    yield* Effect.gen(function* () {
      const newBinary = yield* Effect.tryPromise({
        try: () => Bun.file(newBinaryPath).arrayBuffer(),
        catch: fsError,
      });
      yield* Effect.tryPromise({
        try: () => Bun.write(tempPath, newBinary),
        catch: fsError,
      });
      yield* Effect.tryPromise({
        try: () => rename(tempPath, binaryPath),
        catch: fsError,
      });
    }).pipe(
      Effect.tapError(() =>
        Effect.promise(() => unlink(tempPath).catch(() => {})),
      ),
      Effect.catchAll((e: Error) =>
        (e as any)?.code === "EACCES"
          ? Effect.gen(function* () {
              const proc = Bun.spawn(["sudo", "mv", newBinaryPath, binaryPath], {
                stdout: "inherit",
                stderr: "inherit",
                stdin: "inherit",
              });
              const exitCode = yield* Effect.tryPromise({
                try: () => proc.exited,
                catch: () => new Error("Failed to run sudo mv"),
              });
              if (exitCode !== 0) {
                return yield* Effect.fail(new Error("sudo mv failed"));
              }
            })
          : Effect.fail(e),
      ),
    );

    yield* Effect.tryPromise({
      try: () => chmod(binaryPath, 0o755),
      catch: () => new Error("Failed to chmod binary"),
    });
  });

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

export function getReleaseArchiveName(platform: {
  os: string;
  arch: string;
}): string {
  const baseName = `polar-${platform.os}-${platform.arch}`;
  return platform.os === "darwin" ? `${baseName}.zip` : `${baseName}.tar.gz`;
}

export function getArchiveExtractionCommand(
  archivePath: string,
  destinationDir: string,
): string[] {
  if (archivePath.endsWith(".zip")) {
    return ["ditto", "-x", "-k", archivePath, destinationDir];
  }

  if (archivePath.endsWith(".tar.gz")) {
    return ["tar", "-xzf", archivePath, "-C", destinationDir];
  }

  throw new Error(`Unsupported archive format: ${archivePath}`);
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
    const archiveName = getReleaseArchiveName({ os, arch });

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
          try: () => Bun.file(archivePath).arrayBuffer() as Promise<ArrayBuffer>,
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

        const extract = Bun.spawn(
          getArchiveExtractionCommand(archivePath, tempDir),
          {
            stdout: "ignore",
            stderr: "pipe",
          },
        );

        const extractExitCode = yield* Effect.tryPromise({
          try: () => extract.exited,
          catch: () => new Error("Failed to extract archive"),
        });

        if (extractExitCode !== 0) {
          const stderr = yield* Effect.tryPromise({
            try: () => new Response(extract.stderr).text(),
            catch: () => new Error("Failed to read archive extractor stderr"),
          });
          return yield* Effect.fail(
            new Error(`Failed to extract archive: ${stderr}`),
          );
        }

        const binaryPath = process.execPath;
        const newBinaryPath = join(tempDir, "polar");

        yield* Console.log(`${dim}Replacing binary...${reset}`);

        yield* replaceBinary(newBinaryPath, binaryPath);

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

    const oauth = yield* OAuth.OAuth;
    yield* oauth.logout().pipe(Effect.catchAll(() => Effect.void));
  }),
);
