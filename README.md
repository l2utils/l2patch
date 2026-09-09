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

Because this repository is public, CDN URLs and endpoints are never hardcoded. Commands that download files require CDN configuration provided either via:
1. **CLI Parameter**: `--base-url <url>` or `--cdn-host <host>`
2. **Environment Variable**: `L2_PATCH_BASE_URL` or `L2_PATCH_CDN_HOST` (e.g. in a `.env` file)
3. **Live Query**: Run `npx l2patch cdn --env >> .env` before running updates.

| Environment Variable | Description |
| :--- | :--- |
| `L2_PATCH_UPDATER_HOST` | NCSoft updater TCP server (default: `updater.nclauncher.ncsoft.com`). |
| `L2_PATCH_UPDATER_PORT` | NCSoft updater TCP port (default: `27500`). |
| `L2_PATCH_GAME_ID` | Game service identifier (default: `LINEAGE2`). |
| `L2_PATCH_BASE_URL` | Base CDN URL where patch zips and deltas are served. |
| `L2_PATCH_CDN_HOST` | Hostname of the patch CDN (e.g. `d35293xeakkyq4.cloudfront.net`). |
| `L2_PATCH_VERSION_URL` | *(Optional)* URL of the version check endpoint or JSON manifest. |
| `L2_PATCH_AUTH_TOKEN` | *(Optional)* Authorization bearer token or key for protected endpoints. |

---

## CLI Usage

### 1. Query Active CDN Host

Queries the updater server (Opcode `0x0003`) for the current live CDN hostname:

```sh
# Plain text
npx l2patch cdn

# JSON format
npx l2patch cdn --json

# Export to .env file directly
npx l2patch cdn --env >> .env
```

### 2. Check Current Version

```sh
# Plain text output
npx l2patch version

# JSON output
npx l2patch version --json
```

### 3. Download Full File Zip

```sh
# Download latest version of a file (using .env or --cdn-host)
npx l2patch download --latest system/itemname-e.dat --out-dir ./downloads

# Download specific version with explicit CDN host parameter
npx l2patch download system/itemname-e.dat --version 599 --cdn-host d35293xeakkyq4.cloudfront.net --out-dir ./downloads
```

### 4. Download Delta Patch

```sh
# Check and download patch from version 598 to 599
npx l2patch patch system/itemname-e.dat --from 598 --to 599 --out-dir ./patches
```

### 5. Download Entire Patch Update

```sh
# Download all full file zips for the latest update
npx l2patch update-download --latest --concurrency 6 --out-dir ./client

# Download all delta patches from version 598 to 599
npx l2patch update-patch --from 598 --to 599 --concurrency 6 --out-dir ./patches
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
