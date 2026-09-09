# @l2utils/l2patch

[![CI](https://github.com/l2utils/l2patch/actions/workflows/test.yml/badge.svg)](https://github.com/l2utils/l2patch/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)

Lineage 2 client patch inspection, version verification, CDN discovery, and file download utility. Available as both a CLI tool and an npm library export.

---

## Features

- 🌐 **Live CDN Discovery**: Dynamically queries the NCSoft updater daemon via TCP (port 27500) for the active CloudFront CDN host, eliminating static/stale URL configurations.
- 🔎 **Version Inspection**: Query and inspect latest client versions and manifest SHA-1 hashes directly from the updater daemon or HTTP endpoints.
- 📦 **Full File Downloads**: Download full `.zip` archives of specific client files (e.g. `system/itemname-e.dat`) for any version or automatically resolve `--latest`.
- 🔀 **Smart Delta Patching**: Download patch delta files between version A and version B with automatic detection of direct $N \to M$ patches vs. sequential incremental patch chains.
- 🗃️ **Entire Patch Updates**: Download consolidated archives or bulk download all modified files from `FileInfoMap` / `PatchFileInfo` manifests (with UTF-16LE decoding and concurrency limits).
- 🔒 **Security First**: Zero proprietary endpoints committed to source code. CDN host is queried dynamically or passed via parameters / environment files.
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

Because this repository is public, CDN URLs, updater endpoints, and game credentials are never hardcoded. Commands require configuration provided via CLI parameters or environment variables (e.g. in a `.env` file). If a required variable is undefined, the CLI will cleanly error out.

| Environment Variable | Description | Required By |
| :--- | :--- | :--- |
| `L2_PATCH_UPDATER_HOST` | NCSoft updater TCP server host. | `cdn`, `version` (TCP mode) |
| `L2_PATCH_UPDATER_PORT` | NCSoft updater TCP server port. | `cdn`, `version` (TCP mode) |
| `L2_PATCH_GAME_ID` | Game service identifier (e.g. `LINEAGE2`). | `cdn`, `version` (TCP mode), `manifest` |
| `L2_PATCH_CDN_HOST` | Hostname of the patch CDN (e.g. `d35293xeakkyq4.cloudfront.net`). | Derives `baseUrl` |
| `L2_PATCH_BASE_URL` | Base CDN URL where patch zips and deltas are served. | `download`, `manifest`, `download-version` |
| `L2_PATCH_VERSION` | Client patch version identifier. | Stored by `version --set-env` |
| `L2_PATCH_VERSION_URL` | *(Optional)* URL of the version check endpoint or JSON manifest. | `version` (HTTP mode) |
| `L2_PATCH_AUTH_TOKEN` | *(Optional)* Authorization bearer token or key for protected endpoints. | Any command |

---

## CLI Usage

### 1. Query Active CDN Host

Queries the updater server (Opcode `0x0003`) and outputs the raw CDN hostname:

```sh
# Raw CDN hostname output (no labels)
npx l2patch cdn

# Automatically persist retrieved CDN host and base URL into local .env
npx l2patch cdn --set-env

# JSON format
npx l2patch cdn --json

# Export to .env format
npx l2patch cdn --env
```

### 2. Check Current Version

Queries the latest patch version and outputs the raw version number:

```sh
# Raw version output (no labels)
npx l2patch version

# Automatically persist retrieved version into local .env
npx l2patch version --set-env

# JSON output
npx l2patch version --json
```

### 3. Download Manifest

Download `PatchFileInfo` or `FileInfoMap` catalog for a specific version or latest:

```sh
# Download PatchFileInfo manifest for version 599
npx l2patch manifest -v 599 --out-dir ./manifests

# Download FileInfoMap manifest for the latest version
npx l2patch manifest --type filemap --latest --out-dir ./manifests
```

### 4. Download Single File (Full Zip or Delta Patch)

```sh
# Download full zip for latest version
npx l2patch download system/itemname-e.dat --latest --out-dir ./downloads

# Download full zip for specific version
npx l2patch download system/itemname-e.dat -v 599 --out-dir ./downloads

# Download delta patch between version 598 and 599
npx l2patch download system/itemname-e.dat --patch --from 598 --to 599 --out-dir ./patches
```

### 5. Download Entire Patch Update (Full Zips or Delta Patches)

```sh
# Download all full file zips for the latest update
npx l2patch download-version --latest --concurrency 6 --out-dir ./client

# Download all delta patches from version 598 to 599
npx l2patch download-version --patch --from 598 --to 599 --concurrency 6 --out-dir ./patches
```

---

## Library Usage

```ts
import {
  queryCdnConfig,
  checkCurrentVersion,
  downloadFullZip,
  downloadPatch,
  downloadUpdate,
} from "@l2utils/l2patch";

// 1. Query active CDN
const cdn = await queryCdnConfig();
console.log(`CDN Host: ${cdn.cdnHost}, Base URL: ${cdn.baseUrl}`);

// 2. Check current version
const versionInfo = await checkCurrentVersion();
console.log(`Current version: ${versionInfo.version}`);

// 3. Download full file zip
const zipPath = await downloadFullZip("system/itemname-e.dat", {
  latest: true,
  outDir: "./downloads",
  config: { baseUrl: cdn.baseUrl },
});

// 4. Download delta patch
const patchResult = await downloadPatch("system/itemname-e.dat", {
  fromVersion: "598",
  toVersion: "599",
  outDir: "./patches",
  config: { baseUrl: cdn.baseUrl },
});
```

---

## License

BSD-3-Clause © [l2utils](https://github.com/l2utils)
