# Updater Network Protocol Specification (`updater.nclauncher.ncsoft.com`)

## Overview

The Lineage 2 Purple launcher coordinates game configuration, patch discovery, CDN routing, and client execution parameters through a dedicated TCP updater server.

* **Endpoint**: `updater.nclauncher.ncsoft.com` (IP: `44.199.154.246`)
* **Port**: `27500` (TCP)
* **Authentication**: None required (open query service)
* **Framing**: Binary header framing Google Protocol Buffers messages

The updater service is purely a **metadata, routing, and trigger authority**. It does not host or transfer game assets; all asset downloads are offloaded to CloudFront.

---

## 1. Packet Framing

All messages over TCP port `27500` adhere to a fixed binary header structure.

### 1.1 Request (Client -> Server)

| Field | Type | Size | Description |
| :--- | :--- | :--- | :--- |
| **`Length`** | `uint16_le` | 2 bytes | Total length of the packet in bytes including the 4-byte header (`payload.length + 4`). |
| **`Opcode`** | `uint16_le` | 2 bytes | Operation code identifier. |
| **`Payload`** | `bytes` | `N` bytes | Protobuf-encoded payload. |

For standard queries, the payload consists of protobuf field 1 containing the game ID string `"LINEAGE2"`:
* Hex: `0a 08 4c 49 4e 45 41 47 45 32`
  * `0a`: Tag 1, wire type 2 (length-delimited)
  * `08`: String length (8 bytes)
  * `4c 49 4e 45 41 47 45 32`: ASCII `"LINEAGE2"`

**Complete 14-Byte Query Packet Example (Opcode 0x0006)**:
```text
0e 00 06 00 0a 08 4c 49 4e 45 41 47 45 32
|---| |---| |-----------------------------|
Len=14 Op=6   Protobuf: field 1 = "LINEAGE2"
```

### 1.2 Response (Server -> Client)

| Field | Type | Size | Description |
| :--- | :--- | :--- | :--- |
| **`Length`** | `uint16_le` | 2 bytes | Total length of the response packet in bytes including the 8-byte header. |
| **`Opcode`** | `uint16_le` | 2 bytes | Echoes the request opcode. |
| **`Status`** | `uint32_le` | 4 bytes | Execution status code (`0` = Success). |
| **`Payload`** | `bytes` | `N` bytes | Protobuf-encoded response data. |

---

## 2. Opcode Catalog

Live network packet captures during game updates and file checks reveal 8 active opcodes supported by `updater.nclauncher.ncsoft.com`:

| Opcode | Name | Purpose | Response Payload Summary |
| :--- | :--- | :--- | :--- |
| **`0x0006`** | `GetVersionInfo` | Queries current latest client version & manifest hash | Version number (`varint`), Manifest SHA-1 hash (`string`) |
| **`0x0007`** | `GetVersionInfoSecondary` | Secondary branch / patch verification check | Version number (`varint`), Manifest SHA-1 hash (`string`) |
| **`0x0003`** | `GetCdnConfig` | Queries active CDN hostname for file downloads | CDN domain string (e.g. `d35293xeakkyq4.cloudfront.net`) |
| **`0x0002`** | `GetServerInfo` | Queries game server endpoint and launch executable | Server IP (`52.201.101.83`), binary path (`System\L2.bin`) |
| **`0x0005`** | `GetLauncherInfo` | Queries official installer and launcher URLs | MSI installer URL, PlayNC and Steam web launcher links |
| **`0x0008`** | `GetClientConfig` | Queries client maintenance and cleanup XML rules | Cligate server, GameGuard cleanup targets, architecture |
| **`0x0009`** | `GameLevelUpdate` | Queries in-game progressive streaming configuration | XML payload for background streaming (currently `use="off"`) |
| **`0x0004`** | `GetStatus` | Service readiness & maintenance gate | Status flag (`1` = Online/Playable, `0` = Under Maintenance) |

---

## 3. Opcode Message Details & Protobuf Payloads

### 3.1 Opcode `0x0006` (`GetVersionInfo`)

The primary entrypoint for checking updates. Returns the latest live client version number and the SHA-1 hash of its file manifest catalog.

#### Request
```text
0e 00 06 00 0a 08 4c 49 4e 45 41 47 45 32
```

#### Response Fields
* **Tag 1 (`0x0a`, string)**: Service identifier (`"LINEAGE2"`).
* **Tag 4 (`0x20`, varint)**: Latest client version number (e.g. `599` encoded as `20 d7 04`).
* **Tag 10 (`0x52`, string)**: 40-character SHA-1 checksum of `FileInfoMap_LINEAGE2_<version>.dat`.

#### Wire Example
```text
4d 00 06 00 00 00 00 00
0a 08 4c 49 4e 45 41 47 45 32 10 00 18 01
20 d7 04                                    <-- Tag 4: Version 599
28 00 30 00 38 01 40 04 48 01
52 28 32 65 35 30 39 31 65 64 64 37 31 32 66 64 62 33 36 35 35 37 66 63 63 66 39 66 39 33 65 34 31 35 34 30 38 64 66 39 62 30
                                            <-- Tag 10: "2e5091edd712fdb36557fccf9f93e415408df9b0"
```

---

### 3.2 Opcode `0x0003` (`GetCdnConfig`)

Enables dynamic CDN host resolution, allowing NCSoft to migrate or rotate CDN providers without patching the launcher binary.

#### Response Fields
* **Tag 1 (`0x0a`, string)**: Service identifier (`"LINEAGE2"`).
* **Tag 2 (`0x12`, string)**: Hostname of the patch CDN.

#### Wire Example
```text
33 00 03 00 00 00 00 00
0a 08 4c 49 4e 45 41 47 45 32
12 1d 64 33 35 32 39 33 78 65 61 6b 6b 79 71 34 2e 63 6c 6f 75 64 66 72 6f 6e 74 2e 6e 65 74 1a 00
      ^-- "d35293xeakkyq4.cloudfront.net" (29 bytes)
```

---

### 3.3 Opcode `0x0002` (`GetServerInfo`)

Provides the target game server gateway and launch binary path used when the user clicks "Play".

#### Response Fields
* **Tag 1 (`0x0a`, string)**: Service identifier (`"LINEAGE2"`).
* **Tag 2 (`0x12`, string)**: Server IP config (`"ip=52.201.101.83"`).
* **Tag 3 (`0x1a`, string)**: Game executable path (`"System\L2.bin"`).
* **Tag 4 (`0x22`, string)**: Service label (`"LINEAGE2"`).
* **Tag 6 (`0x32`, string)**: Updater server host (`"updater.nclauncher.ncsoft.com"`).

#### Wire Example
```text
6a 00 02 00 00 00 00 00
0a 08 4c 49 4e 45 41 47 45 32
12 10 69 70 3d 35 32 2e 32 30 31 2e 31 30 31 2e 38 33
1a 0d 53 79 73 74 65 6d 5c 4c 32 2e 62 69 6e
22 08 4c 49 4e 45 41 47 45 32 28 06
32 1d 75 70 64 61 74 65 72 2e 6e 63 6c 61 75 6e 63 68 65 72 2e 6e 63 73 6f 66 74 2e 63 6f 6d
```

---

### 3.4 Opcode `0x0005` (`GetLauncherInfo`)

Returns web launcher URLs and the download link for the full standalone MSI installer.

#### Response Fields
* **Tag 1 (`0x0a`, string)**: `"LINEAGE2"`
* **Tag 4 (`0x22`, string)**: XML payload specifying web launcher pages:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <post_page_url>
    <plaync>http://web-launcher.ncsoft.com/lineage2/en/installed_hq.php</plaync>
    <steam>http://web-launcher.ncsoft.com/lineage2/en/steam.php</steam>
  </post_page_url>
  ```
* **Tag 5 (`0x2a`, string)**: Direct MSI installer URL:
  `http://d35293xeakkyq4.cloudfront.net/LINEAGE2/installer/purple/LINEAGE2_installer.msi`
* **Tag 7 (`0x3a`, string)**: Installer build timestamp / version identifier (e.g. `"23713238783"`).

---

### 3.5 Opcode `0x0008` (`GetClientConfig`)

Returns client execution parameters, cleanup targets (deprecated files to remove on update), and authentication gateway settings.

#### Response XML Payload
```xml
<?xml version="1.0" encoding="UTF-8"?>
<cligate_server ip="cli.g.nc.com" port="6600" programid="2800" appid="62A189A0-F85C-33E1-503D-7A99044D4BEF" />
<login_enable use="on" />
<check_before_run use="off" />
<hotfix version="0" />
<cleanup_target>
  <folders>system\GameGuard</folders>
  <files>system\GameGuard.des;system\Lineage2US.ini</files>
</cleanup_target>
<installer_args><![CDATA[INSTALLFOLDER="{{location}}"]]></installer_args>
<install_file>LINEAGE2_installer.msi</install_file>
<game_32bit_execution use="on" />
<game_64bit_execution use="off" />
```

---

### 3.6 Opcode `0x0009` (`GameLevelUpdate`)

Configures progressive / streaming updates during live gameplay (disabled in current retail versions).

#### Response XML Payload
```xml
<?xml version="1.0" encoding="UTF-8"?>
<game_level_update use="off" total="0" format="-litestep:%d">
</game_level_update>
```

---

### 3.7 Opcode `0x0004` (`GetStatus` — Service Readiness & Maintenance Gate)

Opcode `0x0004` acts as the **service availability and maintenance gatekeeper** for the launcher. In the official Purple update cycle, it is invariably invoked as the final check after version discovery (`0x0006`), CDN configuration (`0x0003`), server discovery (`0x0002`), and cleanup rules (`0x0008`).

#### Response Wire Format
```text
14 00 04 00 00 00 00 00 0a 08 4c 49 4e 45 41 47 45 32 10 01
|---------| |---------| |-----------------------------| |---|
Len=20 Op=4  Status=0    Tag 1: "LINEAGE2"              Tag 2: 1 (Online)
```

#### Maintenance Gate Behavior
* **Tag 2 = `1` (`0x10 0x01` — Online / Ready)**: Game services are fully operational. The launcher enables the "Update" and "Play" buttons and allows launching `System\L2.bin`.
* **Tag 2 = `0` (or non-zero execution status — Under Maintenance)**: Maintenance mode is active (e.g., during scheduled Tuesday maintenance windows or emergency downtime). The launcher:
  * Disables and greys out the "Update" and "Play" buttons.
  * Displays the in-launcher maintenance notification banner.
  * Blocks client execution to prevent players from connecting to servers undergoing database migrations or code updates.

#### Stateful Session Handshake Requirement
Live wire testing reveals that **Opcode `0x0004` cannot be queried in isolation on a blank TCP connection**:
* If sent on a newly established TCP socket without preceding queries, the server will silently drop the request or timeout.
* It **strictly requires an active session context**, responding only when called on the **same persistent TCP socket following Opcode `0x0006` (`GetVersionInfo`)**.
* It represents an end-of-handshake session commit confirming that the client has negotiated the current version and is cleared to proceed.

---

## 4. Querying the Protocol in TypeScript

```typescript
import net from 'node:net';

interface VersionInfo {
  version: number;
  sha1: string;
}

export async function queryVersionInfo(
  host = 'updater.nclauncher.ncsoft.com',
  port = 27500,
  gameId = 'LINEAGE2'
): Promise<VersionInfo> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      // Build request: 4-byte header + protobuf Tag 1 string
      const gameBytes = Buffer.from(gameId, 'ascii');
      const payload = Buffer.concat([Buffer.from([0x0a, gameBytes.length]), gameBytes]);
      const header = Buffer.alloc(4);
      header.writeUInt16LE(payload.length + 4, 0);
      header.writeUInt16LE(0x0006, 2); // Opcode 0x0006

      socket.write(Buffer.concat([header, payload]));
    });

    let responseBuffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
    });

    socket.on('close', () => {
      if (responseBuffer.length < 8) {
        return reject(new Error('Incomplete response from updater server'));
      }

      const payload = responseBuffer.subarray(8);

      // Extract version (Protobuf Tag 4: 0x20 varint)
      let version = 0;
      const tag4Idx = payload.indexOf(0x20);
      if (tag4Idx !== -1) {
        let shift = 0;
        let i = tag4Idx + 1;
        while (i < payload.length) {
          const b = payload[i++];
          version |= (b & 0x7f) << shift;
          if (!(b & 0x80)) break;
          shift += 7;
        }
      }

      // Extract SHA-1 hash (Protobuf Tag 10: 0x52 length-delimited string)
      let sha1 = '';
      const tag10Idx = payload.indexOf(0x52);
      if (tag10Idx !== -1) {
        const strLen = payload[tag10Idx + 1];
        sha1 = payload.subarray(tag10Idx + 2, tag10Idx + 2 + strLen).toString('ascii');
      }

      resolve({ version, sha1 });
    });

    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timed out'));
    });
  });
}
```
