import { Writable } from "stream";
import {
  formatBytes,
  formatDuration,
  isProgressSupported,
  renderProgressBar,
  FileProgressReporter,
  BatchProgressReporter,
} from "../src/progress";

class MockWriteStream extends Writable {
  public output: string[] = [];
  public isTTY: boolean = false;
  public columns: number = 80;

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.output.push(chunk.toString());
    callback();
  }

  public getJoined(): string {
    return this.output.join("");
  }

  public clear(): void {
    this.output = [];
  }
}

describe("progress utilities", () => {
  describe("formatBytes", () => {
    test("handles edge cases and zero", () => {
      expect(formatBytes(-10)).toBe("0 B");
      expect(formatBytes(NaN)).toBe("0 B");
      expect(formatBytes(0)).toBe("0 B");
    });

    test("formats bytes and kilobytes", () => {
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1024)).toBe("1.00 KB");
      expect(formatBytes(1536)).toBe("1.50 KB");
      expect(formatBytes(10240)).toBe("10.0 KB");
      expect(formatBytes(102400)).toBe("100 KB");
    });

    test("formats megabytes, gigabytes, and terabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
      expect(formatBytes(10.5 * 1024 * 1024)).toBe("10.5 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
      expect(formatBytes(2.5 * 1024 * 1024 * 1024 * 1024)).toBe("2.50 TB");
    });
  });

  describe("formatDuration", () => {
    test("handles invalid numbers", () => {
      expect(formatDuration(NaN)).toBe("--:--");
      expect(formatDuration(Infinity)).toBe("--:--");
      expect(formatDuration(-5)).toBe("--:--");
    });

    test("formats seconds, minutes, and hours", () => {
      expect(formatDuration(0)).toBe("00:00");
      expect(formatDuration(45)).toBe("00:45");
      expect(formatDuration(65)).toBe("01:05");
      expect(formatDuration(3600)).toBe("1:00:00");
      expect(formatDuration(3665)).toBe("1:01:05");
    });
  });

  describe("renderProgressBar", () => {
    test("renders empty bar for <= 0 ratio", () => {
      const bar = renderProgressBar(0, 10);
      expect(bar).toBe(`[${" ".repeat(8)}]`);
    });

    test("renders full bar for >= 1 ratio", () => {
      const bar = renderProgressBar(1, 10);
      expect(bar).toBe(`[${"=".repeat(8)}]`);
    });

    test("renders intermediate progress bar", () => {
      const bar = renderProgressBar(0.5, 10);
      expect(bar).toBe("[===>    ]");
    });

    test("handles NaN ratio", () => {
      const bar = renderProgressBar(NaN, 10);
      expect(bar).toBe(`[${" ".repeat(8)}]`);
    });
  });

  describe("isProgressSupported", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    test("returns false when stream is not TTY", () => {
      const stream = { isTTY: false } as any;
      expect(isProgressSupported(stream)).toBe(false);
    });

    test("returns false when CI environment is set", () => {
      process.env.CI = "true";
      const stream = { isTTY: true } as any;
      expect(isProgressSupported(stream)).toBe(false);
    });

    test("returns false when TERM is dumb", () => {
      delete process.env.CI;
      process.env.TERM = "dumb";
      const stream = { isTTY: true } as any;
      expect(isProgressSupported(stream)).toBe(false);
    });

    test("returns true when stream is TTY, not CI, and term is normal", () => {
      delete process.env.CI;
      process.env.TERM = "xterm-256color";
      const stream = { isTTY: true } as any;
      expect(isProgressSupported(stream)).toBe(true);
    });
  });
});

describe("FileProgressReporter", () => {
  test("static mode logs start, milestones, and finish", () => {
    const mock = new MockWriteStream();
    const reporter = new FileProgressReporter({
      stream: mock as any,
      isDynamic: false,
      label: "test.dat",
    });

    // Initial chunk
    reporter.update({
      receivedBytes: 100,
      totalBytes: 1000,
    });
    expect(mock.getJoined()).toContain("Downloading test.dat (1000 B)...");

    // Milestone 50%
    reporter.update({
      receivedBytes: 500,
      totalBytes: 1000,
    });
    expect(mock.getJoined()).toContain("Downloading test.dat: 50.0%");

    // Finish
    reporter.finish("Finished test.dat");
    expect(mock.getJoined()).toContain("Finished test.dat");

    // Additional calls after finish are ignored
    mock.clear();
    reporter.update({ receivedBytes: 600, totalBytes: 1000 });
    expect(mock.getJoined()).toBe("");
  });

  test("static mode logs when totalBytes is unknown", () => {
    const mock = new MockWriteStream();
    const reporter = new FileProgressReporter({
      stream: mock as any,
      isDynamic: false,
    });

    reporter.update({ receivedBytes: 500 });
    expect(mock.getJoined()).toContain("Downloading file...");

    reporter.finish();
    expect(mock.getJoined()).toContain("Download complete: file (500 B)");
  });

  test("dynamic mode renders bar and finishes", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    mock.columns = 80;

    const reporter = new FileProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 0,
      label: "item.dat",
    });

    reporter.update({
      receivedBytes: 500,
      totalBytes: 1000,
    });

    expect(mock.getJoined()).toContain("item.dat");
    expect(mock.getJoined()).toContain("50.0%");

    reporter.finish("Done!");
    expect(mock.getJoined()).toContain("Done!");
  });

  test("dynamic mode renders without totalBytes and truncates on narrow columns", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    mock.columns = 20;

    const reporter = new FileProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 0,
      label: "very-long-filename-that-exceeds-columns.dat",
    });

    reporter.update({
      receivedBytes: 1024,
    });

    expect(mock.getJoined().length).toBeGreaterThan(0);
    reporter.finish();
  });

  test("throttles updates when within throttleMs", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    mock.columns = 80;

    const reporter = new FileProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 100000,
    });

    reporter.update({ receivedBytes: 10, totalBytes: 100 });
    const countAfterFirst = mock.output.length;

    // Second call within throttle interval
    reporter.update({ receivedBytes: 20, totalBytes: 100 });
    expect(mock.output.length).toBe(countAfterFirst);
  });

  test("handles readline error gracefully in dynamic finish", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    const reporter = new FileProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 0,
    });

    reporter.update({ receivedBytes: 100 });
    reporter.finish("Finished successfully");
    expect(mock.getJoined()).toContain("Finished successfully");
  });

  test("logs periodically in static mode when totalBytes is undefined", () => {
    const originalDateNow = Date.now;
    let fakeTime = 1000000;
    Date.now = () => fakeTime;

    try {
      const mock = new MockWriteStream();
      const reporter = new FileProgressReporter({
        stream: mock as any,
        isDynamic: false,
        label: "stream.dat",
      });

      reporter.update({ receivedBytes: 100 });
      expect(mock.getJoined()).toContain("Downloading stream.dat...");

      // Advance time by 4 seconds
      fakeTime += 4000;
      reporter.update({ receivedBytes: 5000 });
      expect(mock.getJoined()).toContain("4.88 KB received");
    } finally {

      Date.now = originalDateNow;
    }
  });

  test("disabled mode suppresses all output", () => {
    const mock = new MockWriteStream();
    const reporter = new FileProgressReporter({
      stream: mock as any,
      enabled: false,
    });

    reporter.update({ receivedBytes: 100, totalBytes: 500 });
    reporter.finish("Should not appear");
    expect(mock.getJoined()).toBe("");
  });
});

describe("BatchProgressReporter", () => {
  test("static mode logs start, completed files, and finish", () => {
    const mock = new MockWriteStream();
    const reporter = new BatchProgressReporter({
      stream: mock as any,
      isDynamic: false,
    });

    reporter.update({
      totalFiles: 2,
      completedFiles: 0,
      failedFiles: 0,
      activeFiles: [],
    });
    expect(mock.getJoined()).toContain("Starting download of 2 files...");

    reporter.update({
      totalFiles: 2,
      completedFiles: 1,
      failedFiles: 0,
      activeFiles: [],
      latestCompletedFile: "file1.dat",
    });
    expect(mock.getJoined()).toContain("[1/2] (50.0%) - file1.dat");

    reporter.finish("Batch complete");
    expect(mock.getJoined()).toContain("Batch complete");
  });

  test("dynamic mode renders main bar and active worker lines", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    mock.columns = 80;

    const reporter = new BatchProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 0,
    });

    reporter.update({
      totalFiles: 5,
      completedFiles: 2,
      failedFiles: 1,
      activeFiles: [
        { file: "active1.dat", receivedBytes: 500, totalBytes: 1000 },
        { file: "active2.dat", receivedBytes: 300 },
      ],
    });

    const output = mock.getJoined();
    expect(output).toContain("Files: ");
    expect(output).toContain("3/5");
    expect(output).toContain("2 done, 1 failed");
    expect(output).toContain("active1.dat");
    expect(output).toContain("active2.dat");

    reporter.finish("All done");
    expect(mock.getJoined()).toContain("All done");
  });

  test("dynamic mode truncates long filenames on narrow columns", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    mock.columns = 40;

    const reporter = new BatchProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 0,
    });

    reporter.update({
      totalFiles: 1,
      completedFiles: 0,
      failedFiles: 0,
      activeFiles: [
        {
          file: "very/long/nested/path/to/system/itemname-e.dat",
          receivedBytes: 100,
          totalBytes: 500,
        },
      ],
    });

    expect(mock.getJoined()).toContain("...");
    reporter.finish();
  });

  test("throttles batch updates when within throttleMs", () => {
    const mock = new MockWriteStream();
    mock.isTTY = true;
    mock.columns = 80;

    const reporter = new BatchProgressReporter({
      stream: mock as any,
      isDynamic: true,
      throttleMs: 100000,
    });

    reporter.update({
      totalFiles: 10,
      completedFiles: 1,
      failedFiles: 0,
      activeFiles: [],
    });
    const countAfterFirst = mock.output.length;

    // Second call within throttle interval (incomplete)
    reporter.update({
      totalFiles: 10,
      completedFiles: 2,
      failedFiles: 0,
      activeFiles: [],
    });
    expect(mock.output.length).toBe(countAfterFirst);
  });

  test("disabled mode suppresses all batch output", () => {
    const mock = new MockWriteStream();
    const reporter = new BatchProgressReporter({
      stream: mock as any,
      enabled: false,
    });

    reporter.update({
      totalFiles: 5,
      completedFiles: 1,
      failedFiles: 0,
      activeFiles: [],
    });
    reporter.finish("Finished");
    expect(mock.getJoined()).toBe("");
  });
});
