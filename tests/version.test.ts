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
  });
});
