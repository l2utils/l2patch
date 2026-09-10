import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { downloadPatchUpdate, downloadUpdate } from "../downloader";
import { isAllFilter, LARGE_DOWNLOAD_WARNING } from "../filters";
import { BatchProgressReporter } from "../progress";
import { checkCurrentVersion } from "../version";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `download version` command for downloading updates.
 */
export function createDownloadVersionCommand(): Command {
  return new Command("version")
    .alias("download-version")
    .alias("download-all")
    .description(
      "Download full zips or delta patches for an entire patch update or filtered subset"
    )
    .option(
      "-v, --version <version>",
      "Target version to download (or 'to' version for patch)"
    )
    .option("-t, --to <version>", "Target version for patch (alias for --version)")
    .option("-f, --from <version>", "Starting version (required when using --patch)")
    .option("-p, --patch", "Download patch deltas instead of full zips", false)
    .option("-l, --latest", "Download the latest version automatically", true)
    .option(
      "--filter <category>",
      "Filter subset of files: 'default' (items, skills, quests, monster names, db), 'items', 'skills', 'textures', 'all'",
      "default"
    )
    .option("-m, --manifest <pathOrUrl>", "Path or URL to update manifest / filelist")
    .option(
      "--file-info-map <pathOrUrl>",
      "Path or URL to FileInfoMap manifest / filelist"
    )
    .option(
      "--patch-file-info <pathOrUrl>",
      "Path or URL to PatchFileInfo manifest / filelist"
    )
    .option(
      "--manifest-type <type>",
      "Manifest type: 'filemap' (FileInfoMap) or 'patch' (PatchFileInfo)"
    )
    .option("-c, --concurrency <number>", "Number of concurrent downloads", "4")
    .option(
      "-d, --delay <ms>",
      "Inter-request delay in milliseconds between downloads",
      "0"
    )
    .option(
      "-r, --retries <number>",
      "Maximum retry attempts for failed requests",
      "3"
    )
    .option(
      "--skip-existing",
      "Skip downloading files that already exist locally",
      false
    )
    .option("-o, --out-dir <dir>", "Directory where files will be saved", "out")
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
    )
    .option("--progress", "Display download progress", true)
    .option("--no-progress", "Disable download progress")
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const targetVersion = cmdOpts.to || cmdOpts.version;
        const concurrency = parseInt(cmdOpts.concurrency, 10);
        const delayMs = parseInt(cmdOpts.delay, 10);
        const maxRetries = parseInt(cmdOpts.retries, 10);
        const skipExisting = Boolean(cmdOpts.skipExisting);
        const filter = cmdOpts.filter || "default";

        if (isAllFilter(filter)) {
          console.warn(`\n${LARGE_DOWNLOAD_WARNING}\n`);
        }

        const manifestPathOrUrl =
          cmdOpts.fileInfoMap || cmdOpts.patchFileInfo || cmdOpts.manifest;
        let manifestType: "patch" | "filemap" | undefined =
          cmdOpts.manifestType as "patch" | "filemap" | undefined;
        if (!manifestType) {
          if (cmdOpts.fileInfoMap) {
            manifestType = "filemap";
          } else if (cmdOpts.patchFileInfo) {
            manifestType = "patch";
          }
        }

        const reporter = new BatchProgressReporter({
          stream: process.stderr,
          enabled: cmdOpts.progress,
        });

        const outDir = cmdOpts.outDir || "out";

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
            manifestPathOrUrl,
            manifestType,
            filter,
            concurrency,
            delayMs,
            maxRetries,
            skipExisting,
            outDir,
            config,
            onProgress: (p) => reporter.update(p),
            onFileComplete: (info) => reporter.logDownload(info),
          });

          reporter.finish();

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
            manifestPathOrUrl,
            manifestType,
            filter,
            concurrency,
            delayMs,
            maxRetries,
            skipExisting,
            outDir,
            config,
            onProgress: (p) => reporter.update(p),
            onFileComplete: (info) => reporter.logDownload(info),
          });

          reporter.finish();

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
}
