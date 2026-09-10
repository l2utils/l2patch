import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import {
  createCdnCommand,
  createDownloadCommand,
  createDownloadFileCommand,
  createDownloadVersionCommand,
  createFileInfoMapCommand,
  createPatchFileInfoCommand,
  createStatusCommand,
  createUpdaterCommand,
  createVersionCommand,
} from "../src/commands";

describe("CLI commands", () => {
  const originalFetch = global.fetch;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExit = process.exit;
  const originalWarn = console.warn;
  const originalLog = console.log;

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
    console.warn = originalWarn;
    console.log = originalLog;

    if (fs.existsSync(testOutDir)) {
      fs.rmSync(testOutDir, { recursive: true, force: true });
    }
  });

  describe("createUpdaterCommand and updater subcommands", () => {
    test("creates updater command with version, status, and cdn subcommands", () => {
      const cmd = createUpdaterCommand();
      expect(cmd.name()).toBe("updater");
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain("version");
      expect(subNames).toContain("status");
      expect(subNames).toContain("cdn");
    });

    test("updater version executes and outputs version", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ version: "155" }),
      } as unknown as Response);

      const logs: string[] = [];
      console.log = (msg: any) => logs.push(String(msg));

      const program = new Command();
      program.addCommand(createUpdaterCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "updater",
        "version",
        "--version-url",
        "https://example.com/version.json",
      ]);

      expect(logs).toContain("155");
    });

    test("updater status executes and outputs status", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const mockSocket = new EventEmitter();
      const written: Buffer[] = [];
      mockSocket.write = jest.fn((data: Buffer) => {
        written.push(data);
        if (written.length === 1) {
          process.nextTick(() => {
            const payload06 = Buffer.from([0x20, 0x50]); // version 80
            const header06 = Buffer.alloc(8);
            header06.writeUInt16LE(8 + payload06.length, 0);
            header06.writeUInt16LE(0x0006, 2);
            header06.writeUInt32LE(0, 4);
            mockSocket.emit("data", Buffer.concat([header06, payload06]));
          });
        } else if (written.length === 2) {
          process.nextTick(() => {
            const payload04 = Buffer.from([0x0a, 0x08, ...Buffer.from("LINEAGE2"), 0x10, 0x01]);
            const header04 = Buffer.alloc(8);
            header04.writeUInt16LE(8 + payload04.length, 0);
            header04.writeUInt16LE(0x0004, 2);
            header04.writeUInt32LE(0, 4);
            mockSocket.emit("data", Buffer.concat([header04, payload04]));
          });
        }
      });
      mockSocket.end = jest.fn();

      jest.spyOn(net, "createConnection").mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => cb());
        return mockSocket;
      });

      const logs: string[] = [];
      console.log = (msg: any) => logs.push(String(msg));

      const program = new Command();
      program.addCommand(createUpdaterCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "updater",
        "status",
        "--updater-host",
        "updater.example.com",
      ]);

      expect(logs).toContain("online");
      jest.restoreAllMocks();
    });

    test("updater status outputs json when --json is provided", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const mockSocket = new EventEmitter();
      const written: Buffer[] = [];
      mockSocket.write = jest.fn((data: Buffer) => {
        written.push(data);
        if (written.length === 1) {
          process.nextTick(() => {
            const payload06 = Buffer.from([0x20, 0x50]);
            const header06 = Buffer.alloc(8);
            header06.writeUInt16LE(8 + payload06.length, 0);
            header06.writeUInt16LE(0x0006, 2);
            header06.writeUInt32LE(0, 4);
            mockSocket.emit("data", Buffer.concat([header06, payload06]));
          });
        } else if (written.length === 2) {
          process.nextTick(() => {
            const payload04 = Buffer.from([0x0a, 0x08, ...Buffer.from("LINEAGE2"), 0x10, 0x00]);
            const header04 = Buffer.alloc(8);
            header04.writeUInt16LE(8 + payload04.length, 0);
            header04.writeUInt16LE(0x0004, 2);
            header04.writeUInt32LE(0, 4);
            mockSocket.emit("data", Buffer.concat([header04, payload04]));
          });
        }
      });
      mockSocket.end = jest.fn();

      jest.spyOn(net, "createConnection").mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => cb());
        return mockSocket;
      });

      const logs: string[] = [];
      console.log = (msg: any) => logs.push(String(msg));

      const program = new Command();
      program.addCommand(createUpdaterCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "updater",
        "status",
        "--updater-host",
        "updater.example.com",
        "--json",
      ]);

      const json = JSON.parse(logs[0]);
      expect(json.online).toBe(false);
      expect(json.status).toBe("maintenance");
      jest.restoreAllMocks();
    });

    test("updater cdn executes and outputs cdnHost", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const mockSocket = new EventEmitter();
      mockSocket.write = jest.fn();
      mockSocket.end = jest.fn();

      jest.spyOn(net, "createConnection").mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => {
          cb();
          const cdnHost = "d35293xeakkyq4.cloudfront.net";
          const buf = Buffer.concat([
            Buffer.alloc(8),
            Buffer.from([0x12, cdnHost.length]),
            Buffer.from(cdnHost, "utf-8"),
          ]);
          mockSocket.emit("data", buf);
        });
        return mockSocket;
      });

      const logs: string[] = [];
      console.log = (msg: any) => logs.push(String(msg));

      const program = new Command();
      program.addCommand(createUpdaterCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "updater",
        "cdn",
        "--updater-host",
        "updater.example.com",
      ]);

      expect(logs).toContain("d35293xeakkyq4.cloudfront.net");
      jest.restoreAllMocks();
    });
  });

  describe("createDownloadCommand and download subcommands", () => {
    test("creates download command group with file and version subcommands", () => {
      const cmd = createDownloadCommand();
      expect(cmd.name()).toBe("download");
      const subNames = cmd.commands.map((c) => c.name());
      expect(subNames).toContain("file");
      expect(subNames).toContain("version");
    });

    test("download file outputs zip to stdout with progress to stderr", async () => {
      const mockData = "dummy-zip-data";
      global.fetch = jest.fn().mockResolvedValue({
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
      program.addCommand(createDownloadCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "download",
        "file",
        "system/itemname-e.dat",
        "--base-url",
        "https://cdn.example.com",
        "--version",
        "140",
      ]);

      expect(stdoutChunks.join("")).toBe("dummy-zip-data");
      expect(stdoutChunks.join("")).not.toContain("Downloading");
      expect(stderrChunks.join("")).toContain(
        "https://cdn.example.com/140/Patch/Zip/system/itemname-e.dat.zip -> <stdout>"
      );
    });

    test("download file saves patch delta to output file", async () => {
      const mockPatch = "dummy-patch-data";
      global.fetch = jest
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
      program.addCommand(createDownloadCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "download",
        "file",
        "system/itemname-e.dat",
        "--base-url",
        "https://cdn.example.com",
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
    test("creates command with version name, aliases, filter, and out default out-dir", () => {
      const cmd = createDownloadVersionCommand();
      expect(cmd.name()).toBe("version");
      expect(cmd.aliases()).toContain("download-version");
      expect(cmd.aliases()).toContain("download-all");
      const optionNames = cmd.options.map((o) => o.name());
      expect(optionNames).toContain("filter");
      expect(optionNames).toContain("out-dir");
      expect(optionNames).toContain("progress");
      expect(optionNames).toContain("no-progress");
      expect(optionNames).toContain("base-url");

      const outDirOpt = cmd.options.find((o) => o.name() === "out-dir");
      expect(outDirOpt?.defaultValue).toBe("out");

      const filterOpt = cmd.options.find((o) => o.name() === "filter");
      expect(filterOpt?.defaultValue).toBe("default");
    });

    test("downloads full update archive with --filter all and outputs warning", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true } as Response) // HEAD probe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            Uint8Array.from(Buffer.from("archive-content")).buffer,
        } as unknown as Response);

      const warnings: string[] = [];
      console.warn = (msg: any) => warnings.push(String(msg));

      const program = new Command();
      program.addCommand(createDownloadCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "download",
        "version",
        "--version",
        "140",
        "--filter",
        "all",
        "--base-url",
        "https://cdn.example.com",
        "--out-dir",
        testOutDir,
      ]);

      const savedFile = path.join(testOutDir, "update_140.zip");
      expect(fs.existsSync(savedFile)).toBe(true);
      expect(warnings.join("\n")).toContain("WARNING: Downloading all files entails a very large download size");
    });

    test("downloads filtered database files by default without archive probe", async () => {
      const manifestText = [
        "system/itemname-e.dat",
        "system/skillname-e.dat",
        "textures/l2font.utx",
      ].join("\n");

      let downloadedUrls: string[] = [];
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        downloadedUrls.push(url);
        if (url.includes("PatchFileInfo") || url.includes("FileInfoMap")) {
          return {
            ok: true,
            status: 200,
            text: async () => manifestText,
            headers: { get: () => String(manifestText.length) },
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => "10" },
          arrayBuffer: async () => Uint8Array.from(Buffer.from("sample-data")).buffer,
        } as unknown as Response;
      });

      const program = new Command();
      program.addCommand(createDownloadCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "download",
        "version",
        "--version",
        "140",
        "--base-url",
        "https://cdn.example.com",
        "--out-dir",
        testOutDir,
        "--no-progress",
      ]);

      // Verify textures/l2font.utx was NOT downloaded
      expect(downloadedUrls.some((u) => u.includes("itemname-e.dat"))).toBe(true);
      expect(downloadedUrls.some((u) => u.includes("skillname-e.dat"))).toBe(true);
      expect(downloadedUrls.some((u) => u.includes("l2font.utx"))).toBe(false);
    });
  });

  describe("createFileInfoMapCommand and createPatchFileInfoCommand", () => {
    test("downloads FileInfoMap to stdout", async () => {
      const mockManifest = "dummy-file-info-map-data";
      let capturedUrl = "";
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
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
      program.addCommand(createFileInfoMapCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "file-info-map",
        "--base-url",
        "https://cdn.example.com",
        "-v",
        "140",
      ]);

      expect(stdoutChunks.join("")).toBe("dummy-file-info-map-data");
      expect(capturedUrl).toContain("FileInfoMap_140.dat");
    });

    test("downloads PatchFileInfo to output file", async () => {
      const mockManifest = "patch-file-info-file-content";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String(mockManifest.length) },
        arrayBuffer: async () => Uint8Array.from(Buffer.from(mockManifest)).buffer,
      } as unknown as Response);

      const dest = path.join(testOutDir, "PatchFileInfo_saved.dat");

      const program = new Command();
      program.addCommand(createPatchFileInfoCommand());

      await program.parseAsync([
        "node",
        "l2patch",
        "patch-file-info",
        "--base-url",
        "https://cdn.example.com",
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
