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

export interface DownloadFileOptions {
  version?: string;
  latest?: boolean;
  outDir?: string;
  extract?: boolean;
  config?: PatchConfig;
  onProgress?: FileProgressCallback;
}

export interface DownloadManifestOptions {
  version?: string;
  latest?: boolean;
  type?: "patch" | "filemap";
  outDir?: string;
  config?: PatchConfig;
  onProgress?: FileProgressCallback;
}

export interface PatchOptions {
  fromVersion: string;
  toVersion: string;
  outDir?: string;
  config?: PatchConfig;
  onProgress?: FileProgressCallback;
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
  fileList?: string[];
  concurrency?: number;
  config?: PatchConfig;
  onProgress?: BatchProgressCallback;
  onFileProgress?: FileProgressCallback;
}

export interface UpdatePatchOptions {
  fromVersion: string;
  toVersion: string;
  outDir?: string;
  manifestPathOrUrl?: string;
  fileList?: string[];
  concurrency?: number;
  config?: PatchConfig;
  onProgress?: BatchProgressCallback;
  onFileProgress?: FileProgressCallback;
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
