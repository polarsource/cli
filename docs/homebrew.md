# Homebrew tap

The tap is `polarsource/homebrew-tap`. Users install and upgrade with:

```sh
brew install polarsource/tap/polar
brew upgrade polarsource/tap/polar
```

The generated formula installs the existing signed/notarized macOS arm64 and
x64 archives and the Linux x64 archive. It verifies the platform's SHA-256 from
the release's `checksums.txt`. Bun is embedded in the executable and is not an
installation dependency. Linux arm64 is not included because the current release
workflow does not build that target.

## One-time setup

1. Create a public `polarsource/homebrew-tap` repository with an initial commit
   on its default branch (for example, a README). This is required before the
   publishing workflow can check it out and open a pull request.
2. Create a fine-grained GitHub token restricted to `polarsource/homebrew-tap`,
   with **Contents: read/write** and **Pull requests: read/write**. Complete any
   organization approval required for the token.
3. Store it as the `HOMEBREW_TAP_TOKEN` Actions secret in `polarsource/cli`.
   The CLI repository's `GITHUB_TOKEN` cannot write to the separate tap.
4. Merge the Homebrew support change and publish a new stable CLI release that
   includes it. Older binaries do not have the Homebrew updater guard; do not
   bootstrap the public tap with one of those releases.
5. Merge the generated `polar: update to vX.Y.Z` pull request in the tap to make
   the first formula available. Add the install command to public documentation
   once that PR is merged.

## Release publishing

After the Release workflow uploads a stable version tag's assets, it calls
`homebrew.yml`. The publishing job checks that the GitHub release is neither
draft nor prerelease, downloads its checksums, generates `Formula/polar.rb`, and
opens a version-specific pull request in the tap. Draft signing-verification
runs and prerelease tags do not update the tap. Missing configuration or invalid
checksums fail the job rather than publishing an incomplete formula.

Tap updates are reviewed and merged separately from creating a CLI release.
The CLI pull request checks test the generator and compiled updater guard, then
install/test/audit a formula generated from the latest stable release on macOS
and Linux. No publishing token is needed for these checks.
Run the following checks in the tap before merging:

```sh
brew install --build-from-source polarsource/tap/polar
brew test polarsource/tap/polar
brew audit --strict polarsource/tap/polar
brew style --formula polarsource/tap/polar
```

For an installed formula, use `brew reinstall --build-from-source` instead of
`brew install` when checking an update. Validate the supported macOS architectures
and Linux x64. The install step extracts a precompiled release executable; it
does not compile the CLI from source despite Homebrew's flag name.

To retry publishing an existing release after fixing configuration:

```sh
gh workflow run homebrew.yml --repo polarsource/cli -f tag=vX.Y.Z
```

The workflow serializes publishing jobs. Do not retry an older release after a
newer formula has been merged; closing an obsolete generated PR prevents a
downgrade. Re-running the same tag updates its existing PR, and creates no PR
if the formula already matches the tap's default branch.

To generate a formula locally for inspection:

```sh
gh release download vX.Y.Z --repo polarsource/cli --pattern checksums.txt --dir /tmp/polar-release
bun scripts/homebrew.ts vX.Y.Z /tmp/polar-release/checksums.txt /tmp/polar-formula/polar.rb
```

## Homebrew-managed updates

The CLI resolves its executable symlink and checks for Homebrew's
`INSTALL_RECEIPT.json` in the installed keg. For these installations,
`polar update` prints `brew upgrade polarsource/tap/polar` and returns before
fetching a release, replacing the binary, or clearing authentication. Background
GitHub update checks are skipped because the latest CLI release may not yet be
available in the tap. An existing cached notice also shows the brew command.

Standalone installations continue to use `polar update`.
