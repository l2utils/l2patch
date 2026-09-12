import * as net from "net";
import { EventEmitter } from "events";
import { vi, type Mock } from "vitest";

vi.mock("net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("net")>();
  return {
    ...actual,
    createConnection: vi.fn(),
  };
});
import {
  checkCurrentVersion,
  extractVersionFromJson,
  extractVersionFromText,
  queryUpdaterServer,
  queryCdnConfig,
  queryUpdaterStatus,
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
      expect(extractVersionFromJson({ version: 142 })).toBe("142");
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as unknown as Response);

      await expect(
        checkCurrentVersion({ versionUrl: "https://example.com/missing" })
      ).rejects.toThrow("Failed to check version from https://example.com/missing: 404 Not Found");
    });

    test("does not send User-Agent header in HTTP request", async () => {
      let sentHeaders: any;
      global.fetch = vi.fn().mockImplementation(async (_url, init) => {
        sentHeaders = init?.headers;
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "145" }),
        } as unknown as Response;
      });

      await checkCurrentVersion({
        versionUrl: "https://example.com/version.json",
      });

      expect(sentHeaders["User-Agent"]).toBeUndefined();
    });

    test("retries on retryable status code and recovers", async () => {
      let calls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          return {
            ok: false,
            status: 500,
            statusText: "Internal Error",
          } as unknown as Response;
        }
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "145" }),
        } as unknown as Response;
      });

      const info = await checkCurrentVersion({
        versionUrl: "https://example.com/version.json",
      });
      expect(calls).toBe(2);
      expect(info.version).toBe("145");
    });

    test("retries on network exception and recovers", async () => {
      let calls = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          throw new Error("Network blip");
        }
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "145" }),
        } as unknown as Response;
      });

      const info = await checkCurrentVersion({
        versionUrl: "https://example.com/version.json",
      });
      expect(calls).toBe(2);
      expect(info.version).toBe("145");
    });

    test("throws after retries are exhausted on network failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Fatal connection refused"));

      await expect(
        checkCurrentVersion({
          versionUrl: "https://example.com/version.json",
          maxRetries: 1,
        })
      ).rejects.toThrow("Fatal connection refused");
    });

    test("queries TCP updater daemon via queryUpdaterServer", async () => {
      const mockSocket = new EventEmitter();
      mockSocket.write = vi.fn();
      mockSocket.destroy = vi.fn();
      mockSocket.end = vi.fn();

      (net.createConnection as Mock).mockImplementation((opts: any, cb: any) => {
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
      vi.restoreAllMocks();
    });

    test("falls back to versionUrl if updaterHost query fails", async () => {
      const mockSocket = new EventEmitter();
      mockSocket.write = vi.fn();
      mockSocket.destroy = vi.fn();

      (net.createConnection as Mock).mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("TCP connection refused"));
        });
        return mockSocket;
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ version: "600" }),
      } as unknown as Response);

      const info = await checkCurrentVersion({
        updaterHost: "updater.example.com",
        versionUrl: "https://example.com/version.json",
      });

      expect(info.version).toBe("600");
      vi.restoreAllMocks();
    });

    test("re-throws TCP error when versionUrl is not configured", async () => {
      const mockSocket = new EventEmitter();
      mockSocket.write = vi.fn();
      mockSocket.destroy = vi.fn();

      (net.createConnection as Mock).mockImplementation(() => {
        process.nextTick(() => {
          mockSocket.emit("error", new Error("TCP failure"));
        });
        return mockSocket;
      });

      await expect(
        checkCurrentVersion({ updaterHost: "updater.example.com" })
      ).rejects.toThrow("TCP failure");
      vi.restoreAllMocks();
    });

    test("queryUpdaterServer handles timeout and missing tag", async () => {

      // 1. Missing tag
      const mockSocketTag = new EventEmitter();
      mockSocketTag.write = vi.fn();
      mockSocketTag.end = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
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
      mockSocketTimeout.write = vi.fn();
      mockSocketTimeout.destroy = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce(() => mockSocketTimeout);

      await expect(
        queryUpdaterServer("updater.example.com", 27500, "LINEAGE2", 20)
      ).rejects.toThrow("Timeout querying updater server");

      // 3. Single-byte version and missing hash tag
      const mockSocketSingle = new EventEmitter();
      mockSocketSingle.write = vi.fn();
      mockSocketSingle.end = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
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

      vi.restoreAllMocks();
    });
  });

  describe("queryCdnConfig", () => {
    test("queries and parses active CDN hostname and base URL", async () => {
      const mockSocket = new EventEmitter();
      mockSocket.write = vi.fn();
      mockSocket.end = vi.fn();

      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => {
          cb();
          const cdnHost = "d35293xeakkyq4.cloudfront.net";
          const buf = Buffer.concat([
            Buffer.alloc(8), // 8 byte frame header
            Buffer.from([0x12, cdnHost.length]), // tag 0x12 (length-delimited string)
            Buffer.from(cdnHost, "utf-8"),
          ]);
          mockSocket.emit("data", buf);
        });
        return mockSocket;
      });

      const result = await queryCdnConfig("updater.example.com", 27500, "LINEAGE2");
      expect(result.cdnHost).toBe("d35293xeakkyq4.cloudfront.net");
      expect(result.baseUrl).toBe("http://d35293xeakkyq4.cloudfront.net/LINEAGE2");

      // Also verify call with default port & gameId
      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
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
      const defaultResult = await queryCdnConfig("updater.example.com");
      expect(defaultResult.cdnHost).toBe("d35293xeakkyq4.cloudfront.net");
      vi.restoreAllMocks();
    });

    test("handles missing tag 0x12 in CDN response", async () => {
      const mockSocket = new EventEmitter();
      mockSocket.write = vi.fn();
      mockSocket.end = vi.fn();

      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => {
          cb();
          mockSocket.emit("data", Buffer.alloc(12)); // missing 0x12 tag
        });
        return mockSocket;
      });

      await expect(
        queryCdnConfig("updater.example.com", 27500, "LINEAGE2")
      ).rejects.toThrow("missing CDN host tag (0x12)");
      vi.restoreAllMocks();
    });

    test("handles timeout and socket error in queryCdnConfig", async () => {

      // 1. Timeout
      const mockTimeout = new EventEmitter();
      mockTimeout.write = vi.fn();
      mockTimeout.destroy = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce(() => mockTimeout);

      await expect(
        queryCdnConfig("updater.example.com", 27500, "LINEAGE2", 20)
      ).rejects.toThrow("Timeout querying CDN config");

      // 2. Socket error
      const mockError = new EventEmitter();
      mockError.write = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce(() => {
        process.nextTick(() => {
          mockError.emit("error", new Error("Socket closed"));
        });
        return mockError;
      });

      await expect(
        queryCdnConfig("updater.example.com", 27500, "LINEAGE2")
      ).rejects.toThrow("Socket closed");

      vi.restoreAllMocks();
    });
  });

  describe("queryUpdaterStatus", () => {
    test("queries status: performs 0x06 handshake then 0x04 online response", async () => {
      const mockSocket = new EventEmitter();
      const written: Buffer[] = [];
      mockSocket.write = vi.fn((data: Buffer) => {
        written.push(data);
        if (written.length === 1) {
          // Opcode 0x06 request sent -> respond with 0x06 response
          process.nextTick(() => {
            // Version 599 (varint: 0xd7, 0x04)
            const payload06 = Buffer.from([0x20, 0xd7, 0x04]);
            const header06 = Buffer.alloc(8);
            header06.writeUInt16LE(8 + payload06.length, 0); // length
            header06.writeUInt16LE(0x0006, 2); // opcode 6
            header06.writeUInt32LE(0, 4); // status 0
            mockSocket.emit("data", Buffer.concat([header06, payload06]));
          });
        } else if (written.length === 2) {
          // Opcode 0x04 request sent -> respond with 0x04 response (Online: tag 2 = 1)
          process.nextTick(() => {
            const payload04 = Buffer.from([0x0a, 0x08, ...Buffer.from("LINEAGE2"), 0x10, 0x01]);
            const header04 = Buffer.alloc(8);
            header04.writeUInt16LE(8 + payload04.length, 0);
            header04.writeUInt16LE(0x0004, 2); // opcode 4
            header04.writeUInt32LE(0, 4); // status 0 (success)
            mockSocket.emit("data", Buffer.concat([header04, payload04]));
          });
        }
      });
      mockSocket.end = vi.fn();

      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => cb());
        return mockSocket;
      });

      const result = await queryUpdaterStatus("updater.example.com", 27500, "LINEAGE2");
      expect(result.online).toBe(true);
      expect(result.status).toBe("online");
      expect(result.version).toBe("599");
      expect(result.gateStatus).toBe(1);
      expect(result.statusCode).toBe(0);

      // Verify that two packets were sent (0x06 then 0x04)
      expect(written).toHaveLength(2);
      expect(written[0].readUInt16LE(2)).toBe(0x0006);
      expect(written[1].readUInt16LE(2)).toBe(0x0004);

      vi.restoreAllMocks();
    });

    test("queries status: returns maintenance when gateStatus is 0", async () => {
      const mockSocket = new EventEmitter();
      const written: Buffer[] = [];
      mockSocket.write = vi.fn((data: Buffer) => {
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
            // tag 2 = 0 (maintenance)
            const payload04 = Buffer.from([0x0a, 0x08, ...Buffer.from("LINEAGE2"), 0x10, 0x00]);
            const header04 = Buffer.alloc(8);
            header04.writeUInt16LE(8 + payload04.length, 0);
            header04.writeUInt16LE(0x0004, 2);
            header04.writeUInt32LE(0, 4);
            mockSocket.emit("data", Buffer.concat([header04, payload04]));
          });
        }
      });
      mockSocket.end = vi.fn();

      (net.createConnection as Mock).mockImplementationOnce((opts: any, cb: any) => {
        process.nextTick(() => cb());
        return mockSocket;
      });

      const result = await queryUpdaterStatus("updater.example.com");
      expect(result.online).toBe(false);
      expect(result.status).toBe("maintenance");
      expect(result.gateStatus).toBe(0);

      vi.restoreAllMocks();
    });

    test("handles timeout and socket errors in queryUpdaterStatus", async () => {
      // 1. Timeout
      const mockTimeout = new EventEmitter();
      mockTimeout.write = vi.fn();
      mockTimeout.destroy = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce(() => mockTimeout);

      await expect(
        queryUpdaterStatus("updater.example.com", 27500, "LINEAGE2", 20)
      ).rejects.toThrow("Timeout querying updater status");

      // 2. Socket error
      const mockError = new EventEmitter();
      mockError.write = vi.fn();
      (net.createConnection as Mock).mockImplementationOnce(() => {
        process.nextTick(() => {
          mockError.emit("error", new Error("Socket disconnected"));
        });
        return mockError;
      });

      await expect(
        queryUpdaterStatus("updater.example.com", 27500, "LINEAGE2")
      ).rejects.toThrow("Socket disconnected");

      vi.restoreAllMocks();
    });
  });
});
