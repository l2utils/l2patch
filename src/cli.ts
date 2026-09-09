#!/usr/bin/env node
import { Command } from "commander";
import {
  requireBaseUrl,
  requireGameId,
  requireUpdaterHost,
  requireUpdaterPort,
  requireVersionUrl,
  resolveConfig,
  updateDotEnv,
} from "./config";
import {
  downloadFullZip,
  downloadManifest,
  downloadPatch,
  downloadPatchUpdate,
  downloadUpdate,
} from "./downloader";
import { PatchConfig } from "./types";
import { checkCurrentVersion, queryCdnConfig } from "./version";

const program = new Command();

program
  .name("l2patch")
  .description("Lineage 2 client patch inspection and file download utility")
  .version("1.0.0");

// Global options that apply across commands
program
  .option("--base-url <url>", "Base URL of the patch server / CDN")
  .option(
    "--cdn-host <host>",
    "CDN Host of the patch server (e.g. d35293xeakkyq4.cloudfront.net)"
  )
  .option(
    "--updater-host <host>",
    "Updater TCP host (e.g. updater.nclauncher.ncsoft.com)"
  )
  .option("--updater-port <port>", "Updater TCP port")
  .option("--game-id <id>", "NCSoft Game ID (e.g. LINEAGE2)")
  .option(
    "--version-url <url>",
    "URL of the version check endpoint or manifest"
  )
  .option(
    "--auth-token <token>",
    "Authorization token for protected endpoints"
  );

function buildConfigFromCli(opts: Record<string, unknown>): PatchConfig {
  const globalOpts = program.opts();
  const cdnHost =
    (opts.cdnHost as string) || (globalOpts.cdnHost as string) || undefined;
  const gameId =
    (opts.gameId as string) || (globalOpts.gameId as string) || undefined;
  const updaterHost =
    (opts.updaterHost as string) ||
    (globalOpts.updaterHost as string) ||
    undefined;
  const updaterPortStr =
    (opts.updaterPort as string) ||
    (globalOpts.updaterPort as string) ||
    undefined;
  const baseUrl =
    (opts.baseUrl as string) || (globalOpts.baseUrl as string) || undefined;
  const versionUrl =
    (opts.versionUrl as string) ||
    (globalOpts.versionUrl as string) ||
    undefined;
  const authToken =
    (opts.authToken as string) || (globalOpts.authToken as string) || undefined;

  return resolveConfig({
    baseUrl,
    cdnHost,
    updaterHost,
    updaterPort: updaterPortStr ? parseInt(updaterPortStr, 10) : undefined,
    gameId,
    versionUrl,
    authToken,
  });
}

// 1. Query current CDN host
program
  .command("cdn")
  .description(
    "Query the active CDN host from the updater server (Opcode 0x0003)"
  )
  .option("--json", "Output CDN configuration as JSON")
  .option("--env", "Output formatted as .env variable (L2_PATCH_CDN_HOST=...)")
  .option(
    "--set-env",
    "Write retrieved CDN host and base URL to local .env file"
  )
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      const host = requireUpdaterHost(config);
      const port = requireUpdaterPort(config);
      const gameId = requireGameId(config);

      const cdnInfo = await queryCdnConfig(host, port, gameId);
      if (cmdOpts.setEnv) {
        updateDotEnv({
          L2_PATCH_CDN_HOST: cdnInfo.cdnHost,
          L2_PATCH_BASE_URL: cdnInfo.baseUrl,
        });
      }

      if (cmdOpts.json) {
        console.log(JSON.stringify(cdnInfo, null, 2));
      } else if (cmdOpts.env) {
        console.log(`L2_PATCH_CDN_HOST=${cdnInfo.cdnHost}`);
        console.log(`L2_PATCH_BASE_URL=${cdnInfo.baseUrl}`);
      } else {
        console.log(cdnInfo.cdnHost);
      }
    } catch (err) {
      console.error(`Error querying CDN config: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 2. Check for current version
program
  .command("version")
  .description("Check the latest or current Lineage 2 client patch version")
  .option("--json", "Output version information as JSON")
  .option("--set-env", "Write retrieved version to local .env file")
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      if (!config.versionUrl && !config.updaterHost) {
        requireVersionUrl(config);
      }

      const info = await checkCurrentVersion(config);
      if (cmdOpts.setEnv) {
        updateDotEnv({
          L2_PATCH_VERSION: info.version,
        });
      }

      if (cmdOpts.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(info.version);
      }
    } catch (err) {
      console.error(`Error checking version: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 3. Download manifest for a specific version
program
  .command("manifest")
  .description("Download manifest for a specific version (or latest)")
  .option("-v, --version <version>", "Target version to download manifest for")
  .option(
    "-l, --latest",
    "Download manifest for the latest version automatically",
    true
  )
  .option(
    "-t, --type <type>",
    "Manifest type: 'patch' (PatchFileInfo) or 'filemap' (FileInfoMap)",
    "patch"
  )
  .option(
    "-o, --out-dir <dir>",
    "Directory where the downloaded manifest will be saved",
    "."
  )
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      requireBaseUrl(config);

      const savedPath = await downloadManifest(cmdOpts.version, {
        latest: cmdOpts.latest && !cmdOpts.version,
        type: cmdOpts.type as "patch" | "filemap",
        outDir: cmdOpts.outDir,
        config,
      });
      console.log(savedPath);
    } catch (err) {
      console.error(`Error downloading manifest: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 4. Download full zip or patch delta for a single file
program
  .command("download")
  .description(
    "Download full zip or patch delta of a single client file"
  )
  .argument(
    "<filePath>",
    "Relative client file path (e.g. system/itemname-e.dat)"
  )
  .option(
    "-v, --version <version>",
    "Target version to download (or 'to' version for patch)"
  )
  .option("-t, --to <version>", "Target version for patch (alias for --version)")
  .option("-f, --from <version>", "Starting version (required when using --patch)")
  .option("-p, --patch", "Download patch delta instead of full zip", false)
  .option("-l, --latest", "Download the latest version automatically", true)
  .option(
    "-o, --out-dir <dir>",
    "Directory where the downloaded file will be saved",
    "."
  )
  .action(async (filePath, cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      requireBaseUrl(config);

      const targetVersion = cmdOpts.to || cmdOpts.version;

      if (cmdOpts.patch) {
        if (!cmdOpts.from) {
          throw new Error(
            "Missing required --from <version> option when downloading patch."
          );
        }
        let toVersion = targetVersion;
        if (!toVersion) {
          const latestInfo = await checkCurrentVersion(config);
          toVersion = latestInfo.version;
        }

        const result = await downloadPatch(filePath, {
          fromVersion: cmdOpts.from,
          toVersion,
          outDir: cmdOpts.outDir,
          config,
        });

        for (const file of result.downloadedFiles) {
          console.log(file);
        }
      } else {
        const savedPath = await downloadFullZip(filePath, {
          version: targetVersion,
          latest: cmdOpts.latest && !targetVersion,
          outDir: cmdOpts.outDir,
          config,
        });
        console.log(savedPath);
      }
    } catch (err) {
      console.error(`Error downloading: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 5. Download full zips or delta patches for an entire patch update
program
  .command("download-version")
  .alias("download-all")
  .description(
    "Download full zips or delta patches for an entire patch update"
  )
  .option(
    "-v, --version <version>",
    "Target version to download (or 'to' version for patch)"
  )
  .option("-t, --to <version>", "Target version for patch (alias for --version)")
  .option("-f, --from <version>", "Starting version (required when using --patch)")
  .option("-p, --patch", "Download patch deltas instead of full zips", false)
  .option("-l, --latest", "Download the latest version automatically", true)
  .option("-m, --manifest <pathOrUrl>", "Path or URL to update manifest / filelist")
  .option("-c, --concurrency <number>", "Number of concurrent downloads", "4")
  .option("-o, --out-dir <dir>", "Directory where files will be saved", ".")
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      requireBaseUrl(config);

      const targetVersion = cmdOpts.to || cmdOpts.version;

      if (cmdOpts.patch) {
        if (!cmdOpts.from) {
          throw new Error(
            "Missing required --from <version> option when downloading patch update."
          );
        }
        let toVersion = targetVersion;
        if (!toVersion) {
          const latestInfo = await checkCurrentVersion(config);
          toVersion = latestInfo.version;
        }

        const result = await downloadPatchUpdate({
          fromVersion: cmdOpts.from,
          toVersion,
          manifestPathOrUrl: cmdOpts.manifest,
          concurrency: parseInt(cmdOpts.concurrency, 10),
          outDir: cmdOpts.outDir,
          config,
        });

        console.log(`Mode: ${result.mode}`);
        console.log(`Total files downloaded: ${result.downloadedFiles.length}`);
        if (result.failedFiles.length > 0) {
          console.warn(`Failed patches (${result.failedFiles.length}):`);
          for (const fail of result.failedFiles) {
            console.warn(`  - ${fail.file}: ${fail.error}`);
          }
          process.exit(1);
        }
      } else {
        const result = await downloadUpdate({
          version: targetVersion,
          latest: cmdOpts.latest && !targetVersion,
          manifestPathOrUrl: cmdOpts.manifest,
          concurrency: parseInt(cmdOpts.concurrency, 10),
          outDir: cmdOpts.outDir,
          config,
        });

        console.log(`Mode: ${result.mode}`);
        console.log(
          `Total files processed: ${result.downloadedFiles.length}/${result.totalFiles}`
        );
        if (result.failedFiles.length > 0) {
          console.warn(`Failed downloads (${result.failedFiles.length}):`);
          for (const fail of result.failedFiles) {
            console.warn(`  - ${fail.file}: ${fail.error}`);
          }
          process.exit(1);
        }
      }
    } catch (err) {
      console.error(`Error downloading version: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
