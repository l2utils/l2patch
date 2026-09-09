import * as fs from "fs";
import * as path from "path";
import {
  loadDotEnv,
  requireBaseUrl,
  requireGameId,
  requireUpdaterHost,
  requireUpdaterPort,
  requireVersionUrl,
  resolveConfig,
  updateDotEnv,
} from "../src/config";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.L2_PATCH_BASE_URL;
    delete process.env.L2_PATCH_CDN_HOST;
    delete process.env.L2_PATCH_UPDATER_HOST;
    delete process.env.L2_PATCH_UPDATER_PORT;
    delete process.env.L2_PATCH_GAME_ID;
    delete process.env.L2_PATCH_VERSION;
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
    expect(config.manifestUrlTemplate).toBeUndefined();
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

  test("derives baseUrl when cdnHost and gameId are configured", () => {
    process.env.L2_PATCH_CDN_HOST = "d35293xeakkyq4.cloudfront.net";
    process.env.L2_PATCH_GAME_ID = "LINEAGE2";
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

  test("requireVersionUrl throws when versionUrl and updaterHost are missing", () => {
    const config = resolveConfig();
    expect(() => requireVersionUrl(config)).toThrow("Missing required L2_PATCH_VERSION_URL");
  });

  test("requireVersionUrl returns versionUrl when set", () => {
    const config = resolveConfig({ versionUrl: "https://cdn.example.com/ver" });
    expect(requireVersionUrl(config)).toBe("https://cdn.example.com/ver");
  });

  test("requireUpdaterHost throws when missing and returns value when set", () => {
    const config = resolveConfig();
    expect(() => requireUpdaterHost(config)).toThrow("Missing required L2_PATCH_UPDATER_HOST");
    const withHost = resolveConfig({ updaterHost: "updater.example.com" });
    expect(requireUpdaterHost(withHost)).toBe("updater.example.com");
  });

  test("requireUpdaterPort throws when missing and returns value when set", () => {
    const config = resolveConfig();
    expect(() => requireUpdaterPort(config)).toThrow("Missing required L2_PATCH_UPDATER_PORT");
    const withPort = resolveConfig({ updaterPort: 27500 });
    expect(requireUpdaterPort(withPort)).toBe(27500);
  });

  test("requireGameId throws when missing and returns value when set", () => {
    const config = resolveConfig();
    expect(() => requireGameId(config)).toThrow("Missing required L2_PATCH_GAME_ID");
    const withGame = resolveConfig({ gameId: "LINEAGE2" });
    expect(requireGameId(withGame)).toBe("LINEAGE2");
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

  test("updateDotEnv updates existing keys and appends new ones", () => {
    const tmpEnvPath = path.resolve(__dirname, ".test.update.env");
    fs.writeFileSync(
      tmpEnvPath,
      "# Existing comment\nEXISTING_KEY=old_val\nOTHER=keep\n"
    );

    try {
      updateDotEnv(
        {
          EXISTING_KEY: "new_val",
          NEW_KEY: "added_val",
        },
        tmpEnvPath
      );

      const content = fs.readFileSync(tmpEnvPath, "utf-8");
      expect(content).toContain("EXISTING_KEY=new_val");
      expect(content).toContain("OTHER=keep");
      expect(content).toContain("NEW_KEY=added_val");

      // Test updating when file does not exist initially
      const tmpEnvNew = path.resolve(__dirname, ".test.nonexistent.env");
      updateDotEnv({ FOO: "bar" }, tmpEnvNew);
      const newContent = fs.readFileSync(tmpEnvNew, "utf-8");
      expect(newContent).toBe("FOO=bar\n");
      fs.unlinkSync(tmpEnvNew);
    } finally {
      if (fs.existsSync(tmpEnvPath)) {
        fs.unlinkSync(tmpEnvPath);
      }
    }
  });

  test("loadDotEnv does nothing when env file does not exist", () => {
    expect(() => loadDotEnv("/nonexistent/file/.env")).not.toThrow();
  });

  test("resolveConfig respects cdnHost override", () => {
    const config = resolveConfig({ cdnHost: "override.cdn.net" });
    expect(config.cdnHost).toBe("override.cdn.net");
  });
});
