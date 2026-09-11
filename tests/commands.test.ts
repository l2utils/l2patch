import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import {
  createDownloadCommand,
  createDownloadVersionCommand,
  createFileInfoMapCommand,
  createPatchFileInfoCommand,
} from "../src/commands";

describe("CLI commands", () => {
  const originalFetch = global.fetch;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExit = process.exit;

  const testOutDir = path.resolve(__dirname, ".tmp-commands-test");

  beforeEach(() => {
    if (!fs.existsSync(testOutDir)) {
      fs.mkdirSync(testOutDir, { recursive: true });
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exit = originalExit;

    if (fs.existsSync(testOutDir)) {
      fs.rmSync(testOutDir, { recursive: true, force: true });
    }
  });

  describe("createDownloadCommand", () => {
    test("creates command with progress options", () => {
      const cmd = createDownloadCommand();
      expect(cmd.name()).toBe("download");
      const optionNames = cmd.options.map((o) => o.name());
      expect(optionNames).toContain("progress");
      expect(optionNames).toContain("no-progress");
    });

    test("downloads full zip to stdout and directs progress to stderr", async () => {
      const mockData = "dummy-zip-data";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => String(mockData.length),
        },
        arrayBuffer: async () => Uint8Array.from(Buffer.from(mockData)).buffer,
      } as unknown as Response);

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      process.stdout.write = ((chunk: any) => {
        stdoutChunks.push(chunk.toString());
        return true;
      }) as any;

      process.stderr.write = ((chunk: any) => {
        stderrChunks.push(chunk.toString());
        return true;
      }) as any;

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createDownloadCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "download",
        "system/itemname-e.dat",
        "--version",
        "140",
      ]);

      expect(stdoutChunks.join("")).toBe("dummy-zip-data");
      // stdout must NOT contain progress strings
      expect(stdoutChunks.join("")).not.toContain("Downloading");
      // stderr must contain download log with source -> destination, filesize, speed
      expect(stderrChunks.join("")).toContain(
        "https://cdn.example.com/140/Patch/Zip/system/itemname-e.dat.zip -> <stdout>"
      );
      expect(stderrChunks.join("")).toContain("14 B");
    });

    test("downloads patch delta to output file", async () => {
      const mockPatch = "dummy-patch-data";
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true } as Response) // HEAD probe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => String(mockPatch.length) },
          arrayBuffer: async () => Uint8Array.from(Buffer.from(mockPatch)).buffer,
        } as unknown as Response);

      const dest = path.join(testOutDir, "saved.patch");

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createDownloadCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "download",
        "system/itemname-e.dat",
        "--patch",
        "--from",
        "140",
        "--to",
        "142",
        "--output",
        dest,
        "--no-progress",
      ]);

      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, "utf-8")).toBe("dummy-patch-data");
    });
  });

  describe("createDownloadVersionCommand", () => {
    test("creates command with progress options", () => {
      const cmd = createDownloadVersionCommand();
      expect(cmd.name()).toBe("download-version");
      expect(cmd.aliases()).toContain("download-all");
      const optionNames = cmd.options.map((o) => o.name());
      expect(optionNames).toContain("progress");
      expect(optionNames).toContain("no-progress");
    });

    test("downloads full update archive with progress", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true } as Response) // HEAD probe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            Uint8Array.from(Buffer.from("archive-content")).buffer,
        } as unknown as Response);

      const stderrChunks: string[] = [];
      process.stderr.write = ((chunk: any) => {
        stderrChunks.push(chunk.toString());
        return true;
      }) as any;

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createDownloadVersionCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "download-version",
        "--version",
        "140",
        "--out-dir",
        testOutDir,
      ]);

      const savedFile = path.join(testOutDir, "update_140.zip");
      expect(fs.existsSync(savedFile)).toBe(true);
    });

    test("accepts --file-info-map, --patch-file-info, and --manifest-type options", () => {
      const cmd = createDownloadVersionCommand();
      const optionNames = cmd.options.map((o) => o.name());
      expect(optionNames).toContain("manifest");
      expect(optionNames).toContain("file-info-map");
      expect(optionNames).toContain("patch-file-info");
      expect(optionNames).toContain("manifest-type");
    });
  });

  describe("createFileInfoMapCommand", () => {
    test("creates command with options and alias", () => {
      const cmd = createFileInfoMapCommand();
      expect(cmd.name()).toBe("file-info-map");
      expect(cmd.aliases()).toContain("manifest");
      const optionNames = cmd.options.map((o) => o.name());
      expect(optionNames).toContain("version");
      expect(optionNames).toContain("latest");
      expect(optionNames).toContain("output");
      expect(optionNames).toContain("progress");
      expect(optionNames).toContain("no-progress");
    });

    test("downloads FileInfoMap to stdout", async () => {
      const mockManifest = "dummy-file-info-map-data";
      let capturedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => String(mockManifest.length) },
          arrayBuffer: async () => Uint8Array.from(Buffer.from(mockManifest)).buffer,
        } as unknown as Response;
      });

      const stdoutChunks: string[] = [];
      process.stdout.write = ((chunk: any) => {
        stdoutChunks.push(chunk.toString());
        return true;
      }) as any;

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createFileInfoMapCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "file-info-map",
        "-v",
        "140",
      ]);

      expect(stdoutChunks.join("")).toBe("dummy-file-info-map-data");
      expect(capturedUrl).toContain("FileInfoMap_140.dat");
    });

    test("downloads FileInfoMap to output file", async () => {
      const mockManifest = "file-info-map-file-content";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String(mockManifest.length) },
        arrayBuffer: async () => Uint8Array.from(Buffer.from(mockManifest)).buffer,
      } as unknown as Response);

      const dest = path.join(testOutDir, "FileInfoMap_saved.dat");

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createFileInfoMapCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "file-info-map",
        "-v",
        "140",
        "-o",
        dest,
        "--no-progress",
      ]);

      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, "utf-8")).toBe("file-info-map-file-content");
    });
  });

  describe("createPatchFileInfoCommand", () => {
    test("creates command with options", () => {
      const cmd = createPatchFileInfoCommand();
      expect(cmd.name()).toBe("patch-file-info");
      const optionNames = cmd.options.map((o) => o.name());
      expect(optionNames).toContain("version");
      expect(optionNames).toContain("latest");
      expect(optionNames).toContain("output");
      expect(optionNames).toContain("progress");
      expect(optionNames).toContain("no-progress");
    });

    test("downloads PatchFileInfo to stdout", async () => {
      const mockManifest = "dummy-patch-file-info-data";
      let capturedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: { get: () => String(mockManifest.length) },
          arrayBuffer: async () => Uint8Array.from(Buffer.from(mockManifest)).buffer,
        } as unknown as Response;
      });

      const stdoutChunks: string[] = [];
      process.stdout.write = ((chunk: any) => {
        stdoutChunks.push(chunk.toString());
        return true;
      }) as any;

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createPatchFileInfoCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "patch-file-info",
        "-v",
        "140",
      ]);

      expect(stdoutChunks.join("")).toBe("dummy-patch-file-info-data");
      expect(capturedUrl).toContain("PatchFileInfo_140.dat");
    });

    test("downloads PatchFileInfo to output file", async () => {
      const mockManifest = "patch-file-info-file-content";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String(mockManifest.length) },
        arrayBuffer: async () => Uint8Array.from(Buffer.from(mockManifest)).buffer,
      } as unknown as Response);

      const dest = path.join(testOutDir, "PatchFileInfo_saved.dat");

      const program = new Command();
      program.option("--base-url <url>");
      program.addCommand(createPatchFileInfoCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "--base-url",
        "https://cdn.example.com",
        "patch-file-info",
        "-v",
        "140",
        "-o",
        dest,
      ]);

      expect(fs.existsSync(dest)).toBe(true);
      expect(fs.readFileSync(dest, "utf-8")).toBe("patch-file-info-file-content");
    });
  });
});
