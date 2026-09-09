import * as fs from "fs";
import * as path from "path";
import { requireBaseUrl, resolveConfig } from "./config";
import {
  ActiveFileDownload,
  BulkDownloadResult,
  DownloadFileOptions,
  DownloadManifestOptions,
  FileDownloadProgress,
  FileProgressCallback,
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
 * Builds the URL for downloading a FileInfoMap manifest.
 */
export function buildFileInfoMapUrl(
  version: string,
  config: PatchConfig
): string {
  return buildManifestUrl(version, config, "filemap");
}

/**
 * Builds the URL for downloading a PatchFileInfo manifest.
 */
export function buildPatchFileInfoUrl(
  version: string,
  config: PatchConfig
): string {
  return buildManifestUrl(version, config, "patch");
}

/**
 * Canonical HTTP headers matching the official NCSoft Purple patch downloader (no User-Agent).
 */
export const NC_CDN_HEADERS: Record<string, string> = {
  Accept: "*/*",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-transform",
};

export interface FetchRetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Parses the Retry-After header into milliseconds to wait, if present.
 */
export function parseRetryAfter(
  headerValue: string | null
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (/^-?\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return seconds >= 0 ? seconds * 1000 : undefined;
  }
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return undefined;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes a fetch with exponential backoff retry on transient failure codes (403, 429, 5xx)
 * and network exceptions.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchRetryOptions
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 3;
  const isTest = process.env.NODE_ENV === "test";
  const initialDelayMs = options?.retryDelayMs ?? (isTest ? 10 : 1000);

  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);
      const isRetryable =
        response.status === 403 ||
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (response.ok || !isRetryable || attempt === maxRetries) {
        return response;
      }

      lastResponse = response;

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      const jitter = isTest ? 0 : Math.random() * 200;
      const backoffMs =
        retryAfterMs !== undefined
          ? Math.min(retryAfterMs, 30000)
          : Math.min(
              initialDelayMs * Math.pow(2, attempt) + jitter,
              30000
            );

      await sleep(backoffMs);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        throw err;
      }
      const jitter = isTest ? 0 : Math.random() * 200;
      const backoffMs = Math.min(
        initialDelayMs * Math.pow(2, attempt) + jitter,
        30000
      );
      await sleep(backoffMs);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }
  throw lastError;
}

/**
 * Performs a HEAD probe to check if a resource exists at a URL.
 */
export async function probeUrl(
  url: string,
  authToken?: string,
  options?: FetchRetryOptions
): Promise<boolean> {
  const headers: Record<string, string> = { ...NC_CDN_HEADERS };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetchWithRetry(
      url,
      { method: "HEAD", headers },
      options
    );
    if (response.ok) {
      return true;
    }
    if (response.status === 405) {
      // Some CDNs reject HEAD; fallback to GET with Range 0-0
      const getResp = await fetchWithRetry(
        url,
        {
          method: "GET",
          headers: { ...headers, Range: "bytes=0-0" },
        },
        options
      );
      return getResp.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Downloads a resource from a URL directly to an in-memory Buffer.
 */
export async function downloadToBuffer(
  url: string,
  authToken?: string,
  options?: FetchRetryOptions,
  onProgress?: FileProgressCallback
): Promise<Buffer>;
export async function downloadToBuffer(
  url: string,
  authToken?: string,
  onProgress?: FileProgressCallback
): Promise<Buffer>;
export async function downloadToBuffer(
  url: string,
  authToken?: string,
  optionsOrProgress?: FetchRetryOptions | FileProgressCallback,
  onProgress?: FileProgressCallback
): Promise<Buffer> {
  const options: FetchRetryOptions | undefined =
    typeof optionsOrProgress === "function" ? undefined : optionsOrProgress;
  const progressCb: FileProgressCallback | undefined =
    typeof optionsOrProgress === "function" ? optionsOrProgress : onProgress;

  const headers: Record<string, string> = { ...NC_CDN_HEADERS };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetchWithRetry(url, { headers }, options);
  if (!response.ok) {
    throw new Error(
      `Failed to download from ${url}: ${response.status} ${response.statusText}`
    );
  }

  const contentLengthHeader = response.headers?.get("content-length");
  const totalBytes = contentLengthHeader
    ? parseInt(contentLengthHeader, 10)
    : undefined;

  // Stream reader chunk-by-chunk if available
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        progressCb?.({
          receivedBytes,
          totalBytes,
          chunkSize: value.length,
        });
      }
    }
    return Buffer.concat(chunks);
  }

  // Fallback for mocked or non-streaming responses
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  progressCb?.({
    receivedBytes: buffer.length,
    totalBytes: totalBytes ?? buffer.length,
    chunkSize: buffer.length,
  });
  return buffer;
}


/**
 * Downloads a file from a URL to a local destination.
 */
export async function downloadToFile(
  url: string,
  destinationPath: string,
  authToken?: string,
  options?: {
    maxRetries?: number;
    retryDelayMs?: number;
    skipExisting?: boolean;
    onProgress?: FileProgressCallback;
  }
): Promise<string> {
  if (options?.skipExisting && fs.existsSync(destinationPath)) {
    try {
      const stats = fs.statSync(destinationPath);
      if (stats.size > 0) {
        return destinationPath;
      }
    } catch {
      // Fall through to download if stat fails
    }
  }

  const buffer = await downloadToBuffer(url, authToken, options, (p) => {
    options?.onProgress?.({ ...p, filePath: destinationPath });
  });

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
  authToken?: string,
  options?: FetchRetryOptions
): Promise<string[]> {
  if (
    manifestPathOrUrl.startsWith("http://") ||
    manifestPathOrUrl.startsWith("https://")
  ) {
    const headers: Record<string, string> = { ...NC_CDN_HEADERS };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    const resp = await fetchWithRetry(manifestPathOrUrl, { headers }, options);
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
 * Executes async tasks with limited concurrency and optional inter-request delay.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  delayMs: number = 0
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (delayMs > 0 && i > 0) {
      await sleep(delayMs);
    }
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
 * Fetches a full zip of a specified file as an in-memory Buffer.
 */
export async function fetchFullZip(
  filePath: string,
  options?: DownloadFileOptions
): Promise<Buffer> {
  const config = resolveConfig(options?.config);

  let targetVersion = options?.version;
  if (options?.latest || !targetVersion) {
    const latestInfo = await checkCurrentVersion(config);
    targetVersion = latestInfo.version;
  }

  const url = buildFullZipUrl(filePath, targetVersion, config);
  const onProgress = options?.onProgress
    ? (p: FileDownloadProgress) => options.onProgress!({ ...p, filePath })
    : undefined;
  return downloadToBuffer(
    url,
    config.authToken,
    {
      maxRetries: options?.maxRetries ?? config.maxRetries,
      retryDelayMs: options?.retryDelayMs ?? config.retryDelayMs,
    },
    onProgress
  );
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

  const outDir = path.resolve(process.cwd(), options?.outDir || ".");
  const fileName = `${path.basename(filePath)}_${targetVersion}.zip`;
  const destination = path.join(outDir, fileName);

  const url = buildFullZipUrl(filePath, targetVersion, config);
  const onProgress = options?.onProgress
    ? (p: FileDownloadProgress) => options.onProgress!({ ...p, filePath })
    : undefined;
  return downloadToFile(url, destination, config.authToken, {
    maxRetries: options?.maxRetries ?? config.maxRetries,
    retryDelayMs: options?.retryDelayMs ?? config.retryDelayMs,
    skipExisting: options?.skipExisting,
    onProgress,
  });
}

/**
 * Fetches the manifest file for a given version as an in-memory Buffer.
 */
export async function fetchManifest(
  version?: string,
  options?: DownloadManifestOptions
): Promise<Buffer> {
  const config = resolveConfig(options?.config);
  requireBaseUrl(config);

  let targetVersion = version || options?.version;
  if (options?.latest || !targetVersion) {
    const latestInfo = await checkCurrentVersion(config);
    targetVersion = latestInfo.version;
  }

  const type = options?.type || "patch";
  const url = buildManifestUrl(targetVersion, config, type);
  return downloadToBuffer(
    url,
    config.authToken,
    {
      maxRetries: options?.maxRetries ?? config.maxRetries,
      retryDelayMs: options?.retryDelayMs ?? config.retryDelayMs,
    },
    options?.onProgress
  );
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
  const outDir = path.resolve(process.cwd(), options?.outDir || ".");
  const prefix = type === "filemap" ? "FileInfoMap" : "PatchFileInfo";
  const gameId = config.gameId;
  const fileName = gameId
    ? `${prefix}_${gameId}_${targetVersion}.dat`
    : `${prefix}_${targetVersion}.dat`;
  const destination = path.join(outDir, fileName);

  const url = buildManifestUrl(targetVersion, config, type);
  return downloadToFile(url, destination, config.authToken, {
    maxRetries: options?.maxRetries ?? config.maxRetries,
    retryDelayMs: options?.retryDelayMs ?? config.retryDelayMs,
    onProgress: options?.onProgress,
  });
}

/**
 * Fetches the FileInfoMap manifest for a given version as an in-memory Buffer.
 */
export async function fetchFileInfoMap(
  version?: string,
  options?: Omit<DownloadManifestOptions, "type">
): Promise<Buffer> {
  return fetchManifest(version, { ...options, type: "filemap" });
}

/**
 * Fetches the PatchFileInfo manifest for a given version as an in-memory Buffer.
 */
export async function fetchPatchFileInfo(
  version?: string,
  options?: Omit<DownloadManifestOptions, "type">
): Promise<Buffer> {
  return fetchManifest(version, { ...options, type: "patch" });
}

/**
 * Downloads the FileInfoMap manifest file for a given version (or latest).
 */
export async function downloadFileInfoMap(
  version?: string,
  options?: Omit<DownloadManifestOptions, "type">
): Promise<string> {
  return downloadManifest(version, { ...options, type: "filemap" });
}

/**
 * Downloads the PatchFileInfo manifest file for a given version (or latest).
 */
export async function downloadPatchFileInfo(
  version?: string,
  options?: Omit<DownloadManifestOptions, "type">
): Promise<string> {
  return downloadManifest(version, { ...options, type: "patch" });
}

/**
 * Fetches a delta patch for a file between two versions as an in-memory Buffer.
 */
export async function fetchPatch(
  filePath: string,
  options: PatchOptions
): Promise<Buffer> {
  const config = resolveConfig(options.config);
  const { fromVersion, toVersion } = options;
  const retryOpts = {
    maxRetries: options.maxRetries ?? config.maxRetries,
    retryDelayMs: options.retryDelayMs ?? config.retryDelayMs,
  };

  const directUrl = buildPatchUrl(filePath, fromVersion, toVersion, config);
  const directExists = await probeUrl(directUrl, config.authToken, retryOpts);

  if (directExists) {
    const onProgress = options?.onProgress
      ? (p: FileDownloadProgress) => options.onProgress!({ ...p, filePath })
      : undefined;
    return downloadToBuffer(directUrl, config.authToken, retryOpts, onProgress);
  }

  throw new Error(
    `Direct patch delta between ${fromVersion} and ${toVersion} not found at ${directUrl}.`
  );
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
  const onProgress = options?.onProgress
    ? (p: FileDownloadProgress) => options.onProgress!({ ...p, filePath })
    : undefined;
  const retryOpts = {
    maxRetries: options.maxRetries ?? config.maxRetries,
    retryDelayMs: options.retryDelayMs ?? config.retryDelayMs,
    skipExisting: options.skipExisting,
    onProgress,
  };

  // 1. Probe for direct N -> M patch
  const directUrl = buildPatchUrl(filePath, fromVersion, toVersion, config);
  const directExists = await probeUrl(directUrl, config.authToken, retryOpts);

  if (directExists) {
    const fileName = `${path.basename(filePath)}_${fromVersion}_to_${toVersion}.patch`;
    const destination = path.join(outDir, fileName);
    const savedPath = await downloadToFile(
      directUrl,
      destination,
      config.authToken,
      retryOpts
    );

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
    const exists = await probeUrl(stepUrl, config.authToken, retryOpts);

    if (!exists) {
      throw new Error(
        `Incremental patch step ${current} -> ${next} does not exist at ${stepUrl}. ` +
          `Neither direct nor complete incremental patch path is available.`
      );
    }

    const fileName = `${path.basename(filePath)}_${current}_to_${next}.patch`;
    const destination = path.join(outDir, fileName);
    const savedPath = await downloadToFile(
      stepUrl,
      destination,
      config.authToken,
      retryOpts
    );


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
  const delayMs = options?.delayMs ?? config.delayMs ?? 0;
  const retryOpts = {
    maxRetries: options?.maxRetries ?? config.maxRetries,
    retryDelayMs: options?.retryDelayMs ?? config.retryDelayMs,
    skipExisting: options?.skipExisting,
  };

  let targetVersion = options?.version;
  if (options?.latest || !targetVersion) {
    const latestInfo = await checkCurrentVersion(config);
    targetVersion = latestInfo.version;
  }

  // Check for consolidated update archive first if no explicit manifest was supplied
  if (!options?.manifestPathOrUrl && !options?.fileList) {
    const archiveUrl = buildUpdateArchiveUrl(targetVersion, config);
    const archiveExists = await probeUrl(archiveUrl, config.authToken, retryOpts);
    if (archiveExists) {
      const fileName = `update_${targetVersion}.zip`;
      const destination = path.join(outDir, fileName);
      options?.onProgress?.({
        totalFiles: 1,
        completedFiles: 0,
        failedFiles: 0,
        activeFiles: [{ file: fileName, receivedBytes: 0 }],
      });
      const savedPath = await downloadToFile(
        archiveUrl,
        destination,
        config.authToken,
        {
          ...retryOpts,
          onProgress: (p) => {
            options?.onFileProgress?.({ ...p, filePath: fileName });
            options?.onProgress?.({
              totalFiles: 1,
              completedFiles: 0,
              failedFiles: 0,
              activeFiles: [
                {
                  file: fileName,
                  receivedBytes: p.receivedBytes,
                  totalBytes: p.totalBytes,
                },
              ],
            });
          },
        }
      );
      options?.onProgress?.({
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        activeFiles: [],
        latestCompletedFile: fileName,
      });
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
    const manifestType = options?.manifestType || "patch";
    const manifestSource =
      options?.manifestPathOrUrl ||
      buildManifestUrl(targetVersion, config, manifestType);
    files = await loadManifestFileList(manifestSource, config.authToken, retryOpts);
  }

  if (files.length === 0) {
    throw new Error(
      `No files found to download for update version ${targetVersion}.`
    );
  }

  const downloadedFiles: string[] = [];
  const failedFiles: { file: string; error: string }[] = [];

  const activeMap = new Map<string, { receivedBytes: number; totalBytes?: number }>();
  let completedCount = 0;
  let failedCount = 0;

  const notifyProgress = (latestCompleted?: string) => {
    if (!options?.onProgress) return;
    const activeFiles: ActiveFileDownload[] = [];
    for (const [file, info] of activeMap.entries()) {
      activeFiles.push({
        file,
        receivedBytes: info.receivedBytes,
        totalBytes: info.totalBytes,
      });
    }
    options.onProgress({
      totalFiles: files.length,
      completedFiles: completedCount,
      failedFiles: failedCount,
      activeFiles,
      latestCompletedFile: latestCompleted,
    });
  };

  notifyProgress();

  await runWithConcurrency(
    files,
    concurrency,
    async (file) => {
      activeMap.set(file, { receivedBytes: 0 });
      notifyProgress();
      try {
        const saved = await downloadFullZip(file, {
          version: targetVersion,
          outDir,
          config,
          maxRetries: retryOpts.maxRetries,
          retryDelayMs: retryOpts.retryDelayMs,
          skipExisting: retryOpts.skipExisting,
          onProgress: (p) => {
            activeMap.set(file, {
              receivedBytes: p.receivedBytes,
              totalBytes: p.totalBytes,
            });
            options?.onFileProgress?.(p);
            notifyProgress();
          },
        });
        downloadedFiles.push(saved);
        completedCount++;
      } catch (err) {
        failedFiles.push({ file, error: (err as Error).message });
        failedCount++;
      } finally {
        activeMap.delete(file);
        notifyProgress(file);
      }
    },
    delayMs
  );

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
  const delayMs = options.delayMs ?? config.delayMs ?? 0;
  const retryOpts = {
    maxRetries: options.maxRetries ?? config.maxRetries,
    retryDelayMs: options.retryDelayMs ?? config.retryDelayMs,
    skipExisting: options.skipExisting,
  };
  const { fromVersion, toVersion } = options;

  // Check for consolidated patch archive first if no explicit manifest was supplied
  if (!options.manifestPathOrUrl && !options.fileList) {
    const archiveUrl = buildPatchArchiveUrl(fromVersion, toVersion, config);
    const archiveExists = await probeUrl(archiveUrl, config.authToken, retryOpts);
    if (archiveExists) {
      const fileName = `patch_${fromVersion}_to_${toVersion}.zip`;
      const destination = path.join(outDir, fileName);
      options?.onProgress?.({
        totalFiles: 1,
        completedFiles: 0,
        failedFiles: 0,
        activeFiles: [{ file: fileName, receivedBytes: 0 }],
      });
      const savedPath = await downloadToFile(
        archiveUrl,
        destination,
        config.authToken,
        {
          ...retryOpts,
          onProgress: (p) => {
            options?.onFileProgress?.({ ...p, filePath: fileName });
            options?.onProgress?.({
              totalFiles: 1,
              completedFiles: 0,
              failedFiles: 0,
              activeFiles: [
                {
                  file: fileName,
                  receivedBytes: p.receivedBytes,
                  totalBytes: p.totalBytes,
                },
              ],
            });
          },
        }
      );
      options?.onProgress?.({
        totalFiles: 1,
        completedFiles: 1,
        failedFiles: 0,
        activeFiles: [],
        latestCompletedFile: fileName,
      });
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
    const manifestType = options.manifestType || "patch";
    const manifestSource =
      options.manifestPathOrUrl ||
      buildManifestUrl(toVersion, config, manifestType);
    files = await loadManifestFileList(manifestSource, config.authToken, retryOpts);
  }

  if (files.length === 0) {
    throw new Error(
      `No files found to patch between ${fromVersion} and ${toVersion}.`
    );
  }

  const downloadedFiles: string[] = [];
  const failedFiles: { file: string; error: string }[] = [];

  const activeMap = new Map<string, { receivedBytes: number; totalBytes?: number }>();
  let completedCount = 0;
  let failedCount = 0;

  const notifyProgress = (latestCompleted?: string) => {
    if (!options?.onProgress) return;
    const activeFiles: ActiveFileDownload[] = [];
    for (const [file, info] of activeMap.entries()) {
      activeFiles.push({
        file,
        receivedBytes: info.receivedBytes,
        totalBytes: info.totalBytes,
      });
    }
    options.onProgress({
      totalFiles: files.length,
      completedFiles: completedCount,
      failedFiles: failedCount,
      activeFiles,
      latestCompletedFile: latestCompleted,
    });
  };

  notifyProgress();

  await runWithConcurrency(
    files,
    concurrency,
    async (file) => {
      activeMap.set(file, { receivedBytes: 0 });
      notifyProgress();
      try {
        const result = await downloadPatch(file, {
          fromVersion,
          toVersion,
          outDir,
          config,
          maxRetries: retryOpts.maxRetries,
          retryDelayMs: retryOpts.retryDelayMs,
          skipExisting: retryOpts.skipExisting,
          onProgress: (p) => {
            activeMap.set(file, {
              receivedBytes: p.receivedBytes,
              totalBytes: p.totalBytes,
            });
            options?.onFileProgress?.(p);
            notifyProgress();
          },
        });
        downloadedFiles.push(...result.downloadedFiles);
        completedCount++;
      } catch (err) {
        failedFiles.push({ file, error: (err as Error).message });
        failedCount++;
      } finally {
        activeMap.delete(file);
        notifyProgress(file);
      }
    },
    delayMs
  );

  return {
    fromVersion,
    toVersion,
    mode: "manifest",
    downloadedFiles,
    failedFiles,
    totalFiles: files.length,
  };
}
