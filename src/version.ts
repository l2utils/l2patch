import * as net from "net";
import { requireVersionUrl, resolveConfig } from "./config";
import { PatchConfig, VersionInfo } from "./types";

/**
 * Queries the Lineage 2 updater server via its binary TCP protocol (Port 27500).
 */
export function queryUpdaterServer(
  host: string,
  port: number = 27500,
  gameId: string = "LINEAGE2",
  timeoutMs: number = 5000
): Promise<{ version: string; manifestHash: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout querying updater server at ${host}:${port}`));
    }, timeoutMs);

    const client = net.createConnection({ host, port }, () => {
      const gameBytes = Buffer.from(gameId, "ascii");
      const reqLen = 4 + 2 + gameBytes.length;
      const req = Buffer.from([
        reqLen & 0xff,
        (reqLen >> 8) & 0xff,
        0x06,
        0x00,
        0x0a,
        gameBytes.length,
        ...gameBytes,
      ]);
      client.write(req);
    });

    client.on("data", (data: Buffer) => {
      clearTimeout(timer);
      client.end();
      try {
        const payload = data.subarray(8);
        const tagIdx = payload.indexOf(0x20);
        if (tagIdx === -1) {
          throw new Error("Invalid response: missing version tag");
        }
        let byte = payload[tagIdx + 1];
        let version = byte & 0x7f;
        if (byte & 0x80) {
          version |= (payload[tagIdx + 2] & 0x7f) << 7;
        }

        const hashTagIdx = payload.indexOf(0x52);
        let manifestHash = "";
        if (hashTagIdx !== -1) {
          const hashLen = payload[hashTagIdx + 1];
          manifestHash = payload
            .subarray(hashTagIdx + 2, hashTagIdx + 2 + hashLen)
            .toString("utf-8");
        }

        resolve({ version: String(version), manifestHash });
      } catch (err) {
        reject(err);
      }
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Fetches and parses the current client patch version from the configured endpoint.
 * Supports querying the TCP updater daemon (port 27500) or HTTP JSON / manifest endpoints.
 */
export async function checkCurrentVersion(
  configOverrides?: PatchConfig
): Promise<VersionInfo> {
  const config = resolveConfig(configOverrides);

  // If TCP updater host is configured, attempt socket query first
  if (config.updaterHost) {
    try {
      const result = await queryUpdaterServer(
        config.updaterHost,
        config.updaterPort,
        config.gameId
      );
      return {
        version: result.version,
        manifestHash: result.manifestHash,
      };
    } catch (err) {
      if (!config.versionUrl) {
        throw err;
      }
      // Fallback to HTTP endpoint if TCP query fails and versionUrl is available
    }
  }

  const versionUrl = requireVersionUrl(config);

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "l2patch/1.0.0",
  };

  if (config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  }

  const response = await fetch(versionUrl, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to check version from ${versionUrl}: ${response.status} ${response.statusText}`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("application/json") || text.trim().startsWith("{")) {
    try {
      const data = JSON.parse(text);
      const parsedVersion = extractVersionFromJson(data);
      return {
        version: parsedVersion,
        timestamp: (data.timestamp as string) || (data.generatedAt as string) || undefined,
        raw: data,
      };
    } catch {
      // Fall through to plain text parsing if JSON parsing fails
    }
  }

  // Plain text or INI-style response
  const parsedVersion = extractVersionFromText(text);
  return {
    version: parsedVersion,
    raw: text,
  };
}

/**
 * Extracts a version identifier from a JSON object.
 */
export function extractVersionFromJson(data: unknown): string {
  if (typeof data === "string") {
    return data.trim();
  }
  if (typeof data === "number") {
    return String(data);
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidates = [
      "version",
      "patchVersion",
      "latestVersion",
      "currentVersion",
      "build",
      "buildNumber",
      "patch",
    ];
    for (const key of candidates) {
      if (typeof record[key] === "string" && record[key]) {
        return (record[key] as string).trim();
      }
      if (typeof record[key] === "number") {
        return String(record[key]);
      }
    }
  }
  throw new Error("Unable to locate a version identifier in the JSON response.");
}

/**
 * Extracts a version identifier from plain text or INI format.
 */
export function extractVersionFromText(text: string): string {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) {
      continue;
    }
    const match = trimmed.match(/^(?:version|build|patch)\s*=\s*(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  const firstNonEmpty = lines.map((l) => l.trim()).find((l) => l.length > 0);
  if (firstNonEmpty) {
    return firstNonEmpty;
  }
  throw new Error("Version response was empty.");
}
