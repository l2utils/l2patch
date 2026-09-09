import * as fs from "fs";
import * as path from "path";
import {
  buildFullZipUrl,
  buildPatchUrl,
  buildUpdateArchiveUrl,
  buildPatchArchiveUrl,
  downloadFullZip,
  downloadPatch,
  downloadUpdate,
  downloadPatchUpdate,
  loadManifestFileList,
  parseManifestFiles,
  probeUrl,
} from "../src/downloader";

function createMockArrayBuffer(content: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(content)).buffer;
}

describe("downloader", () => {
  const originalFetch = global.fetch;
  const testOutDir = path.resolve(__dirname, ".tmp-downloads");

  beforeEach(() => {
    if (!fs.existsSync(testOutDir)) {
      fs.mkdirSync(testOutDir, { recursive: true });
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (fs.existsSync(testOutDir)) {
      fs.rmSync(testOutDir, { recursive: true, force: true });
    }
  });

  describe("URL builders", () => {
    test("buildFullZipUrl replaces tokens correctly", () => {
      const url = buildFullZipUrl("system/itemname-e.dat", "140", {
        baseUrl: "https://cdn.example.com",
      });
      expect(url).toBe("https://cdn.example.com/140/system/itemname-e.dat.zip");
    });

    test("buildPatchUrl replaces tokens correctly", () => {
      const url = buildPatchUrl("system/itemname-e.dat", "140", "142", {
        baseUrl: "https://cdn.example.com",
      });
      expect(url).toBe(
        "https://cdn.example.com/patch/140_142/system/itemname-e.dat.patch"
      );
    });

    test("buildUpdateArchiveUrl replaces tokens correctly", () => {
      const url = buildUpdateArchiveUrl("140", {
        baseUrl: "https://cdn.example.com",
      });
      expect(url).toBe("https://cdn.example.com/archives/update_140.zip");
    });

    test("buildPatchArchiveUrl replaces tokens correctly", () => {
      const url = buildPatchArchiveUrl("140", "142", {
        baseUrl: "https://cdn.example.com",
      });
      expect(url).toBe("https://cdn.example.com/archives/patch_140_to_142.zip");
    });
  });

  describe("manifest parser & loader", () => {
    test("parses json array of string paths", () => {
      const json = JSON.stringify(["system/a.dat", "system/b.dat"]);
      expect(parseManifestFiles(json)).toEqual(["system/a.dat", "system/b.dat"]);
    });

    test("parses json object with files array", () => {
      const json = JSON.stringify({
        files: [{ path: "system/itemname.dat" }, { file: "system/skillname.dat" }],
      });
      expect(parseManifestFiles(json)).toEqual([
        "system/itemname.dat",
        "system/skillname.dat",
      ]);
    });

    test("parses plain text line list", () => {
      const txt = "# Comments\nsystem/a.dat\n\nsystem/b.dat\n";
      expect(parseManifestFiles(txt)).toEqual(["system/a.dat", "system/b.dat"]);
    });

    test("loadManifestFileList loads from local file", async () => {
      const localManifest = path.join(testOutDir, "manifest.txt");
      fs.writeFileSync(localManifest, "system/local.dat\nsystem/local2.dat");
      const files = await loadManifestFileList(localManifest);
      expect(files).toEqual(["system/local.dat", "system/local2.dat"]);
    });

    test("loadManifestFileList loads from remote URL", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(["system/remote.dat"]),
      } as unknown as Response);

      const files = await loadManifestFileList(
        "https://cdn.example.com/manifest.json",
        "token"
      );
      expect(files).toEqual(["system/remote.dat"]);
    });

    test("loadManifestFileList throws on 404 remote URL", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as unknown as Response);

      await expect(
        loadManifestFileList("https://cdn.example.com/missing.json")
      ).rejects.toThrow("Failed to fetch manifest from");
    });

    test("loadManifestFileList throws on missing local file", async () => {
      await expect(
        loadManifestFileList(path.join(testOutDir, "nonexistent.txt"))
      ).rejects.toThrow("Manifest file not found");
    });
  });

  describe("probeUrl", () => {
    test("returns true when HEAD succeeds", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response);

      const exists = await probeUrl("https://example.com/test.patch", "token123");
      expect(exists).toBe(true);
    });

    test("falls back to GET Range when HEAD returns 405", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 405,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 206,
        } as unknown as Response);

      const exists = await probeUrl("https://example.com/test.patch");
      expect(exists).toBe(true);
    });

    test("returns false when response is 404", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const exists = await probeUrl("https://example.com/missing.patch");
      expect(exists).toBe(false);
    });

    test("returns false on network error", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
      const exists = await probeUrl("https://example.com/test.patch");
      expect(exists).toBe(false);
    });
  });

  describe("downloadFullZip", () => {
    test("downloads full zip with explicit version", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("PK-mock-zip-content"),
      } as unknown as Response);

      const savedPath = await downloadFullZip("system/itemname-e.dat", {
        version: "140",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com", authToken: "auth1" },
      });

      expect(fs.existsSync(savedPath)).toBe(true);
      expect(fs.readFileSync(savedPath).toString()).toBe("PK-mock-zip-content");
      expect(savedPath).toContain("itemname-e.dat_140.zip");
    });

    test("creates destination directory recursively if it does not exist", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("PK-nested"),
      } as unknown as Response);

      const nestedOutDir = path.join(testOutDir, "sub1", "sub2");
      const savedPath = await downloadFullZip("system/test.dat", {
        version: "140",
        outDir: nestedOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(fs.existsSync(savedPath)).toBe(true);
      expect(savedPath).toContain("sub2");
    });

    test("throws when download returns non-200", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
      } as unknown as Response);

      await expect(
        downloadFullZip("system/itemname-e.dat", {
          version: "140",
          outDir: testOutDir,
          config: { baseUrl: "https://cdn.example.com" },
        })
      ).rejects.toThrow("Failed to download from https://cdn.example.com/140/system/itemname-e.dat.zip: 500 Server Error");
    });

    test("downloads latest version automatically when latest: true", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "155" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("PK-latest-zip"),
        } as unknown as Response);

      const savedPath = await downloadFullZip("system/itemname-e.dat", {
        latest: true,
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(fs.existsSync(savedPath)).toBe(true);
      expect(savedPath).toContain("itemname-e.dat_155.zip");
    });
  });

  describe("downloadPatch", () => {
    test("downloads direct patch when direct N -> M patch exists", async () => {
      global.fetch = jest
        .fn()
        // HEAD probe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // GET download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("direct-patch-bytes"),
        } as unknown as Response);

      const result = await downloadPatch("system/itemname-e.dat", {
        fromVersion: "100",
        toVersion: "105",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.isDirect).toBe(true);
      expect(result.strategy).toBe("direct");
      expect(result.downloadedFiles.length).toBe(1);
      expect(fs.existsSync(result.downloadedFiles[0])).toBe(true);
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].from).toBe("100");
      expect(result.steps[0].to).toBe("105");
    });

    test("falls back to incremental chain when direct patch is 404", async () => {
      global.fetch = jest
        .fn()
        // 1. Direct probe 100 -> 102 (404)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response)
        // 2. Incremental step 100 -> 101 probe (200)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // 3. Incremental step 100 -> 101 download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("step-1-patch"),
        } as unknown as Response)
        // 4. Incremental step 101 -> 102 probe (200)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // 5. Incremental step 101 -> 102 download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("step-2-patch"),
        } as unknown as Response);

      const result = await downloadPatch("system/itemname-e.dat", {
        fromVersion: "100",
        toVersion: "102",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.isDirect).toBe(false);
      expect(result.strategy).toBe("incremental");
      expect(result.downloadedFiles.length).toBe(2);
      expect(result.steps.length).toBe(2);
      expect(result.steps[0]).toEqual(
        expect.objectContaining({ from: "100", to: "101" })
      );
      expect(result.steps[1]).toEqual(
        expect.objectContaining({ from: "101", to: "102" })
      );
    });

    test("throws if non-numeric versions have no direct patch", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        downloadPatch("system/itemname-e.dat", {
          fromVersion: "alpha",
          toVersion: "beta",
          outDir: testOutDir,
          config: { baseUrl: "https://cdn.example.com" },
        })
      ).rejects.toThrow("No direct patch found");
    });

    test("throws if incremental step is missing", async () => {
      global.fetch = jest
        .fn()
        // Direct probe fails
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response)
        // Incremental step probe fails
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response);

      await expect(
        downloadPatch("system/itemname-e.dat", {
          fromVersion: "100",
          toVersion: "102",
          outDir: testOutDir,
          config: { baseUrl: "https://cdn.example.com" },
        })
      ).rejects.toThrow("Incremental patch step 100 -> 101 does not exist");
    });
  });

  describe("downloadUpdate (entire patch update)", () => {
    test("downloads consolidated archive when available", async () => {
      global.fetch = jest
        .fn()
        // HEAD probe on archive (200)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // GET archive download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("PK-update-archive"),
        } as unknown as Response);

      const result = await downloadUpdate({
        version: "140",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.mode).toBe("archive");
      expect(result.downloadedFiles.length).toBe(1);
      expect(result.downloadedFiles[0]).toContain("update_140.zip");
      expect(fs.existsSync(result.downloadedFiles[0])).toBe(true);
    });

    test("downloads files from fileList if provided", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("PK-file-zip"),
      } as unknown as Response);

      const result = await downloadUpdate({
        version: "140",
        fileList: ["system/itemname-e.dat", "system/skillname-e.dat"],
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.mode).toBe("manifest");
      expect(result.downloadedFiles.length).toBe(2);
      expect(result.totalFiles).toBe(2);
      expect(result.failedFiles.length).toBe(0);
    });

    test("downloads update resolving latest version automatically and throttles concurrency", async () => {
      global.fetch = jest
        .fn()
        // 1. checkCurrentVersion
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "160" }),
        } as unknown as Response)
        // 2. probe archive (returns false so it falls back to manifest)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response)
        // 3. fetch manifest
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(["system/f1.dat", "system/f2.dat"]),
        } as unknown as Response)
        // 4. download f1
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("f1"),
        } as unknown as Response)
        // 5. download f2
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("f2"),
        } as unknown as Response);

      const result = await downloadUpdate({
        latest: true,
        concurrency: 1,
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.version).toBe("160");
      expect(result.downloadedFiles.length).toBe(2);
    });

    test("handles partial failures during manifest bulk download", async () => {
      global.fetch = jest
        .fn()
        // First file succeeds
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("PK-ok"),
        } as unknown as Response)
        // Second file fails
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
        } as unknown as Response);

      const result = await downloadUpdate({
        version: "140",
        fileList: ["system/ok.dat", "system/missing.dat"],
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.downloadedFiles.length).toBe(1);
      expect(result.failedFiles.length).toBe(1);
      expect(result.failedFiles[0].file).toBe("system/missing.dat");
    });

    test("throws if resolved file list is empty", async () => {
      global.fetch = jest
        .fn()
        // Archive probe returns 404
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response)
        // Manifest fetch returns empty array
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "[]",
        } as unknown as Response);

      await expect(
        downloadUpdate({
          version: "140",
          outDir: testOutDir,
          config: { baseUrl: "https://cdn.example.com" },
        })
      ).rejects.toThrow("No files found to download for update version 140");
    });
  });

  describe("downloadPatchUpdate (entire patch update deltas)", () => {
    test("downloads consolidated patch archive when available", async () => {
      global.fetch = jest
        .fn()
        // HEAD probe on patch archive (200)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // GET patch archive download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("PK-patch-archive"),
        } as unknown as Response);

      const result = await downloadPatchUpdate({
        fromVersion: "140",
        toVersion: "142",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.mode).toBe("archive");
      expect(result.downloadedFiles.length).toBe(1);
      expect(result.downloadedFiles[0]).toContain("patch_140_to_142.zip");
    });

    test("downloads patches from fileList when archive is not available", async () => {
      global.fetch = jest
        .fn()
        // Direct probe for patch 1: 200
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // Download patch 1: 200
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("patch-1"),
        } as unknown as Response);

      const result = await downloadPatchUpdate({
        fromVersion: "140",
        toVersion: "142",
        fileList: ["system/itemname-e.dat"],
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.mode).toBe("manifest");
      expect(result.downloadedFiles.length).toBe(1);
    });

    test("handles partial failures during bulk patch download", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await downloadPatchUpdate({
        fromVersion: "alpha",
        toVersion: "beta",
        fileList: ["system/broken.dat"],
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.failedFiles.length).toBe(1);
      expect(result.failedFiles[0].file).toBe("system/broken.dat");
    });

    test("throws if bulk patch file list is empty", async () => {
      global.fetch = jest
        .fn()
        // Archive probe returns 404
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response)
        // Manifest fetch returns empty
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "[]",
        } as unknown as Response);

      await expect(
        downloadPatchUpdate({
          fromVersion: "140",
          toVersion: "142",
          outDir: testOutDir,
          config: { baseUrl: "https://cdn.example.com" },
        })
      ).rejects.toThrow("No files found to patch between 140 and 142");
    });
  });
});
