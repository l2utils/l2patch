#!/usr/bin/env node
import { Command } from "commander";
import { checkCurrentVersion, queryCdnConfig } from "./version";
import {
  downloadFullZip,
  downloadPatch,
  downloadUpdate,
  downloadPatchUpdate,
} from "./downloader";
import { PatchConfig } from "./types";

const program = new Command();

program
  .name("l2patch")
  .description("Lineage 2 client patch inspection and file download utility")
  .version("1.0.0");

// Global options that apply across commands
program
  .option("--base-url <url>", "Base URL of the patch server / CDN")
  .option("--cdn-host <host>", "CDN Host of the patch server (e.g. d35293xeakkyq4.cloudfront.net)")
  .option("--version-url <url>", "URL of the version check endpoint or manifest")
  .option("--auth-token <token>", "Authorization token for protected endpoints");

function buildConfigFromCli(opts: Record<string, unknown>): PatchConfig {
  const globalOpts = program.opts();
  return {
    baseUrl: (opts.baseUrl as string) || (globalOpts.baseUrl as string) || undefined,
    cdnHost: (opts.cdnHost as string) || (globalOpts.cdnHost as string) || undefined,
    versionUrl: (opts.versionUrl as string) || (globalOpts.versionUrl as string) || undefined,
    authToken: (opts.authToken as string) || (globalOpts.authToken as string) || undefined,
  };
}

// 0. query current CDN host and base URL
program
  .command("cdn")
  .description("Query the active CDN host and base URL from the updater server (Opcode 0x0003)")
  .option("--json", "Output CDN configuration as JSON")
  .option("--env", "Output formatted as .env variable (L2_PATCH_BASE_URL=...)")
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      const host = config.updaterHost || process.env.L2_PATCH_UPDATER_HOST || "updater.nclauncher.ncsoft.com";
      const port = config.updaterPort || 27500;
      const gameId = config.gameId || "LINEAGE2";

      const cdnInfo = await queryCdnConfig(host, port, gameId);
      if (cmdOpts.json) {
        console.log(JSON.stringify(cdnInfo, null, 2));
      } else if (cmdOpts.env) {
        console.log(`L2_PATCH_BASE_URL=${cdnInfo.baseUrl}`);
        console.log(`L2_PATCH_CDN_HOST=${cdnInfo.cdnHost}`);
      } else {
        console.log(`Active CDN Host: ${cdnInfo.cdnHost}`);
        console.log(`Base URL: ${cdnInfo.baseUrl}`);
      }
    } catch (err) {
      console.error(`Error querying CDN config: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 1. check for current version
program
  .command("version")
  .description("Check the latest or current Lineage 2 client patch version")
  .option("--json", "Output version information as JSON")
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      const info = await checkCurrentVersion(config);
      if (cmdOpts.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(`Current Patch Version: ${info.version}`);
        if (info.timestamp) {
          console.log(`Timestamp: ${info.timestamp}`);
        }
      }
    } catch (err) {
      console.error(`Error checking version: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 2. download full zip of single file for specified version
program
  .command("download")
  .description("Download full zip of a single client file for a specified version (or latest)")
  .argument("<filePath>", "Relative client file path (e.g. system/itemname-e.dat)")
  .option("-v, --version <version>", "Target version to download")
  .option("-l, --latest", "Download the latest version automatically", true)
  .option("-o, --out-dir <dir>", "Directory where the downloaded file will be saved", ".")
  .action(async (filePath, cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      console.info(`Fetching full zip for ${filePath}...`);
      const savedPath = await downloadFullZip(filePath, {
        version: cmdOpts.version,
        latest: cmdOpts.latest && !cmdOpts.version,
        outDir: cmdOpts.outDir,
        config,
      });
      console.info(`Successfully downloaded: ${savedPath}`);
    } catch (err) {
      console.error(`Error downloading file: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 3. download patch file for a single file from version A -> version B
program
  .command("patch")
  .description("Download patch delta file(s) for a client file between two versions")
  .argument("<filePath>", "Relative client file path (e.g. system/itemname-e.dat)")
  .requiredOption("-f, --from <version>", "Starting version (version A)")
  .requiredOption("-t, --to <version>", "Target version (version B)")
  .option("-o, --out-dir <dir>", "Directory where patch files will be saved", ".")
  .action(async (filePath, cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      console.info(`Checking patch for ${filePath} from ${cmdOpts.from} to ${cmdOpts.to}...`);
      const result = await downloadPatch(filePath, {
        fromVersion: cmdOpts.from,
        toVersion: cmdOpts.to,
        outDir: cmdOpts.outDir,
        config,
      });

      console.info(`Patch strategy resolved: ${result.strategy}`);
      if (result.isDirect) {
        console.info(`Direct patch downloaded: ${result.downloadedFiles[0]}`);
      } else {
        console.info(`Incremental patch chain (${result.steps.length} steps) downloaded:`);
        for (const step of result.steps) {
          console.info(`  ${step.from} -> ${step.to}: ${step.savedPath}`);
        }
      }
    } catch (err) {
      console.error(`Error resolving patch: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 4. download full zips for an entire patch update
program
  .command("update-download")
  .alias("download-all")
  .description("Download full zips for an entire patch update (consolidated archive or manifest file list)")
  .option("-v, --version <version>", "Target version to download")
  .option("-l, --latest", "Download the latest version automatically", true)
  .option("-m, --manifest <pathOrUrl>", "Path or URL to update manifest / filelist")
  .option("-c, --concurrency <number>", "Number of concurrent downloads", "4")
  .option("-o, --out-dir <dir>", "Directory where files will be saved", ".")
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      console.info("Starting entire patch update download...");
      const result = await downloadUpdate({
        version: cmdOpts.version,
        latest: cmdOpts.latest && !cmdOpts.version,
        manifestPathOrUrl: cmdOpts.manifest,
        concurrency: parseInt(cmdOpts.concurrency, 10),
        outDir: cmdOpts.outDir,
        config,
      });

      console.info(`Mode: ${result.mode}`);
      console.info(`Total files processed: ${result.downloadedFiles.length}/${result.totalFiles}`);
      if (result.failedFiles.length > 0) {
        console.warn(`Failed downloads (${result.failedFiles.length}):`);
        for (const fail of result.failedFiles) {
          console.warn(`  - ${fail.file}: ${fail.error}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error downloading entire update: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// 5. download delta patches for an entire patch update from version A to version B
program
  .command("update-patch")
  .alias("patch-all")
  .description("Download patch delta files for an entire update between two versions")
  .requiredOption("-f, --from <version>", "Starting version (version A)")
  .requiredOption("-t, --to <version>", "Target version (version B)")
  .option("-m, --manifest <pathOrUrl>", "Path or URL to update manifest / filelist")
  .option("-c, --concurrency <number>", "Number of concurrent downloads", "4")
  .option("-o, --out-dir <dir>", "Directory where patch files will be saved", ".")
  .action(async (cmdOpts) => {
    try {
      const config = buildConfigFromCli(cmdOpts);
      console.info(`Starting bulk patch update from ${cmdOpts.from} to ${cmdOpts.to}...`);
      const result = await downloadPatchUpdate({
        fromVersion: cmdOpts.from,
        toVersion: cmdOpts.to,
        manifestPathOrUrl: cmdOpts.manifest,
        concurrency: parseInt(cmdOpts.concurrency, 10),
        outDir: cmdOpts.outDir,
        config,
      });

      console.info(`Mode: ${result.mode}`);
      console.info(`Total files downloaded: ${result.downloadedFiles.length}`);
      if (result.failedFiles.length > 0) {
        console.warn(`Failed patches (${result.failedFiles.length}):`);
        for (const fail of result.failedFiles) {
          console.warn(`  - ${fail.file}: ${fail.error}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error downloading patch update: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
