import {
  checkCurrentVersion,
  extractVersionFromJson,
  extractVersionFromText,
} from "../src/version";

describe("version", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("extractVersionFromJson", () => {
    test("extracts string directly", () => {
      expect(extractVersionFromJson("1.0.0")).toBe("1.0.0");
    });

    test("extracts number directly", () => {
      expect(extractVersionFromJson(142)).toBe("142");
    });

    test("extracts from version property", () => {
      expect(extractVersionFromJson({ version: "142" })).toBe("142");
    });

    test("extracts from patchVersion property", () => {
      expect(extractVersionFromJson({ patchVersion: "2026-09-08" })).toBe("2026-09-08");
    });

    test("extracts from build property", () => {
      expect(extractVersionFromJson({ build: 540 })).toBe("540");
    });

    test("throws if no version candidate found", () => {
      expect(() => extractVersionFromJson({ random: "field" })).toThrow(
        "Unable to locate a version identifier"
      );
    });
  });

  describe("extractVersionFromText", () => {
    test("extracts INI style version=123", () => {
      const ini = "[Patch]\nversion = 142\nstatus=ok";
      expect(extractVersionFromText(ini)).toBe("142");
    });

    test("extracts first non-empty line if no key=value match", () => {
      const txt = "\n\n142.5\n";
      expect(extractVersionFromText(txt)).toBe("142.5");
    });

    test("throws on empty string", () => {
      expect(() => extractVersionFromText("")).toThrow("Version response was empty");
    });
  });

  describe("checkCurrentVersion", () => {
    test("fetches and parses JSON response", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ version: "145", timestamp: "2026-09-08T00:00:00Z" }),
      } as unknown as Response);

      const info = await checkCurrentVersion({
        versionUrl: "https://example.com/version.json",
        authToken: "tok123",
      });

      expect(info.version).toBe("145");
      expect(info.timestamp).toBe("2026-09-08T00:00:00Z");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/version.json",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok123" }),
        })
      );
    });

    test("fetches and parses plain text response", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/plain" }),
        text: async () => "version=150",
      } as unknown as Response);

      const info = await checkCurrentVersion({
        versionUrl: "https://example.com/patch.ini",
      });

      expect(info.version).toBe("150");
    });

    test("extracts numeric candidate in object", () => {
      expect(extractVersionFromJson({ patchVersion: 999 })).toBe("999");
    });

    test("fetches version when content-type header is null", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: async () => "build = 300",
      } as unknown as Response);

      const info = await checkCurrentVersion({
        versionUrl: "https://example.com/ver",
      });
      expect(info.version).toBe("300");
    });

    test("falls back to text when json starts with { but is invalid", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: async () => "{ broken json \n version = 400",
      } as unknown as Response);

      const info = await checkCurrentVersion({
        versionUrl: "https://example.com/ver",
      });
      expect(info.version).toBe("400");
    });

    test("throws on HTTP error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as unknown as Response);

      await expect(
        checkCurrentVersion({ versionUrl: "https://example.com/missing" })
      ).rejects.toThrow("Failed to check version from https://example.com/missing: 404 Not Found");
    });

    test("queries TCP updater daemon via queryUpdaterServer", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const mockSocket = new EventEmitter();
      mockSocket.write = jest.fn();
      mockSocket.destroy = jest.fn();
      mockSocket.end = jest.fn();

      jest.spyOn(net, "createConnection").mockImplementation((opts: any, cb: any) => {
        process.nextTick(() => {
          cb();
          // Response payload: header (8 bytes) + varint tag 0x20 version 599 + tag 0x52 hash
          // 599 = 0x257 -> varint bytes: 0xd7, 0x04
          const hashStr = "2e5091edd712fdb36557fccf9f93e415408df9b0";
          const buf = Buffer.concat([
            Buffer.alloc(8), // 8 byte frame header
            Buffer.from([0x20, 0xd7, 0x04]), // tag 0x20 (version 599)
            Buffer.from([0x52, hashStr.length]), // tag 0x52 (hash len)
            Buffer.from(hashStr, "utf-8"),
          ]);
          mockSocket.emit("data", buf);
        });
        return mockSocket;
      });

      const info = await checkCurrentVersion({
        updaterHost: "updater.example.com",
      });

      expect(info.version).toBe("599");
      expect(info.manifestHash).toBe("2e5091edd712fdb36557fccf9f93e415408df9b0");
      jest.restoreAllMocks();
    });

    test("falls back to versionUrl if updaterHost query fails", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const mockSocket = new EventEmitter();
      mockSocket.write = jest.fn();
      mockSocket.destroy = jest.fn();

      jest.spyOn(net, "createConnection").mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("TCP connection refused"));
        });
        return mockSocket;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ version: "600" }),
      } as unknown as Response);

      const info = await checkCurrentVersion({
        updaterHost: "updater.example.com",
        versionUrl: "https://example.com/version.json",
      });

      expect(info.version).toBe("600");
      jest.restoreAllMocks();
    });

    test("re-throws TCP error when versionUrl is not configured", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const mockSocket = new EventEmitter();
      mockSocket.write = jest.fn();
      mockSocket.destroy = jest.fn();

      jest.spyOn(net, "createConnection").mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("TCP failure"));
        });
        return mockSocket;
      });

      await expect(
        checkCurrentVersion({ updaterHost: "updater.example.com" })
      ).rejects.toThrow("TCP failure");
      jest.restoreAllMocks();
    });

    test("queryUpdaterServer handles timeout and missing tag", async () => {
      const { EventEmitter } = require("events");
      const net = require("net");
      const { queryUpdaterServer } = require("../src/version");

      // 1. Missing tag
      const mockSocketTag = new EventEmitter();
      mockSocketTag.write = jest.fn();
      mockSocketTag.end = jest.fn();
      jest.spyOn(net, "createConnection").mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => {
          cb();
          mockSocketTag.emit("data", Buffer.alloc(12)); // no 0x20 tag
        });
        return mockSocketTag;
      });

      await expect(
        queryUpdaterServer("updater.example.com", 27500, "LINEAGE2", 2000)
      ).rejects.toThrow("missing version tag");

      // 2. Timeout
      const mockSocketTimeout = new EventEmitter();
      mockSocketTimeout.write = jest.fn();
      mockSocketTimeout.destroy = jest.fn();
      jest.spyOn(net, "createConnection").mockImplementationOnce(() => mockSocketTimeout);

      await expect(
        queryUpdaterServer("updater.example.com", 27500, "LINEAGE2", 20)
      ).rejects.toThrow("Timeout querying updater server");

      // 3. Single-byte version and missing hash tag
      const mockSocketSingle = new EventEmitter();
      mockSocketSingle.write = jest.fn();
      mockSocketSingle.end = jest.fn();
      jest.spyOn(net, "createConnection").mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => {
          cb();
          // tag 0x20 followed by 0x50 (80, bit 7 not set), no tag 0x52
          const buf = Buffer.concat([
            Buffer.alloc(8),
            Buffer.from([0x20, 0x50]),
          ]);
          mockSocketSingle.emit("data", buf);
        });
        return mockSocketSingle;
      });

      const singleResult = await queryUpdaterServer("updater.example.com");
      expect(singleResult.version).toBe("80");
      expect(singleResult.manifestHash).toBe("");

      jest.restoreAllMocks();
    });
  });
});
