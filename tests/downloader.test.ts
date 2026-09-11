import * as fs from "fs";
import * as path from "path";
import {
  buildFullZipUrl,
  buildManifestUrl,
  buildFileInfoMapUrl,
  buildPatchFileInfoUrl,
  buildPatchUrl,
  buildUpdateArchiveUrl,
  buildPatchArchiveUrl,
  downloadFullZip,
  downloadManifest,
  downloadFileInfoMap,
  downloadPatchFileInfo,
  downloadPatch,
  downloadPatchUpdate,
  downloadToBuffer,
  downloadToFile,
  downloadUpdate,
  fetchFullZip,
  fetchManifest,
  fetchFileInfoMap,
  fetchPatchFileInfo,
  fetchPatch,
  fetchWithRetry,
  loadManifestFileList,
  parseManifestFiles,
  parseRetryAfter,
  probeUrl,
  runWithConcurrency,
  NC_CDN_HEADERS,
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

    test("buildManifestUrl formats default URL with gameId", () => {
      const url = buildManifestUrl("140", {
        baseUrl: "https://cdn.example.com",
        gameId: "LINEAGE2",
      });
      expect(url).toBe(
        "https://cdn.example.com/140/Patch/PatchFileInfo_LINEAGE2_140.dat"
      );
    });

    test("buildManifestUrl formats filemap URL without gameId", () => {
      const url = buildManifestUrl(
        "140",
        {
          baseUrl: "https://cdn.example.com",
        },
        "filemap"
      );
      expect(url).toBe("https://cdn.example.com/140/Patch/FileInfoMap_140.dat");
    });

    test("buildManifestUrl respects custom template", () => {
      const url = buildManifestUrl(
        "140",
        {
          baseUrl: "https://cdn.example.com",
          gameId: "LINEAGE2",
          manifestUrlTemplate:
            "{baseUrl}/custom/{gameId}_{version}_{type}.txt",
        },
        "patch"
      );
      expect(url).toBe("https://cdn.example.com/custom/LINEAGE2_140_patch.txt");
    });

    test("buildManifestUrl respects custom template when gameId is undefined", () => {
      const url = buildManifestUrl(
        "140",
        {
          baseUrl: "https://cdn.example.com",
          manifestUrlTemplate:
            "{baseUrl}/custom/{gameId}_{version}_{type}.txt",
        },
        "patch"
      );
      expect(url).toBe("https://cdn.example.com/custom/_140_patch.txt");
    });

    test("buildFileInfoMapUrl builds FileInfoMap URL", () => {
      const url = buildFileInfoMapUrl("140", {
        baseUrl: "https://cdn.example.com",
        gameId: "LINEAGE2",
      });
      expect(url).toBe(
        "https://cdn.example.com/140/Patch/FileInfoMap_LINEAGE2_140.dat"
      );
    });

    test("buildPatchFileInfoUrl builds PatchFileInfo URL", () => {
      const url = buildPatchFileInfoUrl("140", {
        baseUrl: "https://cdn.example.com",
        gameId: "LINEAGE2",
      });
      expect(url).toBe(
        "https://cdn.example.com/140/Patch/PatchFileInfo_LINEAGE2_140.dat"
      );
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

    test("parses Lineage 2 colon-delimited FileInfoMap and PatchFileInfo lines", () => {
      const txt = [
        "Zip\\system\\ItemName_Classic-e.dat.zip:469599:7b05db:1",
        "598\\system\\Skillgrp.dat.dlt.zip:14812:b36142:3",
        "system\\item_baseinfo_ClassicAden.dat:1260389:e894c0:0",
      ].join("\n");

      expect(parseManifestFiles(txt)).toEqual([
        "system/ItemName_Classic-e.dat",
        "system/Skillgrp.dat",
        "system/item_baseinfo_ClassicAden.dat",
      ]);
    });

    test("loadManifestFileList loads UTF-16LE BOM encoded local file", async () => {
      const localManifest = path.join(testOutDir, "manifest_utf16.dat");
      const bom = Buffer.from([0xff, 0xfe]);
      const content = Buffer.from("system\\bom_test.dat:100:sha:0\r\n", "utf16le");
      fs.writeFileSync(localManifest, Buffer.concat([bom, content]));

      const files = await loadManifestFileList(localManifest);
      expect(files).toEqual(["system/bom_test.dat"]);
    });

    test("loadManifestFileList loads UTF-16LE BOM encoded remote URL", async () => {
      const bom = Buffer.from([0xff, 0xfe]);
      const content = Buffer.from("system\\remote_bom.dat:200:sha:0\r\n", "utf16le");
      const rawBuffer = Buffer.concat([bom, content]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () =>
          rawBuffer.buffer.slice(
            rawBuffer.byteOffset,
            rawBuffer.byteOffset + rawBuffer.byteLength
          ),
      } as unknown as Response);

      const files = await loadManifestFileList("https://cdn.example.com/manifest.dat");
      expect(files).toEqual(["system/remote_bom.dat"]);
    });

    test("loadManifestFileList loads from local file", async () => {
      const localManifest = path.join(testOutDir, "manifest.txt");
      fs.writeFileSync(localManifest, "system/local.dat\nsystem/local2.dat");
      const files = await loadManifestFileList(localManifest);
      expect(files).toEqual(["system/local.dat", "system/local2.dat"]);
    });

    test("loadManifestFileList loads from remote URL", async () => {
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response);

      const exists = await probeUrl("https://example.com/test.patch", "token123");
      expect(exists).toBe(true);
    });

    test("falls back to GET Range when HEAD returns 405", async () => {
      global.fetch = vi
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const exists = await probeUrl("https://example.com/missing.patch");
      expect(exists).toBe(false);
    });

    test("returns false on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));
      const exists = await probeUrl("https://example.com/test.patch");
      expect(exists).toBe(false);
    });

    test("sends auth token in headers when provided", async () => {
      let authHeader: string | undefined;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        authHeader = opts?.headers?.Authorization;
        return { ok: true } as unknown as Response;
      });

      const exists = await probeUrl("https://example.com/test.patch", "my-secret-token");
      expect(exists).toBe(true);
      expect(authHeader).toBe("Bearer my-secret-token");
    });
  });

  describe("downloadFullZip", () => {
    test("downloads full zip with explicit version", async () => {
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi.fn().mockResolvedValue({
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
      ).rejects.toThrow("Failed to download from https://cdn.example.com/140/Patch/Zip/system/itemname-e.dat.zip: 500 Server Error");
    });

    test("downloads latest version automatically when latest: true", async () => {
      global.fetch = vi
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

  describe("downloadManifest", () => {
    test("downloads manifest with explicit version and gameId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("manifest content"),
      } as unknown as Response);

      const saved = await downloadManifest("140", {
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(saved).toBe(path.join(testOutDir, "PatchFileInfo_LINEAGE2_140.dat"));
      expect(fs.readFileSync(saved, "utf-8")).toBe("manifest content");
    });

    test("downloads filemap manifest without gameId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("filemap content"),
      } as unknown as Response);

      const saved = await downloadManifest("140", {
        type: "filemap",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(saved).toBe(path.join(testOutDir, "FileInfoMap_140.dat"));
      expect(fs.readFileSync(saved, "utf-8")).toBe("filemap content");
    });

    test("downloads latest manifest when version not provided", async () => {
      global.fetch = vi
        .fn()
        // Version check call
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "155" }),
        } as unknown as Response)
        // Download call
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("latest manifest"),
        } as unknown as Response);

      const saved = await downloadManifest(undefined, {
        latest: true,
        outDir: testOutDir,
        config: {
          baseUrl: "https://cdn.example.com",
          versionUrl: "https://cdn.example.com/version.json",
          gameId: "LINEAGE2",
        },
      });

      expect(saved).toBe(path.join(testOutDir, "PatchFileInfo_LINEAGE2_155.dat"));
      expect(fs.readFileSync(saved, "utf-8")).toBe("latest manifest");
    });
  });

  describe("downloadPatch", () => {
    test("downloads direct patch when direct N -> M patch exists", async () => {
      global.fetch = vi
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
      global.fetch = vi
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi
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

  describe("fetch methods (in-memory buffer output)", () => {
    test("fetchFullZip returns buffer with explicit version", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("PK-buffer-zip"),
      } as unknown as Response);

      const buffer = await fetchFullZip("system/test.dat", {
        version: "140",
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe("PK-buffer-zip");
    });

    test("fetchFullZip resolves latest version automatically", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "150" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("PK-latest-buffer"),
        } as unknown as Response);

      const buffer = await fetchFullZip("system/test.dat", {
        latest: true,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(buffer.toString()).toBe("PK-latest-buffer");
    });

    test("fetchManifest returns buffer", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("manifest-buffer"),
      } as unknown as Response);

      const buffer = await fetchManifest("140", {
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(buffer.toString()).toBe("manifest-buffer");
    });

    test("fetchManifest resolves latest version automatically", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => JSON.stringify({ version: "160" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("latest-manifest-buffer"),
        } as unknown as Response);

      const buffer = await fetchManifest(undefined, {
        latest: true,
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(buffer.toString()).toBe("latest-manifest-buffer");
    });

    test("downloadManifest creates nested output directory if missing", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("nested manifest"),
      } as unknown as Response);

      const nestedDir = path.join(testOutDir, "nested", "manifests");
      const saved = await downloadManifest("140", {
        outDir: nestedDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(fs.existsSync(saved)).toBe(true);
      expect(fs.readFileSync(saved, "utf-8")).toBe("nested manifest");
    });

    test("fetchFileInfoMap returns buffer with filemap type", async () => {
      let fetchedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchedUrl = url;
        return {
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("file-info-map-buffer"),
        } as unknown as Response;
      });

      const buffer = await fetchFileInfoMap("140", {
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(buffer.toString()).toBe("file-info-map-buffer");
      expect(fetchedUrl).toContain("FileInfoMap_LINEAGE2_140.dat");
    });

    test("fetchPatchFileInfo returns buffer with patch type", async () => {
      let fetchedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchedUrl = url;
        return {
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("patch-file-info-buffer"),
        } as unknown as Response;
      });

      const buffer = await fetchPatchFileInfo("140", {
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(buffer.toString()).toBe("patch-file-info-buffer");
      expect(fetchedUrl).toContain("PatchFileInfo_LINEAGE2_140.dat");
    });

    test("downloadFileInfoMap downloads FileInfoMap file to disk", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("disk-file-info-map"),
      } as unknown as Response);

      const saved = await downloadFileInfoMap("140", {
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(fs.existsSync(saved)).toBe(true);
      expect(saved).toContain("FileInfoMap_140.dat");
      expect(fs.readFileSync(saved, "utf-8")).toBe("disk-file-info-map");
    });

    test("downloadPatchFileInfo downloads PatchFileInfo file to disk", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("disk-patch-file-info"),
      } as unknown as Response);

      const saved = await downloadPatchFileInfo("140", {
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(fs.existsSync(saved)).toBe(true);
      expect(saved).toContain("PatchFileInfo_140.dat");
      expect(fs.readFileSync(saved, "utf-8")).toBe("disk-patch-file-info");
    });

    test("fetchPatch returns buffer when direct patch exists", async () => {
      global.fetch = vi
        .fn()
        // HEAD probe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response)
        // GET download
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("patch-buffer"),
        } as unknown as Response);

      const buffer = await fetchPatch("system/itemname-e.dat", {
        fromVersion: "100",
        toVersion: "105",
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(buffer.toString()).toBe("patch-buffer");
    });

    test("fetchPatch throws when direct patch does not exist", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(
        fetchPatch("system/itemname-e.dat", {
          fromVersion: "100",
          toVersion: "105",
          config: { baseUrl: "https://cdn.example.com" },
        })
      ).rejects.toThrow("Direct patch delta between 100 and 105 not found");
    });
  });

  describe("downloadUpdate (entire patch update)", () => {
    test("downloads consolidated archive when available", async () => {
      global.fetch = vi
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi
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

    test("downloadUpdate uses manifestType filemap when specified", async () => {
      let manifestUrlRequested = "";
      global.fetch = vi
        .fn()
        .mockImplementation(async (url: string, init?: any) => {
          if (init?.method === "HEAD") {
            return { ok: false, status: 404 } as unknown as Response;
          }
          if (url.includes("FileInfoMap") || url.includes("PatchFileInfo")) {
            manifestUrlRequested = url;
            return {
              ok: true,
              text: async () => JSON.stringify(["system/f1.dat"]),
            } as unknown as Response;
          }
          return {
            ok: true,
            arrayBuffer: async () => createMockArrayBuffer("f1-content"),
          } as unknown as Response;
        });

      await downloadUpdate({
        version: "140",
        manifestType: "filemap",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(manifestUrlRequested).toContain("FileInfoMap_LINEAGE2_140.dat");
    });

    test("handles partial failures during manifest bulk download", async () => {
      global.fetch = vi
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
      global.fetch = vi
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
      global.fetch = vi
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
      global.fetch = vi
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
      global.fetch = vi.fn().mockResolvedValue({
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
      global.fetch = vi
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

  describe("progress tracking & streaming", () => {
    test("downloadToBuffer streams chunks and notifies onProgress", async () => {
      const chunk1 = Buffer.from("Hello, ");
      const chunk2 = Buffer.from("World!");
      let chunkIndex = 0;
      const chunks = [chunk1, chunk2];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-length" ? "13" : null,
        },
        body: {
          getReader: () => ({
            read: async () => {
              if (chunkIndex < chunks.length) {
                return { done: false, value: new Uint8Array(chunks[chunkIndex++]) };
              }
              return { done: true, value: undefined };
            },
          }),
        },
      } as unknown as Response);

      const progressEvents: any[] = [];
      const buffer = await downloadToBuffer(
        "https://cdn.example.com/test.dat",
        undefined,
        (p) => progressEvents.push(p)
      );

      expect(buffer.toString()).toBe("Hello, World!");
      expect(progressEvents.length).toBe(2);
      expect(progressEvents[0]).toEqual({
        receivedBytes: 7,
        totalBytes: 13,
        chunkSize: 7,
      });
      expect(progressEvents[1]).toEqual({
        receivedBytes: 13,
        totalBytes: 13,
        chunkSize: 6,
      });
    });

    test("fetchFullZip passes onProgress", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("zip-data"),
      } as unknown as Response);

      const progressEvents: any[] = [];
      const buffer = await fetchFullZip("system/test.dat", {
        version: "140",
        config: { baseUrl: "https://cdn.example.com" },
        onProgress: (p) => progressEvents.push(p),
      });

      expect(buffer.toString()).toBe("zip-data");
      expect(progressEvents.length).toBe(1);
      expect(progressEvents[0].filePath).toBe("system/test.dat");
    });

    test("fetchPatch passes onProgress", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true } as Response) // HEAD probe
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("patch-data"),
        } as unknown as Response);

      const progressEvents: any[] = [];
      const buffer = await fetchPatch("system/test.dat", {
        fromVersion: "140",
        toVersion: "142",
        config: { baseUrl: "https://cdn.example.com" },
        onProgress: (p) => progressEvents.push(p),
      });

      expect(buffer.toString()).toBe("patch-data");
      expect(progressEvents.length).toBe(1);
      expect(progressEvents[0].filePath).toBe("system/test.dat");
    });

    test("downloadUpdate in archive mode notifies onProgress and onFileProgress", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true } as Response) // HEAD probe for archive
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("archive-bytes"),
        } as unknown as Response);

      const batchEvents: any[] = [];
      const fileEvents: any[] = [];

      const result = await downloadUpdate({
        version: "140",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
        onProgress: (p) => batchEvents.push(p),
        onFileProgress: (p) => fileEvents.push(p),
      });

      expect(result.mode).toBe("archive");
      expect(batchEvents.length).toBeGreaterThan(0);
      expect(fileEvents.length).toBeGreaterThan(0);
    });

    test("downloadPatchUpdate in archive mode notifies onProgress and onFileProgress", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true } as Response) // HEAD probe for archive
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("archive-patch-bytes"),
        } as unknown as Response);

      const batchEvents: any[] = [];
      const fileEvents: any[] = [];

      const result = await downloadPatchUpdate({
        fromVersion: "140",
        toVersion: "142",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
        onProgress: (p) => batchEvents.push(p),
        onFileProgress: (p) => fileEvents.push(p),
      });

      expect(result.mode).toBe("archive");
      expect(batchEvents.length).toBeGreaterThan(0);
      expect(fileEvents.length).toBeGreaterThan(0);
    });

    test("downloadPatchUpdate uses manifestType when specified", async () => {
      let manifestUrlRequested = "";
      global.fetch = vi
        .fn()
        .mockImplementation(async (url: string, init?: any) => {
          if (init?.method === "HEAD") {
            return { ok: false, status: 404 } as unknown as Response;
          }
          if (url.includes("FileInfoMap") || url.includes("PatchFileInfo")) {
            manifestUrlRequested = url;
            return {
              ok: true,
              text: async () => JSON.stringify(["system/f1.dat"]),
            } as unknown as Response;
          }
          return {
            ok: true,
            arrayBuffer: async () => createMockArrayBuffer("patch-content"),
          } as unknown as Response;
        });

      await downloadPatchUpdate({
        fromVersion: "139",
        toVersion: "140",
        manifestType: "patch",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com", gameId: "LINEAGE2" },
      });

      expect(manifestUrlRequested).toContain("PatchFileInfo_LINEAGE2_140.dat");
    });
  });

  describe("NC_CDN_HEADERS & No User-Agent", () => {

    test("NC_CDN_HEADERS has expected wire headers and no User-Agent", () => {
      expect(NC_CDN_HEADERS.Accept).toBe("*/*");
      expect(NC_CDN_HEADERS["Accept-Encoding"]).toBe("identity");
      expect(NC_CDN_HEADERS["Cache-Control"]).toBe("no-transform");
      expect((NC_CDN_HEADERS as Record<string, string>)["User-Agent"]).toBeUndefined();
    });

    test("probeUrl does not send User-Agent header", async () => {
      let sentHeaders: any;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentHeaders = opts?.headers;
        return { ok: true } as unknown as Response;
      });

      await probeUrl("https://example.com/test.zip");
      expect(sentHeaders["User-Agent"]).toBeUndefined();
      expect(sentHeaders.Accept).toBe("*/*");
    });

    test("downloadToBuffer does not send User-Agent header", async () => {
      let sentHeaders: any;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentHeaders = opts?.headers;
        return {
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("test-content"),
        } as unknown as Response;
      });

      await downloadToBuffer("https://example.com/test.zip");
      expect(sentHeaders["User-Agent"]).toBeUndefined();
      expect(sentHeaders.Accept).toBe("*/*");
    });

    test("loadManifestFileList does not send User-Agent header on remote fetch", async () => {
      let sentHeaders: any;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentHeaders = opts?.headers;
        return {
          ok: true,
          arrayBuffer: async () => createMockArrayBuffer("system/file.dat\n"),
        } as unknown as Response;
      });

      await loadManifestFileList("https://example.com/manifest.txt");
      expect(sentHeaders["User-Agent"]).toBeUndefined();
      expect(sentHeaders.Accept).toBe("*/*");
    });
  });

  describe("parseRetryAfter", () => {
    test("returns undefined for null or empty", () => {
      expect(parseRetryAfter(null)).toBeUndefined();
      expect(parseRetryAfter("")).toBeUndefined();
    });

    test("parses integer seconds into milliseconds", () => {
      expect(parseRetryAfter("30")).toBe(30000);
      expect(parseRetryAfter("0")).toBe(0);
    });

    test("returns undefined for negative or invalid numbers", () => {
      expect(parseRetryAfter("-10")).toBeUndefined();
      expect(parseRetryAfter("not-a-number-or-date")).toBeUndefined();
    });

    test("parses future HTTP date into difference in milliseconds", () => {
      const future = new Date(Date.now() + 5000).toUTCString();
      const delay = parseRetryAfter(future);
      expect(delay).toBeDefined();
      expect(delay!).toBeGreaterThan(0);
      expect(delay!).toBeLessThanOrEqual(6000);
    });

    test("returns 0 for past HTTP date", () => {
      const past = new Date(Date.now() - 5000).toUTCString();
      expect(parseRetryAfter(past)).toBe(0);
    });
  });

  describe("fetchWithRetry", () => {
    test("returns response immediately on 200 OK", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response);

      const resp = await fetchWithRetry("https://example.com/ok");
      expect(resp.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("retries on 403 Forbidden and succeeds on next attempt", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: new Headers(),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response);

      const resp = await fetchWithRetry("https://example.com/throttled", undefined, {
        retryDelayMs: 1,
      });
      expect(resp.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("retries on 429 Too Many Requests and honors Retry-After", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "0" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response);

      const resp = await fetchWithRetry("https://example.com/rate-limited");
      expect(resp.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("retries on 502, 503, 504 server errors", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          headers: new Headers(),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers(),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response);

      const resp = await fetchWithRetry("https://example.com/server-error", undefined, {
        retryDelayMs: 1,
      });
      expect(resp.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test("returns non-retryable 404 without retrying", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
      } as unknown as Response);

      const resp = await fetchWithRetry("https://example.com/not-found", undefined, {
        maxRetries: 3,
        retryDelayMs: 1,
      });
      expect(resp.status).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("retries on network exception and recovers", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Connection reset"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as unknown as Response);

      const resp = await fetchWithRetry("https://example.com/network", undefined, {
        retryDelayMs: 1,
      });
      expect(resp.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("rethrows when retries are exhausted on network failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Fatal connection timeout"));

      await expect(
        fetchWithRetry("https://example.com/fatal", undefined, {
          maxRetries: 2,
          retryDelayMs: 1,
        })
      ).rejects.toThrow("Fatal connection timeout");
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("runWithConcurrency with delayMs", () => {
    test("paces execution when delayMs > 0", async () => {
      const startTimes: number[] = [];
      const items = [1, 2, 3];

      await runWithConcurrency(
        items,
        2,
        async (item) => {
          startTimes.push(Date.now());
          return item * 2;
        },
        30
      );

      expect(startTimes.length).toBe(3);
      expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(20);
    });
  });

  describe("skipExisting option", () => {
    test("downloadToFile skips when destination file exists with size > 0", async () => {
      const dest = path.join(testOutDir, "already_exists.dat");
      fs.writeFileSync(dest, "already downloaded content");
      global.fetch = vi.fn();

      const result = await downloadToFile("https://example.com/file.dat", dest, undefined, {
        skipExisting: true,
      });

      expect(result).toBe(dest);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("downloadToFile proceeds when destination exists but is empty (0 bytes)", async () => {
      const dest = path.join(testOutDir, "empty.dat");
      fs.writeFileSync(dest, "");
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => createMockArrayBuffer("new-content"),
      } as unknown as Response);

      const result = await downloadToFile("https://example.com/file.dat", dest, undefined, {
        skipExisting: true,
      });

      expect(result).toBe(dest);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(dest, "utf-8")).toBe("new-content");
    });

    test("downloadFullZip skips when output zip exists with size > 0", async () => {
      const existingZip = path.join(testOutDir, "itemname-e.dat_140.zip");
      fs.writeFileSync(existingZip, "cached-zip-content");
      global.fetch = vi.fn();

      const saved = await downloadFullZip("system/itemname-e.dat", {
        version: "140",
        outDir: testOutDir,
        skipExisting: true,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(saved).toBe(existingZip);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("downloadPatch skips direct patch download when file exists with size > 0", async () => {
      const existingPatch = path.join(testOutDir, "itemname-e.dat_140_to_142.patch");
      fs.writeFileSync(existingPatch, "cached-patch-content");
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response);

      const result = await downloadPatch("system/itemname-e.dat", {
        fromVersion: "140",
        toVersion: "142",
        outDir: testOutDir,
        skipExisting: true,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.downloadedFiles[0]).toBe(existingPatch);
      // Only 1 probe call for checking existence, no download fetch call
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("downloadPatch skips incremental step patch when step file exists with size > 0", async () => {
      const step1 = path.join(testOutDir, "itemname-e.dat_140_to_141.patch");
      const step2 = path.join(testOutDir, "itemname-e.dat_141_to_142.patch");
      fs.writeFileSync(step1, "cached-step-1");
      fs.writeFileSync(step2, "cached-step-2");

      global.fetch = vi
        .fn()
        // direct probe -> 404
        .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
        // step 1 probe -> 200
        .mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response)
        // step 2 probe -> 200
        .mockResolvedValueOnce({ ok: true, status: 200 } as unknown as Response);

      const result = await downloadPatch("system/itemname-e.dat", {
        fromVersion: "140",
        toVersion: "142",
        outDir: testOutDir,
        skipExisting: true,
        config: { baseUrl: "https://cdn.example.com" },
      });

      expect(result.strategy).toBe("incremental");
      expect(result.downloadedFiles.length).toBe(2);
      // 3 probe calls, but 0 download calls because both files exist
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("download completion callbacks", () => {
    test("downloadToFile calls onComplete with source, destination, size, and speed", async () => {
      const fileData = "test content for onComplete";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": String(fileData.length) }),
        arrayBuffer: async () => createMockArrayBuffer(fileData),
      });

      const onComplete = vi.fn();
      const dest = path.join(testOutDir, "complete_test.dat");

      await downloadToFile("https://cdn.example.com/test.dat", dest, undefined, {
        onComplete,
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      const info = onComplete.mock.calls[0][0];
      expect(info.source).toBe("https://cdn.example.com/test.dat");
      expect(info.destination).toBe(dest);
      expect(info.bytes).toBe(fileData.length);
      expect(info.durationMs).toBeGreaterThanOrEqual(1);
      expect(info.averageSpeed).toBeGreaterThan(0);
    });

    test("fetchFullZip calls onComplete when provided", async () => {
      const fileData = "fetch-full-zip-content";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": String(fileData.length) }),
        arrayBuffer: async () => createMockArrayBuffer(fileData),
      });

      const onComplete = vi.fn();
      await fetchFullZip("system/itemname-e.dat", {
        version: "140",
        config: { baseUrl: "https://cdn.example.com" },
        onComplete,
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      const info = onComplete.mock.calls[0][0];
      expect(info.source).toBe("https://cdn.example.com/140/Patch/Zip/system/itemname-e.dat.zip");
      expect(info.destination).toBe("<stdout>");
      expect(info.bytes).toBe(fileData.length);
      expect(info.averageSpeed).toBeGreaterThan(0);
    });

    test("downloadFullZip passes onComplete to downloadToFile", async () => {
      const fileData = "download-full-zip-content";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": String(fileData.length) }),
        arrayBuffer: async () => createMockArrayBuffer(fileData),
      });

      const onComplete = vi.fn();
      const saved = await downloadFullZip("system/itemname-e.dat", {
        version: "140",
        outDir: testOutDir,
        config: { baseUrl: "https://cdn.example.com" },
        onComplete,
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0].destination).toBe(saved);
    });

    test("downloadUpdate invokes onFileComplete for each downloaded file", async () => {
      const manifest = "system/itemname-e.dat\nsystem/armorgrp.dat";
      const fileData = "zip-data";

      global.fetch = vi
        .fn()
        // probe archive -> 404
        .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
        // fetch manifest -> 200
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => createMockArrayBuffer(manifest),
        } as unknown as Response)
        // download file 1 -> 200
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-length": String(fileData.length) }),
          arrayBuffer: async () => createMockArrayBuffer(fileData),
        } as unknown as Response)
        // download file 2 -> 200
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "content-length": String(fileData.length) }),
          arrayBuffer: async () => createMockArrayBuffer(fileData),
        } as unknown as Response);

      const onFileComplete = vi.fn();
      const result = await downloadUpdate({
        version: "140",
        outDir: testOutDir,
        concurrency: 1,
        config: { baseUrl: "https://cdn.example.com" },
        onFileComplete,
      });

      expect(result.downloadedFiles.length).toBe(2);
      expect(onFileComplete).toHaveBeenCalledTimes(2);
      expect(onFileComplete.mock.calls[0][0].source).toContain("itemname-e.dat.zip");
      expect(onFileComplete.mock.calls[1][0].source).toContain("armorgrp.dat.zip");
    });
  });
});
