---
lifecycle: generated
source-coverage: api-reference
source-file: src/install.ts
---

# `src/install.ts`

Workspace installer — `dendrite-wiki init`.

Sets up Dendrite Wiki MCP inside a target project: writes the right MCP client config
for the operator's IDE (Claude Code, Cursor, Codex, Continue, Windsurf, Antigravity,
Copilot in VS Code), seeds a starter wiki under `docs/`, drops agent-guidance files
(`AGENTS.md`, `.github/copilot-instructions.md`, etc.) explaining the workflow, and
registers the PostToolUse / PreToolUse hooks that drive raw-observation capture and
skill matching.

Three install modes select where the MCP client should call from:
  - `package` (default): clients run `npx -y dendrite-wiki-mcp` from the npm registry.
  - `dev`: clients run `npm run dev` against the workspace (used while developing this repo).
  - `built`: clients run `node dist/src/index.js` from the workspace's compiled output.

The `--ide` flag is the friendlier surface; legacy `--profile` accepts the same set.
Idempotent — re-running `init` updates only files whose content changed.

## Exports

- [`DendriteInstallMode`](#dendriteinstallmode) — type alias
- [`DendriteInstallProfile`](#dendriteinstallprofile) — type alias
- [`DendriteInstallOptions`](#dendriteinstalloptions) — interface
- [`DendriteInstallResult`](#dendriteinstallresult) — interface
- [`installDendriteWorkspace`](#installdendriteworkspace) — function

---

### `DendriteInstallMode`

**Kind:** type alias · **Source:** [src/install.ts:24](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/install.ts#L24)

```ts
type DendriteInstallMode = 'package' | 'dev' | 'built'
```

---

### `DendriteInstallProfile`

**Kind:** type alias · **Source:** [src/install.ts:25](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/install.ts#L25)

```ts
type DendriteInstallProfile = 'all' | 'claude' | 'copilot-vscode' | 'cursor' | 'codex' | 'continue' | 'windsurf' | 'antigravity'
```

---

### `DendriteInstallOptions`

**Kind:** interface · **Source:** [src/install.ts:35](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/install.ts#L35)

```ts
interface DendriteInstallOptions {
    root?: string;
    mode?: DendriteInstallMode;
    profile?: DendriteInstallProfile;
    userHomeDir?: string;
    packageName?: string;
    serverName?: string;
}
```

---

### `DendriteInstallResult`

**Kind:** interface · **Source:** [src/install.ts:44](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/install.ts#L44)

```ts
interface DendriteInstallResult {
    root: string;
    mode: DendriteInstallMode;
    profile: DendriteInstallProfile;
    written: string[];
    unchanged: string[];
}
```

---

### `installDendriteWorkspace`

**Kind:** function · **Source:** [src/install.ts:55](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/install.ts#L55)

```ts
function installDendriteWorkspace(options: DendriteInstallOptions): Promise<DendriteInstallResult>
```
