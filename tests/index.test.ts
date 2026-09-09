import * as l2patch from "../src/index";

describe("index exports", () => {
  test("exports core library functions and builders", () => {
    expect(typeof l2patch.checkCurrentVersion).toBe("function");
    expect(typeof l2patch.downloadFullZip).toBe("function");
    expect(typeof l2patch.downloadPatch).toBe("function");
    expect(typeof l2patch.downloadUpdate).toBe("function");
    expect(typeof l2patch.downloadPatchUpdate).toBe("function");
    expect(typeof l2patch.buildFullZipUrl).toBe("function");
    expect(typeof l2patch.buildPatchUrl).toBe("function");
    expect(typeof l2patch.buildUpdateArchiveUrl).toBe("function");
    expect(typeof l2patch.buildPatchArchiveUrl).toBe("function");
    expect(typeof l2patch.buildManifestUrl).toBe("function");
    expect(typeof l2patch.buildFileInfoMapUrl).toBe("function");
    expect(typeof l2patch.buildPatchFileInfoUrl).toBe("function");
    expect(typeof l2patch.fetchFileInfoMap).toBe("function");
    expect(typeof l2patch.fetchPatchFileInfo).toBe("function");
    expect(typeof l2patch.downloadFileInfoMap).toBe("function");
    expect(typeof l2patch.downloadPatchFileInfo).toBe("function");
    expect(typeof l2patch.queryCdnConfig).toBe("function");
    expect(typeof l2patch.probeUrl).toBe("function");
    expect(typeof l2patch.resolveConfig).toBe("function");
  });
});
