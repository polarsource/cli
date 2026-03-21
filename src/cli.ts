import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { existsSync, renameSync, unlinkSync } from "fs";
import { listen } from "./commands/listen";
import { login } from "./commands/login";
import { migrate } from "./commands/migrate";
import { update } from "./commands/update";
import * as Migration from "./services/migration/migrate";
import * as OAuth from "./services/oauth";
import * as Polar from "./services/polar";
import { showUpdateNotice, checkForUpdateInBackground } from "./services/update-check";
import { VERSION } from "./version";

const mainCommand = Command.make("polar").pipe(
  Command.withSubcommands([
    login,
    migrate,
    listen,
    update
  ])
);

const cli = Command.run(mainCommand, {
  name: "Polar CLI",
  version: VERSION,
});

const services = Layer.mergeAll(
  OAuth.layer,
  Polar.layer,
  Migration.layer,
  BunContext.layer
);

// Clean up stale files from Windows self-update
if (process.platform === "win32") {
  // If .new exists, a previous update was interrupted — complete it
  const pendingPath = process.execPath + ".new";
  if (existsSync(pendingPath)) {
    try { renameSync(pendingPath, process.execPath); } catch {}
  }
  try { unlinkSync(process.execPath + ".bak"); } catch {}
  try { unlinkSync(pendingPath); } catch {}
}

showUpdateNotice();
checkForUpdateInBackground();

cli(process.argv).pipe(Effect.provide(services), BunRuntime.runMain);
