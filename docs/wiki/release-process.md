---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: shipped
---

# Release Process

How a new version of `dendrite-wiki-mcp` gets to the npm registry. This page documents the operator-facing flow; for the strategic build sequencing see [Release Readiness Roadmap](./release-readiness-roadmap.md).

The release runs through a manually-triggered GitHub Actions workflow ([.github/workflows/publish-package.yml](../../.github/workflows/publish-package.yml)) so a human always presses the button. No auto-publish on tag push. Root package publishes run `prepack`, which validates first, injects publish-time telemetry defaults from Actions secrets just before packing, and resets the source file in `postpack`.

## One-Time Setup (Operator)

Before the first GitHub Actions release ever runs, the operator must wire up an npm token so the workflow can authenticate.

### 1. Generate a granular access token on npm

1. Open `https://www.npmjs.com/settings/<your-username>/tokens` (logged in)
2. Click **Generate New Token** → **Granular Access Token**
3. Name: `dendrite-wiki-mcp-publish` (or similar)
4. Permissions: **Read and write**
5. Check **Bypass two-factor authentication** so the workflow doesn't prompt for an OTP it can't answer
6. Packages: select `dendrite-wiki-mcp`, `@rarusoft/dendrite-memory`, and `@rarusoft/dendrite-wiki` (or `*` for any package this account publishes)
7. Set an expiration (1 year is reasonable; calendar a renewal)
8. Click **Generate** and copy the token (it starts with `npm_…`). The token is shown once — copy it before closing the page

### 2. Add the token as a GitHub repo secret

1. Open `https://github.com/<owner>/dendrite-wiki-mcp/settings/secrets/actions`
2. Click **New repository secret**
3. Name: `NPM_TOKEN` (exact spelling — the workflow reads this name)
4. Value: paste the token from step 1
5. Click **Add secret**

The secret is now available to GitHub Actions workflows running on this repo. It is never visible in logs or to anyone without admin access to the repo.

## Per-Release Workflow

Every release follows the same pattern.

### 1. Bump the version

Edit the selected package manifest:

```diff
- "version": "0.1.0-alpha.1",
+ "version": "0.1.0-alpha.2",
```

Use semantic versioning. Pre-release suffixes (`-alpha.N`, `-beta.N`, `-rc.N`) signal the dist-tag the release should land under.

### 2. Date-stamp the CHANGELOG

Convert the `## [Unreleased]` section heading to `## [<version>] — <YYYY-MM-DD>` and add a blank `## [Unreleased]` block above it for future entries.

### 3. Run the full check locally

```bash
npm run check
```

This runs TypeScript build, tests, and docs build without refreshing generated wiki artifacts. All three must pass before the release commit lands. Run `npm run check:generated` only when the release intentionally includes regenerated wiki/API artifacts. The workflow re-runs `check` via `prepack`, but catching failures locally is faster than waiting for the workflow to fail mid-publish.

### 4. Commit, tag, push

```bash
git add package.json CHANGELOG.md
git commit -m "Cut v<version>: <one-line summary>"
git tag -a v<version> -m "v<version>

<release notes body — copy the relevant CHANGELOG section>"
git push
git push --tags
```

### 5. Trigger the workflow

1. Open the **Actions** tab on GitHub
2. Select **Publish to npm** in the left sidebar
3. Click **Run workflow** in the top-right
4. Pick the package (`root`, `memory`, or `wiki`) and dist-tag (`alpha`, `beta`, `latest`)
5. **First run after any workflow edit**: set `dry_run` to `true` to verify the tarball contents without publishing
6. Click **Run workflow**
7. Watch the run — the **Verify package contents** step prints the tarball file list; eyeball it for surprises
8. Re-run with `dry_run` set to `false` to actually publish

For a package-split release, publish in dependency order: `memory`, then `wiki`, then `root`. The root package depends on the two workspace packages at their published alpha versions, so publishing root first will produce an installable tarball only after the workspace packages exist on the registry.

### 6. Verify the release

Check the registry:

```bash
npm view dendrite-wiki-mcp@<dist-tag> version
# should print the version you just published

npm view @rarusoft/dendrite-memory@<dist-tag> version
npm view @rarusoft/dendrite-wiki@<dist-tag> version
# for extracted workspace releases

npm install --save-dev dendrite-wiki-mcp@<dist-tag>
# should install the new version into a test project
```

### 7. Optional: GitHub Release notes

Tag-only releases work fine for npm distribution. If you want a public Release page on GitHub with formatted notes:

1. Open `https://github.com/<owner>/dendrite-wiki-mcp/releases/new`
2. Pick the tag you just pushed
3. Title: `v<version>`
4. Body: paste the relevant CHANGELOG section
5. **Set as a pre-release** for any version with a `-alpha.N` / `-beta.N` / `-rc.N` suffix
6. Publish

## Dist-Tag Conventions

| Tag | Meaning | Install command |
|---|---|---|
| `alpha` | Public alpha — rough edges expected, breaking changes possible | `npm install dendrite-wiki-mcp@alpha` |
| `beta` | Feature-complete pre-release, API mostly stable | `npm install dendrite-wiki-mcp@beta` |
| `latest` | Default — what `npm install dendrite-wiki-mcp` (no tag) gets. Reserve for stable releases. | `npm install dendrite-wiki-mcp` |

Until 1.0, the `latest` tag should NOT be set on any release — keep alpha and beta isolated so plain `npm install dendrite-wiki-mcp` errors with "no matching version" rather than installing pre-release software unexpectedly.

## Token Renewal

The npm granular token has an expiration. Set a calendar reminder for ~30 days before expiry:

1. Generate a fresh token following the One-Time Setup steps above
2. Update the `NPM_TOKEN` repo secret with the new value
3. Revoke the old token at `https://www.npmjs.com/settings/<your-username>/tokens`

## Troubleshooting

**Workflow fails at `npm publish` with 403 ENEEDAUTH:** The `NPM_TOKEN` secret is missing or expired, or its granular package allowlist does not include the selected package. Re-check the repo secret at GitHub Settings → Secrets → Actions and the token's package permissions on npm.

**Workflow fails with 403 "Two-factor authentication required":** The token wasn't created with the **Bypass two-factor authentication** option. Generate a new token with that option enabled.

**Workflow fails at `npm ci`:** `package-lock.json` is out of sync with `package.json`. Run `npm install` locally and commit the updated lock file.

**Verify step shows "could not confirm" but publish step succeeded:** CDN propagation lag — the registry reports the new version through `npm view` 30-60 seconds after publish. Check `https://www.npmjs.com/package/dendrite-wiki-mcp` directly.

## Claims

- [current] Releases publish to the public npm registry under dist-tags (`alpha` for current pre-release, `beta` and `latest` reserved for later) via a manually-triggered GitHub Actions workflow that authenticates with a granular access token stored as the `NPM_TOKEN` repo secret. The workflow can publish the root umbrella package or either extracted workspace package (`@rarusoft/dendrite-memory`, `@rarusoft/dendrite-wiki`) through its package selector. Sources: file:.github/workflows/publish-package.yml, [Release Readiness Roadmap](./release-readiness-roadmap.md)
