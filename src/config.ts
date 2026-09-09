import * as fs from "fs";
import * as path from "path";
import { PatchConfig } from "./types";

/**
 * Loads simple KEY=VALUE pairs from a .env file if it exists.
 * Does not overwrite existing process.env values.
 */
export function loadDotEnv(envPath?: string): void {
  const targetPath = envPath || path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    const content = fs.readFileSync(targetPath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Ignore dotenv read errors silently
  }
}

/**
 * Resolves the effective patch configuration from options, environment variables,
 * and .env files.
 */
export function resolveConfig(overrides?: PatchConfig): PatchConfig {
  loadDotEnv();

  const baseUrl =
    overrides?.baseUrl ||
    process.env.L2_PATCH_BASE_URL ||
    undefined;

  const versionUrl =
    overrides?.versionUrl ||
    process.env.L2_PATCH_VERSION_URL ||
    (baseUrl ? `${baseUrl.replace(/\/+$/, "")}/version.json` : undefined);

  const authToken =
    overrides?.authToken ||
    process.env.L2_PATCH_AUTH_TOKEN ||
    undefined;

  const urlTemplate =
    overrides?.urlTemplate ||
    process.env.L2_PATCH_URL_TEMPLATE ||
    "{baseUrl}/{version}/{filePath}.zip";

  const patchUrlTemplate =
    overrides?.patchUrlTemplate ||
    process.env.L2_PATCH_DELTA_TEMPLATE ||
    "{baseUrl}/patch/{fromVersion}_{toVersion}/{filePath}.patch";

  const updateArchiveTemplate =
    overrides?.updateArchiveTemplate ||
    process.env.L2_PATCH_UPDATE_ARCHIVE_TEMPLATE ||
    "{baseUrl}/archives/update_{version}.zip";

  const patchArchiveTemplate =
    overrides?.patchArchiveTemplate ||
    process.env.L2_PATCH_PATCH_ARCHIVE_TEMPLATE ||
    "{baseUrl}/archives/patch_{fromVersion}_to_{toVersion}.zip";

  const manifestUrlTemplate =
    overrides?.manifestUrlTemplate ||
    process.env.L2_PATCH_MANIFEST_URL_TEMPLATE ||
    "{baseUrl}/{version}/manifest.json";

  return {
    baseUrl,
    versionUrl,
    authToken,
    urlTemplate,
    patchUrlTemplate,
    updateArchiveTemplate,
    patchArchiveTemplate,
    manifestUrlTemplate,
  };
}

/**
 * Ensures that the required base URL is configured.
 * Throws a descriptive error if missing.
 */
export function requireBaseUrl(config: PatchConfig): string {
  if (!config.baseUrl) {
    throw new Error(
      "Missing required L2_PATCH_BASE_URL. Please set the L2_PATCH_BASE_URL environment variable, " +
        "configure the GitHub Organization Secret, or pass the --base-url option."
    );
  }
  return config.baseUrl;
}

/**
 * Ensures that the required version URL is configured.
 */
export function requireVersionUrl(config: PatchConfig): string {
  if (!config.versionUrl) {
    throw new Error(
      "Missing required L2_PATCH_VERSION_URL. Please set the L2_PATCH_VERSION_URL environment variable, " +
        "configure the GitHub Organization Secret, or pass the --version-url option."
    );
  }
  return config.versionUrl;
}
