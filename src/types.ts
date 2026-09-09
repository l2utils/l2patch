export interface PatchConfig {
  baseUrl?: string;
  versionUrl?: string;
  authToken?: string;
  urlTemplate?: string;
  patchUrlTemplate?: string;
  updateArchiveTemplate?: string;
  patchArchiveTemplate?: string;
  manifestUrlTemplate?: string;
}

export interface VersionInfo {
  version: string;
  timestamp?: string;
  raw?: unknown;
}

export interface DownloadFileOptions {
  version?: string;
  latest?: boolean;
  outDir?: string;
  extract?: boolean;
  config?: PatchConfig;
}

export interface PatchOptions {
  fromVersion: string;
  toVersion: string;
  outDir?: string;
  config?: PatchConfig;
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
}

export interface UpdatePatchOptions {
  fromVersion: string;
  toVersion: string;
  outDir?: string;
  manifestPathOrUrl?: string;
  fileList?: string[];
  concurrency?: number;
  config?: PatchConfig;
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
