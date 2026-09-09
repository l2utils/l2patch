import * as fs from "fs";
import * as path from "path";
import {
  loadDotEnv,
  requireBaseUrl,
  requireVersionUrl,
  resolveConfig,
} from "../src/config";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.L2_PATCH_BASE_URL;
    delete process.env.L2_PATCH_VERSION_URL;
    delete process.env.L2_PATCH_AUTH_TOKEN;
    delete process.env.L2_PATCH_URL_TEMPLATE;
    delete process.env.L2_PATCH_DELTA_TEMPLATE;
    delete process.env.L2_PATCH_UPDATE_ARCHIVE_TEMPLATE;
    delete process.env.L2_PATCH_PATCH_ARCHIVE_TEMPLATE;
    delete process.env.L2_PATCH_MANIFEST_URL_TEMPLATE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("resolves defaults and missing URLs", () => {
    const config = resolveConfig();
    expect(config.baseUrl).toBeUndefined();
    expect(config.versionUrl).toBeUndefined();
    expect(config.urlTemplate).toContain("{baseUrl}");
    expect(config.patchUrlTemplate).toContain("{baseUrl}");
    expect(config.updateArchiveTemplate).toContain("{baseUrl}");
    expect(config.patchArchiveTemplate).toContain("{baseUrl}");
    expect(config.manifestUrlTemplate).toContain("{baseUrl}");
  });

  test("uses environment variables when present", () => {
    process.env.L2_PATCH_BASE_URL = "https://cdn.example.com";
    process.env.L2_PATCH_AUTH_TOKEN = "secret-token";

    const config = resolveConfig();
    expect(config.baseUrl).toBe("https://cdn.example.com");
    expect(config.versionUrl).toBe("https://cdn.example.com/version.json");
    expect(config.authToken).toBe("secret-token");
  });

  test("overrides take precedence over environment variables", () => {
    process.env.L2_PATCH_BASE_URL = "https://env.example.com";
    const config = resolveConfig({ baseUrl: "https://override.example.com" });
    expect(config.baseUrl).toBe("https://override.example.com");
  });

  test("derives baseUrl when cdnHost is configured", () => {
    process.env.L2_PATCH_CDN_HOST = "d35293xeakkyq4.cloudfront.net";
    const config = resolveConfig();
    expect(config.cdnHost).toBe("d35293xeakkyq4.cloudfront.net");
    expect(config.baseUrl).toBe("http://d35293xeakkyq4.cloudfront.net/LINEAGE2");
  });

  test("requireBaseUrl throws when baseUrl is missing", () => {
    const config = resolveConfig();
    expect(() => requireBaseUrl(config)).toThrow("Missing required CDN configuration");
  });

  test("requireBaseUrl returns baseUrl when set", () => {
    const config = resolveConfig({ baseUrl: "https://cdn.example.com" });
    expect(requireBaseUrl(config)).toBe("https://cdn.example.com");
  });

  test("requireVersionUrl throws when versionUrl is missing", () => {
    const config = resolveConfig();
    expect(() => requireVersionUrl(config)).toThrow("Missing required L2_PATCH_VERSION_URL");
  });

  test("requireVersionUrl returns versionUrl when set", () => {
    const config = resolveConfig({ versionUrl: "https://cdn.example.com/ver" });
    expect(requireVersionUrl(config)).toBe("https://cdn.example.com/ver");
  });

  test("loadDotEnv parses KEY=VALUE correctly", () => {
    const tmpEnvPath = path.resolve(__dirname, ".test.env");
    fs.writeFileSync(
      tmpEnvPath,
      "# comment\nL2_PATCH_BASE_URL=\"https://dotenv.example.com\"\nFOO=bar\n"
    );

    try {
      loadDotEnv(tmpEnvPath);
      expect(process.env.L2_PATCH_BASE_URL).toBe("https://dotenv.example.com");
      expect(process.env.FOO).toBe("bar");
    } finally {
      if (fs.existsSync(tmpEnvPath)) {
        fs.unlinkSync(tmpEnvPath);
      }
    }
  });
});
