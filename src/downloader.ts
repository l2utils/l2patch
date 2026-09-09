import * as fs from "fs";
import * as path from "path";
import { requireBaseUrl, resolveConfig } from "./config";
import {
  BulkDownloadResult,
  DownloadFileOptions,
  DownloadManifestOptions,
  PatchConfig,
  PatchDownloadResult,
  PatchOptions,
  PatchStep,
  UpdateDownloadOptions,
  UpdatePatchOptions,
} from "./types";
import { checkCurrentVersion } from "./version";

/**
 * Builds the URL for downloading the full zip of a file at a specific version.
 */
export function buildFullZipUrl(
  filePath: string,
  version: string,
  config: PatchConfig
): string {
  const baseUrl = requireBaseUrl(config).replace(/\/+$/, "");
  const normalizedFile = filePath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const template = config.urlTemplate || "{baseUrl}/{version}/{filePath}.zip";

  return template
    .replace("{baseUrl}", baseUrl)
    .replace("{version}", encodeURIComponent(version))
    .replace("{filePath}", normalizedFile);
}

/**
 * Builds the URL for downloading a delta patch for a file between two versions.
 */
export function buildPatchUrl(
  filePath: string,
  fromVersion: string,
  toVersion: string,
  config: PatchConfig
): string {
  const baseUrl = requireBaseUrl(config).replace(/\/+$/, "");
  const normalizedFile = filePath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const template =
    config.patchUrlTemplate ||
    "{baseUrl}/patch/{fromVersion}_{toVersion}/{filePath}.patch";

  return template
    .replace("{baseUrl}", baseUrl)
    .replace("{fromVersion}", encodeURIComponent(fromVersion))
    .replace("{toVersion}", encodeURIComponent(toVersion))
    .replace("{filePath}", normalizedFile);
}

/**
 * Builds the URL for a consolidated update archive for a given version.
 */
export function buildUpdateArchiveUrl(
  version: string,
  config: PatchConfig
): string {
  const baseUrl = requireBaseUrl(config).replace(/\/+$/, "");
  const template =
    config.updateArchiveTemplate || "{baseUrl}/archives/update_{version}.zip";

  return template
    .replace("{baseUrl}", baseUrl)
    .replace("{version}", encodeURIComponent(version));
}

/**
 * Builds the URL for a consolidated delta patch archive between two versions.
 */
export function buildPatchArchiveUrl(
  fromVersion: string,
  toVersion: string,
  config: PatchConfig
): string {
  const baseUrl = requireBaseUrl(config).replace(/\/+$/, "");
  const template =
    config.patchArchiveTemplate ||
    "{baseUrl}/archives/patch_{fromVersion}_to_{toVersion}.zip";

  return template
    .replace("{baseUrl}", baseUrl)
    .replace("{fromVersion}", encodeURIComponent(fromVersion))
    .replace("{toVersion}", encodeURIComponent(toVersion));
}

/**
 * Builds the URL for an update manifest.
 */
export function buildManifestUrl(
  version: string,
  config: PatchConfig,
  type: "patch" | "filemap" = "patch"
): string {
  const baseUrl = requireBaseUrl(config).replace(/\/+$/, "");
  const gameId = config.gameId;

  if (config.manifestUrlTemplate) {
    return config.manifestUrlTemplate
      .replace(/{baseUrl}/g, baseUrl)
      .replace(/{version}/g, encodeURIComponent(version))
      .replace(/{gameId}/g, gameId || "")
      .replace(/{type}/g, type);
  }

  const prefix = type === "filemap" ? "FileInfoMap" : "PatchFileInfo";
  return gameId
    ? `${baseUrl}/${encodeURIComponent(version)}/Patch/${prefix}_${gameId}_${encodeURIComponent(version)}.dat`
    : `${baseUrl}/${encodeURIComponent(version)}/Patch/${prefix}_${encodeURIComponent(version)}.dat`;
}

/**
 * Performs a HEAD probe to check if a resource exists at a URL.
 */
export async function probeUrl(
  url: string,
  authToken?: string
): Promise<boolean> {
  const headers: Record<string, string> = {
    "User-Agent": "l2patch/1.0.0",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, { method: "HEAD", headers });
    if (response.ok) {
      return true;
    }
    if (response.status === 405) {
      // Some CDNs reject HEAD; fallback to GET with Range 0-0
      const getResp = await fetch(url, {
        method: "GET",
        headers: { ...headers, Range: "bytes=0-0" },
      });
      return getResp.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Downloads a file from a URL to a local destination.
 */
export async function downloadToFile(
  url: string,
  destinationPath: string,
  authToken?: string
): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "l2patch/1.0.0",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to download from ${url}: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const dir = path.dirname(destinationPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(destinationPath, buffer);
  return destinationPath;
}

/**
 * Parses a file list from a JSON or plain text manifest.
 */
export function parseManifestFiles(manifestContent: string): string[] {
  const trimmed = manifestContent.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) =>
          typeof item === "string" ? item : (item.file || item.path || "")
        ).filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        const fileList =
          parsed.files ||
          parsed.fileList ||
          parsed.modifiedFiles ||
          parsed.entries;
        if (Array.isArray(fileList)) {
          return fileList.map((item) =>
            typeof item === "string" ? item : (item.file || item.path || "")
          ).filter(Boolean);
        }
      }
    } catch {
      // Fall through to plain text parsing
    }
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("["))
    .map((line) => {
      let candidate = line.includes(":") ? line.split(":")[0].trim() : line;
      candidate = candidate.replace(/\\/g, "/");
      if (candidate.startsWith("Zip/")) {
        candidate = candidate.slice(4);
      } else if (/^\d+\//.test(candidate)) {
        candidate = candidate.replace(/^\d+\//, "");
      }
      if (candidate.endsWith(".dlt.zip")) {
        candidate = candidate.slice(0, -8);
      } else if (candidate.endsWith(".zip")) {
        candidate = candidate.slice(0, -4);
      }
      return candidate;
    })
    .filter(Boolean);
}

/**
 * Resolves a list of files from a manifest path or URL.
 */
export async function loadManifestFileList(
  manifestPathOrUrl: string,
  authToken?: string
): Promise<string[]> {
  if (
    manifestPathOrUrl.startsWith("http://") ||
    manifestPathOrUrl.startsWith("https://")
  ) {
    const headers: Record<string, string> = {
      "User-Agent": "l2patch/1.0.0",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    const resp = await fetch(manifestPathOrUrl, { headers });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch manifest from ${manifestPathOrUrl}: ${resp.status} ${resp.statusText}`
      );
    }
    const buffer = resp.arrayBuffer
      ? Buffer.from(await resp.arrayBuffer())
      : Buffer.from(await resp.text());
    const text =
      buffer[0] === 0xff && buffer[1] === 0xfe
        ? buffer.toString("utf16le")
        : buffer.toString("utf-8");
    return parseManifestFiles(text);
  }

  const resolved = path.resolve(process.cwd(), manifestPathOrUrl);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Manifest file not found: ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  const text =
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString("utf16le")
      : buffer.toString("utf-8");
  return parseManifestFiles(text);
}

/**
 * Executes async tasks with limited concurrency.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => worker(item)).then((res) => {
      results.push(res);
    });
    const tracker: Promise<void> = p.then(() => {
      executing.splice(executing.indexOf(tracker), 1);
    });
    executing.push(tracker);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Downloads a full zip of a specified file for a given version (or latest).
 */
export async function downloadFullZip(
  filePath: string,
  options?: DownloadFileOptions
): Promise<string> {
  const config = resolveConfig(options?.config);

  let targetVersion = options?.version;
  if (options?.latest || !targetVersion) {
    const latestInfo = await checkCurrentVersion(config);
    targetVersion = latestInfo.version;
  }

  const url = buildFullZipUrl(filePath, targetVersion, config);
  const outDir = path.resolve(process.cwd(), options?.outDir || ".");
  const fileName = `${path.basename(filePath)}_${targetVersion}.zip`;
  const destination = path.join(outDir, fileName);

  return downloadToFile(url, destination, config.authToken);
}

/**
 * Downloads the manifest file for a given version (or latest).
 */
export async function downloadManifest(
  version?: string,
  options?: DownloadManifestOptions
): Promise<string> {
  const config = resolveConfig(options?.config);
  requireBaseUrl(config);

  let targetVersion = version || options?.version;
  if (options?.latest || !targetVersion) {
    const latestInfo = await checkCurrentVersion(config);
    targetVersion = latestInfo.version;
  }

  const type = options?.type || "patch";
  const url = buildManifestUrl(targetVersion, config, type);
  const outDir = path.resolve(process.cwd(), options?.outDir || ".");
  const prefix = type === "filemap" ? "FileInfoMap" : "PatchFileInfo";
  const gameId = config.gameId;
  const fileName = gameId
    ? `${prefix}_${gameId}_${targetVersion}.dat`
    : `${prefix}_${targetVersion}.dat`;
  const destination = path.join(outDir, fileName);

  return downloadToFile(url, destination, config.authToken);
}

/**
 * Downloads patch file(s) for version A -> version B.
 * Probes whether a direct N -> M patch exists. If not, attempts to resolve
 * and download incremental step-by-step patches.
 */
export async function downloadPatch(
  filePath: string,
  options: PatchOptions
): Promise<PatchDownloadResult> {
  const config = resolveConfig(options.config);
  const outDir = path.resolve(process.cwd(), options.outDir || ".");

  const { fromVersion, toVersion } = options;

  // 1. Probe for direct N -> M patch
  const directUrl = buildPatchUrl(filePath, fromVersion, toVersion, config);
  const directExists = await probeUrl(directUrl, config.authToken);

  if (directExists) {
    const fileName = `${path.basename(filePath)}_${fromVersion}_to_${toVersion}.patch`;
    const destination = path.join(outDir, fileName);
    const savedPath = await downloadToFile(directUrl, destination, config.authToken);

    return {
      filePath,
      fromVersion,
      toVersion,
      isDirect: true,
      strategy: "direct",
      downloadedFiles: [savedPath],
      steps: [
        {
          from: fromVersion,
          to: toVersion,
          url: directUrl,
          savedPath,
        },
      ],
    };
  }

  // 2. Fallback: check if incremental patches can be resolved
  const fromNum = parseInt(fromVersion, 10);
  const toNum = parseInt(toVersion, 10);

  if (isNaN(fromNum) || isNaN(toNum) || toNum <= fromNum) {
    throw new Error(
      `No direct patch found for ${fromVersion} -> ${toVersion} at ${directUrl}, ` +
        `and versions cannot be resolved as an incremental integer sequence.`
    );
  }

  const steps: PatchStep[] = [];
  const downloadedFiles: string[] = [];

  for (let current = fromNum; current < toNum; current++) {
    const next = current + 1;
    const stepUrl = buildPatchUrl(filePath, String(current), String(next), config);
    const exists = await probeUrl(stepUrl, config.authToken);

    if (!exists) {
      throw new Error(
        `Incremental patch step ${current} -> ${next} does not exist at ${stepUrl}. ` +
          `Neither direct nor complete incremental patch path is available.`
      );
    }

    const fileName = `${path.basename(filePath)}_${current}_to_${next}.patch`;
    const destination = path.join(outDir, fileName);
    const savedPath = await downloadToFile(stepUrl, destination, config.authToken);

    steps.push({
      from: String(current),
      to: String(next),
      url: stepUrl,
      savedPath,
    });
    downloadedFiles.push(savedPath);
  }

  return {
    filePath,
    fromVersion,
    toVersion,
    isDirect: false,
    strategy: "incremental",
    downloadedFiles,
    steps,
  };
}

/**
 * Downloads full zips for an entire patch update:
 * Either downloads a consolidated update archive if available,
 * or resolves all files via manifest / filelist and downloads them.
 */
export async function downloadUpdate(
  options?: UpdateDownloadOptions
): Promise<BulkDownloadResult> {
  const config = resolveConfig(options?.config);
  const outDir = path.resolve(process.cwd(), options?.outDir || ".");
  const concurrency = Math.max(1, options?.concurrency || 4);

  let targetVersion = options?.version;
  if (options?.latest || !targetVersion) {
    const latestInfo = await checkCurrentVersion(config);
    targetVersion = latestInfo.version;
  }

  // Check for consolidated update archive first if no explicit manifest was supplied
  if (!options?.manifestPathOrUrl && !options?.fileList) {
    const archiveUrl = buildUpdateArchiveUrl(targetVersion, config);
    const archiveExists = await probeUrl(archiveUrl, config.authToken);
    if (archiveExists) {
      const fileName = `update_${targetVersion}.zip`;
      const destination = path.join(outDir, fileName);
      const savedPath = await downloadToFile(archiveUrl, destination, config.authToken);
      return {
        version: targetVersion,
        mode: "archive",
        downloadedFiles: [savedPath],
        failedFiles: [],
        totalFiles: 1,
      };
    }
  }

  // Resolve file list
  let files: string[] = options?.fileList || [];
  if (files.length === 0) {
    const manifestSource =
      options?.manifestPathOrUrl || buildManifestUrl(targetVersion, config);
    files = await loadManifestFileList(manifestSource, config.authToken);
  }

  if (files.length === 0) {
    throw new Error(
      `No files found to download for update version ${targetVersion}.`
    );
  }

  const downloadedFiles: string[] = [];
  const failedFiles: { file: string; error: string }[] = [];

  await runWithConcurrency(files, concurrency, async (file) => {
    try {
      const saved = await downloadFullZip(file, {
        version: targetVersion,
        outDir,
        config,
      });
      downloadedFiles.push(saved);
    } catch (err) {
      failedFiles.push({ file, error: (err as Error).message });
    }
  });

  return {
    version: targetVersion,
    mode: "manifest",
    downloadedFiles,
    failedFiles,
    totalFiles: files.length,
  };
}

/**
 * Downloads delta patches for an entire patch update from version A to version B:
 * Either downloads a consolidated delta patch archive if available,
 * or resolves all files via manifest / filelist and downloads their patch files.
 */
export async function downloadPatchUpdate(
  options: UpdatePatchOptions
): Promise<BulkDownloadResult> {
  const config = resolveConfig(options.config);
  const outDir = path.resolve(process.cwd(), options.outDir || ".");
  const concurrency = Math.max(1, options.concurrency || 4);
  const { fromVersion, toVersion } = options;

  // Check for consolidated patch archive first if no explicit manifest was supplied
  if (!options.manifestPathOrUrl && !options.fileList) {
    const archiveUrl = buildPatchArchiveUrl(fromVersion, toVersion, config);
    const archiveExists = await probeUrl(archiveUrl, config.authToken);
    if (archiveExists) {
      const fileName = `patch_${fromVersion}_to_${toVersion}.zip`;
      const destination = path.join(outDir, fileName);
      const savedPath = await downloadToFile(archiveUrl, destination, config.authToken);
      return {
        fromVersion,
        toVersion,
        mode: "archive",
        downloadedFiles: [savedPath],
        failedFiles: [],
        totalFiles: 1,
      };
    }
  }

  // Resolve file list
  let files: string[] = options.fileList || [];
  if (files.length === 0) {
    const manifestSource =
      options.manifestPathOrUrl || buildManifestUrl(toVersion, config);
    files = await loadManifestFileList(manifestSource, config.authToken);
  }

  if (files.length === 0) {
    throw new Error(
      `No files found to patch between ${fromVersion} and ${toVersion}.`
    );
  }

  const downloadedFiles: string[] = [];
  const failedFiles: { file: string; error: string }[] = [];

  await runWithConcurrency(files, concurrency, async (file) => {
    try {
      const result = await downloadPatch(file, {
        fromVersion,
        toVersion,
        outDir,
        config,
      });
      downloadedFiles.push(...result.downloadedFiles);
    } catch (err) {
      failedFiles.push({ file, error: (err as Error).message });
    }
  });

  return {
    fromVersion,
    toVersion,
    mode: "manifest",
    downloadedFiles,
    failedFiles,
    totalFiles: files.length,
  };
}
