import { DownloadFilter } from "./filters";

export interface PatchConfig {
  baseUrl?: string;
  cdnHost?: string;
  versionUrl?: string;
  updaterHost?: string;
  updaterPort?: number;
  gameId?: string;
  authToken?: string;
  urlTemplate?: string;
  patchUrlTemplate?: string;
  updateArchiveTemplate?: string;
  patchArchiveTemplate?: string;
  manifestUrlTemplate?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  delayMs?: number;
}

export interface CdnConfigInfo {
  cdnHost: string;
  baseUrl: string;
}

export interface VersionInfo {
  version: string;
  manifestHash?: string;
  timestamp?: string;
  raw?: unknown;
}

export interface FileDownloadProgress {
  filePath?: string;
  receivedBytes: number;
  totalBytes?: number;
  chunkSize?: number;
}

export type FileProgressCallback = (progress: FileDownloadProgress) => void;

export interface ActiveFileDownload {
  file: string;
  receivedBytes: number;
  totalBytes?: number;
}

export interface BatchDownloadProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  activeFiles: ActiveFileDownload[];
  latestCompletedFile?: string;
}

export type BatchProgressCallback = (progress: BatchDownloadProgress) => void;

export interface DownloadCompleteInfo {
  source: string;
  destination: string;
  bytes: number;
  durationMs: number;
  averageSpeed: number;
}

export type DownloadCompleteCallback = (info: DownloadCompleteInfo) => void;

export interface DownloadFileOptions {
  version?: string;
  latest?: boolean;
  outDir?: string;
  extract?: boolean;
  config?: PatchConfig;
  maxRetries?: number;
  retryDelayMs?: number;
  skipExisting?: boolean;
  onProgress?: FileProgressCallback;
  onComplete?: DownloadCompleteCallback;
}

export interface DownloadManifestOptions {
  version?: string;
  latest?: boolean;
  type?: "patch" | "filemap";
  outDir?: string;
  config?: PatchConfig;
  maxRetries?: number;
  retryDelayMs?: number;
  onProgress?: FileProgressCallback;
  onComplete?: DownloadCompleteCallback;
}

export interface PatchOptions {
  fromVersion: string;
  toVersion: string;
  outDir?: string;
  config?: PatchConfig;
  maxRetries?: number;
  retryDelayMs?: number;
  skipExisting?: boolean;
  onProgress?: FileProgressCallback;
  onComplete?: DownloadCompleteCallback;
}

export interface PatchStep {
  from: string;
  to: string;
  url: string;
  savedPath: string;
}

export interface PatchDownloadResult {
  filePath: string;
  fromVersion: string;
  toVersion: string;
  isDirect: boolean;
  strategy: "direct" | "incremental";
  downloadedFiles: string[];
  steps: PatchStep[];
}

export interface UpdateDownloadOptions {
  version?: string;
  latest?: boolean;
  outDir?: string;
  manifestPathOrUrl?: string;
  manifestType?: "patch" | "filemap";
  fileList?: string[];
  filter?: DownloadFilter | string;
  concurrency?: number;
  config?: PatchConfig;
  maxRetries?: number;
  retryDelayMs?: number;
  delayMs?: number;
  skipExisting?: boolean;
  onProgress?: BatchProgressCallback;
  onFileProgress?: FileProgressCallback;
  onComplete?: DownloadCompleteCallback;
  onFileComplete?: DownloadCompleteCallback;
}

export interface UpdatePatchOptions {
  fromVersion: string;
  toVersion: string;
  outDir?: string;
  manifestPathOrUrl?: string;
  manifestType?: "patch" | "filemap";
  fileList?: string[];
  filter?: DownloadFilter | string;
  concurrency?: number;
  config?: PatchConfig;
  maxRetries?: number;
  retryDelayMs?: number;
  delayMs?: number;
  skipExisting?: boolean;
  onProgress?: BatchProgressCallback;
  onFileProgress?: FileProgressCallback;
  onComplete?: DownloadCompleteCallback;
  onFileComplete?: DownloadCompleteCallback;
}


export interface BulkDownloadResult {
  version?: string;
  fromVersion?: string;
  toVersion?: string;
  mode: "archive" | "manifest";
  downloadedFiles: string[];
  failedFiles: { file: string; error: string }[];
  totalFiles: number;
}
