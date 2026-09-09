# @l2utils/l2patch

[![CI](https://github.com/l2utils/l2patch/actions/workflows/test.yml/badge.svg)](https://github.com/l2utils/l2patch/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)

Lineage 2 client patch inspection, version verification, and file download utility. Available as both a CLI tool and an npm library export.

---

## Features

- 🔎 **Version Inspection**: Query and inspect the latest client patch version from remote manifest or version endpoints.
- 📦 **Full File Downloads**: Download full `.zip` archives of specific client files (e.g. `system/itemname-e.dat`) for any version or automatically resolve `--latest`.
- 🔀 **Smart Delta Patching**: Download patch delta files between version A and version B with automatic detection of direct $N \to M$ patches vs. sequential incremental patch chains.
- 🔒 **Security First**: Zero proprietary endpoints or credentials committed to source code. All endpoints are configured via environment variables or GitHub Organization Secrets.
- 🛠️ **Dual Entrypoints**: CLI runner (`l2patch`) for npm scripts and pipelines, alongside a fully typed TypeScript programmatic API.

---

## Installation

```sh
# Local package dependency
npm install @l2utils/l2patch

# Global installation
npm install -g @l2utils/l2patch
```

---

## Configuration & Environment Variables

Because this repository is public, all proprietary CDN URLs and endpoints are configured dynamically:

| Environment Variable | Description |
| :--- | :--- |
| `L2_PATCH_BASE_URL` | Base CDN URL where patch zips and deltas are served. |
| `L2_PATCH_VERSION_URL` | URL of the version check endpoint or JSON manifest. Defaults to `${L2_PATCH_BASE_URL}/version.json`. |
| `L2_PATCH_AUTH_TOKEN` | *(Optional)* Authorization bearer token or key for protected endpoints. |
| `L2_PATCH_URL_TEMPLATE` | *(Optional)* Custom download URL template (default: `{baseUrl}/{version}/{filePath}.zip`). |
| `L2_PATCH_DELTA_TEMPLATE`| *(Optional)* Custom delta patch URL template (default: `{baseUrl}/patch/{fromVersion}_{toVersion}/{filePath}.patch`). |

Variables can be placed in a `.env` file or configured as **GitHub Organization Secrets** for CI/CD pipelines.

---

## CLI Usage

Use in `package.json` scripts or via terminal:

```json
{
  "scripts": {
    "fetch:itemname": "l2patch download --latest system/itemname-e.dat",
    "check-version": "l2patch version"
  }
}
```

### 1. Check Current Version

```sh
# Plain text output
npx l2patch version

# JSON output
npx l2patch version --json
```

### 2. Download Full File Zip

```sh
# Download latest version of a file
npx l2patch download --latest system/itemname-e.dat --out-dir ./downloads

# Download specific version
npx l2patch download system/itemname-e.dat --version 140 --out-dir ./downloads
```

### 3. Download Delta Patch

```sh
# Check and download patch from version 140 to 142
# Automatically detects if direct 140 -> 142 patch exists or downloads incremental steps
npx l2patch patch system/itemname-e.dat --from 140 --to 142 --out-dir ./patches
```

---

## Library Usage

```ts
import {
  checkCurrentVersion,
  downloadFullZip,
  downloadPatch,
} from "@l2utils/l2patch";

// 1. Check current version
const versionInfo = await checkCurrentVersion();
console.log(`Current version: ${versionInfo.version}`);

// 2. Download full file zip
const zipPath = await downloadFullZip("system/itemname-e.dat", {
  latest: true,
  outDir: "./downloads",
});

// 3. Download patch (direct or incremental)
const patchResult = await downloadPatch("system/itemname-e.dat", {
  fromVersion: "140",
  toVersion: "142",
  outDir: "./patches",
});

console.log(`Strategy: ${patchResult.strategy}`);
console.log(`Files:`, patchResult.downloadedFiles);
```

---

## License

BSD-3-Clause © [l2utils](https://github.com/l2utils)
