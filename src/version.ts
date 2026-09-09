import { requireVersionUrl, resolveConfig } from "./config";
import { PatchConfig, VersionInfo } from "./types";

/**
 * Fetches and parses the current client patch version from the configured endpoint.
 */
export async function checkCurrentVersion(
  configOverrides?: PatchConfig
): Promise<VersionInfo> {
  const config = resolveConfig(configOverrides);
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
