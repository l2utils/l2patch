# Manifest Formats Specification (`FileInfoMap` & `PatchFileInfo`)

## Overview

Lineage 2 patch distribution and integrity verification rely on two complementary manifest files hosted on CloudFront:

1. **`FileInfoMap_LINEAGE2_<version>.dat`**: **The Target Disk State Catalog**. Describes every installed file as it must exist uncompressed on the user's hard drive.
2. **`PatchFileInfo_LINEAGE2_<version>.dat`**: **The CDN Delivery Index**. Describes all downloadable archives, including standalone full zip files, multi-part split zips, and binary delta patches.

Both files are located under:
```text
http://<cdn_host>/LINEAGE2/<version>/Patch/
```

---

## 1. Encoding & Physical File Structure

Both manifest files share identical physical formatting:

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Character Encoding** | **UTF-16 Little Endian (`UTF-16LE`)** | 2 bytes per character; English ASCII characters have an alternating `0x00` null byte. |
| **Byte Order Mark (BOM)** | **`0xFF 0xFE`** (2 bytes) | Must be parsed and stripped (`\uFEFF`) before line splitting. |
| **Line Delimiter** | **CRLF (`\r\n` / `0x0D 0x00 0x0A 0x00`)** | Standard Windows line endings. |
| **Field Separator** | **Colon (`:`)** | Colons delimit metadata fields. |

> [!WARNING]
> Because the file is encoded in UTF-16LE, opening the raw file in ASCII/UTF-8 parsers or redirecting stdout with tools that normalize byte boundaries can cause **1-byte misalignment**, rendering the text into Chinese glyphs (`䇾渀椀洀愀琀椀漀渀猀`) or gibberish line beginnings (`﹁nimations`). Always decode using an explicit `utf16le` / `utf-16` codec.

---

## 2. FileInfoMap Specification (`FileInfoMap_LINEAGE2_<version>.dat`)

### 2.1 Purpose & Role
`FileInfoMap` is the authoritative manifest of the Lineage 2 game client. It defines the exact state of a clean, fully updated installation.

The official launcher and `l2patch` use this file to:
* **Verify Client Integrity**: Hash local disk files and compare them to expected SHA-1 hashes (offline file check).
* **Detect Modified / Missing Files**: Identify which files need to be repaired or redownloaded.
* **Track Patch Changes**: Compare two versions' `FileInfoMap` manifests to identify newly added, removed, or updated files.

### 2.2 Record Schema
Every line follows this 4-field colon-delimited structure:

```text
<relative_path>:<uncompressed_size_bytes>:<sha1_hash>:<flag>
```

| Field Index | Name | Type | Description |
| :--- | :--- | :--- | :--- |
| 0 | `relative_path` | `string` | File path relative to the game installation directory (e.g. `system\ItemName_Classic-e.dat`). |
| 1 | `uncompressed_size_bytes` | `integer` | Exact uncompressed file size in bytes when written to disk. |
| 2 | `sha1_hash` | `hex string` | 40-character lowercase hexadecimal SHA-1 checksum of the uncompressed file. |
| 3 | `flag` | `integer` | File attribute / install flag (`0` for standard client assets). |

### 2.3 Sample Entries
```text
Animations\BG_EffectMeshes.ukx:44813800:1e67fe5c0e447f09cd9d7b5af9046a077d83ef0c:0
Animations\branch.ukx:138899018:7b05dbbdd3cb689d9e55132bd0aee8c6c4bc1a0a:0
SysTextures\Icon.utx:41065126:4a081a25d2d488ad5a54cf8e514032d84784a0d9:0
system\item_baseinfo_ClassicAden.dat:1260389:b3614278ad29fc12d19fecff02f04e460492cb2c:0
system\ItemName_Classic-e.dat:3587661:6d42ea04f5e712a4d3393b4a2bf172771bbd7bf3:0
system\Skillgrp.dat:11894921:e894c0420786cfba4b0a4bc60d62aaeb0cfd0cf1:0
```

### 2.4 Inventory Coverage
`FileInfoMap_LINEAGE2_599.dat` lists **4,093 files**, encompassing 100% of the distributed client:

* **Game Data (`system/`)**: All 485 `.dat` data tables, binary shaders, and default configurations.
* **Visuals & 3D Models**:
  * `Animations/` (`.ukx` skeletal character and NPC animations).
  * `StaticMeshes/` (`.usx` weapon and building geometry).
  * `SysTextures/` and `Textures/` (`.utx` texture packages, icon pools, UI skins).
* **Audio**: `Sounds/` and `Music/` (`.ogg` background tracks and sound effects).
* **World Map**: `Maps/` (`.unr` map sectors) and radar tiles.
* **Engine Binaries**: Core DLLs, runtime libraries, and launcher executables.

*(Note: Transient files created during gameplay — such as screenshots, local chat filter logs, crash dumps, and GPU shader caches — are intentionally omitted from `FileInfoMap`).*

---

## 3. PatchFileInfo Specification (`PatchFileInfo_LINEAGE2_<version>.dat`)

### 3.1 Purpose & Role
While `FileInfoMap` specifies what files look like **uncompressed on disk**, `PatchFileInfo` is the **CDN download index**. It specifies how assets are physically packaged, compressed, and retrieved from CloudFront.

### 3.2 Record Schema
Every line follows this 4-field colon-delimited structure:

```text
<archive_path>:<compressed_size_bytes>:<sha1_hash>:<flag>
```

| Field Index | Name | Type | Description |
| :--- | :--- | :--- | :--- |
| 0 | `archive_path` | `string` | Relative path to the archive file on the CDN. |
| 1 | `compressed_size_bytes` | `integer` | Download payload size in bytes (compressed archive size). |
| 2 | `sha1_hash` | `hex string` | 40-character lowercase hexadecimal SHA-1 checksum of the compressed archive. |
| 3 | `flag` | `integer` | Packaging type: `1` = Full Zip, `3` = Delta Patch, `0` = Manifest metadata. |

### 3.3 Archive Types in `PatchFileInfo`

In version 599, `PatchFileInfo` contains **4,737 total entries** divided into four distinct categories:

#### 1. Standalone Full Zips (`Zip\<path>.zip`, Flag `1`)
Clean, standard Deflate zip archives containing a single client file. Downloading and extracting this archive yields the exact uncompressed file without requiring any prior game version.
```text
Zip\system\ItemName_Classic-e.dat.zip:469599:21045763266b6c032aaec43194871d37b12d53bf:1
Zip\SysTextures\Icon.utx.zip:39169600:7ffc2bfa3224b787593c66cf9b71e16fdf396b27:1
```
* **CDN URL**: `http://<cdn_host>/LINEAGE2/<version>/Patch/Zip/<path>.zip`
* **Count**: 3,894 files

#### 2. Multi-Part Split Zips (`Zip\<path>.z01`, `.z02`, `...zip`, Flag `1`)
For large files exceeding ~50 MB (such as large animation packages), NCSoft splits the zip container across multiple chunks:
```text
Zip\Animations\branch.ukx.z01:52428800:d6fc78f84aa5905d4b79b5c3dfbcf3a18a99d45e:1
Zip\Animations\branch.ukx.z02:52428800:1c6bb52fe4c3dcf7ec9dcfad72836261f9d50592:1
Zip\Animations\branch.ukx.zip:6886481:21fc35728a39b369c73b0698ba67d9cbbd3ef7f0:1
```
* **Count**: 595 split parts

#### 3. Delta Patches (`<previous_version>\<path>.dlt.zip`, Flag `3`)
Differential patch packages for files that were modified between the previous version and the current version.
```text
598\Animations\branch.ukx.dlt.zip:364381:c697d7501a91dcc6801e73dda2e4ed9225abd1eb:3
598\system\ItemName_Classic-e.dat.dlt.zip:14812:d314817a581451f28b497b7cb1375d04df1eb1a4:3
```
* **Format**: Raw **LZMA stream** (`5D 00 00 ...`) compressing an **RFC 3284 VCDIFF** binary delta (`0xD6 0xC3 0xC4 0x00`).
* **Prerequisite**: Requires the bit-exact uncompressed file from the previous version.
* **Count**: 240 delta packages in v599

#### 4. Manifest Self-Reference Entries (Flag `0`)
`PatchFileInfo` explicitly records its sibling `FileInfoMap` manifest file:
```text
FileInfoMap_LINEAGE2_599.dat:644480:2e5091edd712fdb36557fccf9f93e415408df9b0:0
FileInfoMap_LINEAGE2_599.dat.zip:128586:47a705760682ed33d1a31a29006b67e8a67cd628:0
```
This allows clients to verify the uncompressed byte size and SHA-1 checksum of `FileInfoMap` itself.

---

## 4. Historical Version Chaining

Because delta patches are prefixed with the previous version number (e.g. `598\system\...`), `PatchFileInfo` acts as a **backwards-linked list**:

```text
v599 PatchFileInfo references  ──▶  "598\..."
v598 PatchFileInfo references  ──▶  "597\..."
v597 PatchFileInfo references  ──▶  "596\..."
v596 PatchFileInfo references  ──▶  "595\..."
```

By following these references, a client can traverse the entire historical lineage of patches back to the earliest preserved version (`v372`, October 2022).

---

## 5. Summary Comparison

| Metric | `FileInfoMap` | `PatchFileInfo` |
| :--- | :--- | :--- |
| **Focus** | Local disk state | Remote CDN delivery |
| **Total Entries** | **4,093** | **4,737** |
| **Size Field** | Uncompressed file size | Download / compressed size |
| **SHA-1 Field** | Checksum of uncompressed file | Checksum of downloaded archive |
| **Primary Use** | File verification & integrity check | Download planning & delta patching |
| **Direct Download URL** | `/LINEAGE2/<v>/Patch/FileInfoMap_LINEAGE2_<v>.dat` | `/LINEAGE2/<v>/Patch/PatchFileInfo_LINEAGE2_<v>.dat` |
