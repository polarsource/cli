import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export const HOMEBREW_UPGRADE_COMMAND = "brew upgrade polarsource/tap/polar";

export function isHomebrewInstallation(binaryPath = process.execPath): boolean {
	try {
		// Resolve Homebrew's bin/opt symlinks to the installed keg. This also
		// supports custom prefixes and Cellar locations without invoking brew.
		const keg = dirname(dirname(realpathSync(binaryPath)));
		return existsSync(join(keg, "INSTALL_RECEIPT.json"));
	} catch {
		return false;
	}
}

export function getUpgradeCommand(): string {
	return isHomebrewInstallation() ? HOMEBREW_UPGRADE_COMMAND : "polar update";
}
