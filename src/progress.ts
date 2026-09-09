import * as readline from "readline";
import {
  ActiveFileDownload,
  BatchDownloadProgress,
  FileDownloadProgress,
} from "./types";

/**
 * Formats a byte count into human-readable string (e.g. 1.25 MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0 || isNaN(bytes)) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  if (i === 0) return `${bytes} B`;
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

/**
 * Formats seconds into a human-readable duration (mm:ss or hh:mm:ss).
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0 || isNaN(seconds)) return "--:--";
  const sec = Math.round(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Renders a visual ASCII progress bar, e.g. [=========>          ]
 */
export function renderProgressBar(ratio: number, width: number): string {
  const safeRatio = Math.max(0, Math.min(1, isNaN(ratio) ? 0 : ratio));
  const innerWidth = Math.max(0, width - 2);
  const filled = Math.round(innerWidth * safeRatio);
  const empty = innerWidth - filled;
  if (filled === 0) {
    return `[${" ".repeat(innerWidth)}]`;
  }
  if (filled === innerWidth) {
    return `[${"=".repeat(innerWidth)}]`;
  }
  return `[${"=".repeat(Math.max(0, filled - 1))}>${" ".repeat(empty)}]`;
}

/**
 * Checks whether dynamic terminal progress bars are supported in the given stream.
 */
export function isProgressSupported(
  stream: NodeJS.WriteStream = process.stderr
): boolean {
  return Boolean(
    stream &&
      stream.isTTY &&
      process.env.TERM !== "dumb" &&
      !process.env.CI
  );
}

export interface ProgressReporterOptions {
  stream?: NodeJS.WriteStream;
  enabled?: boolean;
  isDynamic?: boolean;
  throttleMs?: number;
  label?: string;
}

/**
 * Reporter for single-file downloads (used by `download` command).
 */
export class FileProgressReporter {
  private readonly stream: NodeJS.WriteStream;
  private readonly enabled: boolean;
  private readonly isDynamic: boolean;
  private readonly throttleMs: number;
  private readonly label?: string;

  private startTime: number = Date.now();
  private lastRenderTime: number = 0;
  private lastMilestone: number = -1;
  private lastNonTtyLogTime: number = 0;
  private lastReceived: number = 0;
  private lastTotal?: number;
  private isFinished: boolean = false;
  private hasLoggedStart: boolean = false;

  constructor(options?: ProgressReporterOptions) {
    this.stream = options?.stream ?? process.stderr;
    this.enabled = options?.enabled !== false;
    this.isDynamic =
      options?.isDynamic !== undefined
        ? options.isDynamic
        : isProgressSupported(this.stream);
    this.throttleMs = options?.throttleMs ?? 60;
    this.label = options?.label;
  }

  public update(progress: FileDownloadProgress): void {
    if (!this.enabled || this.isFinished) return;

    const now = Date.now();
    const filePath = progress.filePath || this.label;
    const received = progress.receivedBytes;
    const total = progress.totalBytes;
    this.lastReceived = received;
    this.lastTotal = total;

    if (this.isDynamic) {
      if (now - this.lastRenderTime < this.throttleMs && total && received < total) {
        return;
      }
      this.lastRenderTime = now;
      this.renderDynamic(filePath, received, total, now);
    } else {
      this.renderStatic(filePath, received, total, now);
    }
  }

  public finish(summary?: string): void {
    if (!this.enabled || this.isFinished) return;
    this.isFinished = true;

    if (this.isDynamic) {
      // Clear line and write final summary or newline
      try {
        readline.cursorTo(this.stream, 0);
        readline.clearLine(this.stream, 0);
        if (summary) {
          this.stream.write(`${summary}\n`);
        }
      } catch {
        if (summary) {
          this.stream.write(`${summary}\n`);
        } else {
          this.stream.write("\n");
        }
      }
    } else if (summary) {
      this.stream.write(`${summary}\n`);
    } else if (this.lastReceived > 0) {
      const name = this.label || "file";
      const totalStr = this.lastTotal
        ? ` (${formatBytes(this.lastTotal)})`
        : ` (${formatBytes(this.lastReceived)})`;
      this.stream.write(`Download complete: ${name}${totalStr}\n`);
    }
  }


  private renderDynamic(
    filePath: string | undefined,
    received: number,
    total: number | undefined,
    now: number
  ): void {
    const elapsedSec = Math.max(0.001, (now - this.startTime) / 1000);
    const speed = received / elapsedSec;
    const speedStr = `${formatBytes(speed)}/s`;
    const cols = this.stream.columns || 80;

    let text: string;
    if (total && total > 0) {
      const ratio = received / total;
      const percentStr = `${(ratio * 100).toFixed(1)}%`;
      const sizeStr = `${formatBytes(received)} / ${formatBytes(total)}`;
      const remainingSec = (total - received) / Math.max(1, speed);
      const etaStr = `ETA ${formatDuration(remainingSec)}`;

      const prefix = filePath ? `${filePath} ` : "";
      const suffix = ` ${percentStr} (${sizeStr}) ${speedStr} ${etaStr}`;
      const availableForBar = Math.max(10, cols - prefix.length - suffix.length - 2);
      const bar = renderProgressBar(ratio, Math.min(25, availableForBar));

      text = `${prefix}${bar}${suffix}`;
    } else {
      const prefix = filePath ? `${filePath} ` : "";
      const sizeStr = formatBytes(received);
      text = `${prefix}[${sizeStr}] ${speedStr}`;
    }

    if (text.length > cols) {
      text = text.slice(0, cols - 1);
    }

    try {
      readline.cursorTo(this.stream, 0);
      this.stream.write(text);
      readline.clearLine(this.stream, 1);
    } catch {
      this.stream.write(`\r${text}`);
    }
  }

  private renderStatic(
    filePath: string | undefined,
    received: number,
    total: number | undefined,
    now: number
  ): void {
    const name = filePath || "file";

    if (!this.hasLoggedStart) {
      this.hasLoggedStart = true;
      this.lastNonTtyLogTime = now;
      if (total && total > 0) {
        this.stream.write(
          `Downloading ${name} (${formatBytes(total)})...\n`
        );
      } else {
        this.stream.write(`Downloading ${name}...\n`);
      }
      return;
    }

    if (total && total > 0) {
      const ratio = received / total;
      const milestone = Math.floor(ratio * 4); // 0 (0-24%), 1 (25-49%), 2 (50-74%), 3 (75-99%), 4 (100%)
      if (milestone > this.lastMilestone || now - this.lastNonTtyLogTime >= 3000) {
        this.lastMilestone = milestone;
        this.lastNonTtyLogTime = now;
        const percentStr = (ratio * 100).toFixed(1);
        this.stream.write(
          `Downloading ${name}: ${percentStr}% (${formatBytes(received)} / ${formatBytes(total)})\n`
        );
      }
    } else if (now - this.lastNonTtyLogTime >= 3000) {
      this.lastNonTtyLogTime = now;
      this.stream.write(
        `Downloading ${name}: ${formatBytes(received)} received\n`
      );
    }
  }
}

/**
 * Reporter for batch downloads (used by `download-version` command).
 */
export class BatchProgressReporter {
  private readonly stream: NodeJS.WriteStream;
  private readonly enabled: boolean;
  private readonly isDynamic: boolean;
  private readonly throttleMs: number;

  private startTime: number = Date.now();
  private lastRenderTime: number = 0;
  private lastLoggedCompleted: number = 0;
  private renderedLines: number = 0;
  private isFinished: boolean = false;
  private hasLoggedStart: boolean = false;

  constructor(options?: ProgressReporterOptions) {
    this.stream = options?.stream ?? process.stderr;
    this.enabled = options?.enabled !== false;
    this.isDynamic =
      options?.isDynamic !== undefined
        ? options.isDynamic
        : isProgressSupported(this.stream);
    this.throttleMs = options?.throttleMs ?? 60;
  }

  public update(progress: BatchDownloadProgress): void {
    if (!this.enabled || this.isFinished) return;

    const now = Date.now();

    if (this.isDynamic) {
      if (
        now - this.lastRenderTime < this.throttleMs &&
        progress.completedFiles + progress.failedFiles < progress.totalFiles
      ) {
        return;
      }
      this.lastRenderTime = now;
      this.renderDynamic(progress);
    } else {
      this.renderStatic(progress);
    }
  }

  public finish(summary?: string): void {
    if (!this.enabled || this.isFinished) return;
    this.isFinished = true;

    if (this.isDynamic) {
      this.clearDynamicLines();
      if (summary) {
        this.stream.write(`${summary}\n`);
      }
    } else if (summary) {
      this.stream.write(`${summary}\n`);
    }
  }

  private clearDynamicLines(): void {
    if (this.renderedLines <= 0) return;
    try {
      for (let i = 0; i < this.renderedLines; i++) {
        readline.cursorTo(this.stream, 0);
        readline.clearLine(this.stream, 0);
        if (i < this.renderedLines - 1) {
          readline.moveCursor(this.stream, 0, -1);
        }
      }
      readline.cursorTo(this.stream, 0);
    } catch {
      this.stream.write("\r");
    }
    this.renderedLines = 0;
  }


  private renderDynamic(progress: BatchDownloadProgress): void {
    const cols = this.stream.columns || 80;
    const total = Math.max(1, progress.totalFiles);
    const completed = progress.completedFiles;
    const failed = progress.failedFiles;
    const processed = completed + failed;
    const ratio = processed / total;
    const percentStr = `${(ratio * 100).toFixed(1)}%`;

    const summaryParts: string[] = [`${completed} done`];
    if (failed > 0) summaryParts.push(`${failed} failed`);
    const statusBracket = `[${summaryParts.join(", ")}]`;

    const prefix = "Files: ";
    const suffix = ` ${processed}/${total} (${percentStr}) ${statusBracket}`;
    const barWidth = Math.min(25, Math.max(8, cols - prefix.length - suffix.length - 2));
    const mainBar = renderProgressBar(ratio, barWidth);
    const mainLine = `${prefix}${mainBar}${suffix}`;

    const lines: string[] = [mainLine];

    // Show up to 3 active worker lines if concurrency > 1
    const active = progress.activeFiles.slice(0, 3);
    for (const item of active) {
      const itemRatio =
        item.totalBytes && item.totalBytes > 0
          ? item.receivedBytes / item.totalBytes
          : 0;
      const itemPercent =
        item.totalBytes && item.totalBytes > 0
          ? `${(itemRatio * 100).toFixed(0)}%`
          : "";
      const itemBytes =
        item.totalBytes && item.totalBytes > 0
          ? `${formatBytes(item.receivedBytes)}/${formatBytes(item.totalBytes)}`
          : formatBytes(item.receivedBytes);

      const activeBar =
        item.totalBytes && item.totalBytes > 0
          ? renderProgressBar(itemRatio, 12)
          : "";

      const activeSuffix = activeBar
        ? ` ${activeBar} ${itemPercent} (${itemBytes})`
        : ` (${itemBytes})`;
      const maxFileNameLen = Math.max(10, cols - activeSuffix.length - 6);
      const name =
        item.file.length > maxFileNameLen
          ? `...${item.file.slice(item.file.length - maxFileNameLen + 3)}`
          : item.file;

      lines.push(`  > ${name}${activeSuffix}`);
    }

    this.clearDynamicLines();

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.length > cols) {
        line = line.slice(0, cols - 1);
      }
      this.stream.write(i < lines.length - 1 ? `${line}\n` : line);
    }
    this.renderedLines = lines.length;
  }

  private renderStatic(progress: BatchDownloadProgress): void {
    const total = progress.totalFiles;
    const processed = progress.completedFiles + progress.failedFiles;

    if (!this.hasLoggedStart) {
      this.hasLoggedStart = true;
      this.stream.write(
        `Starting download of ${total} files...\n`
      );
      return;
    }

    if (processed > this.lastLoggedCompleted) {
      this.lastLoggedCompleted = processed;
      const ratio = processed / total;
      const percentStr = (ratio * 100).toFixed(1);
      const latest = progress.latestCompletedFile
        ? ` - ${progress.latestCompletedFile}`
        : "";
      this.stream.write(
        `[${processed}/${total}] (${percentStr}%)${latest}\n`
      );
    }
  }
}
