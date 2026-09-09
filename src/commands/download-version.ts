import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { downloadPatchUpdate, downloadUpdate } from "../downloader";
import { checkCurrentVersion } from "../version";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `download-version` (and alias `download-all`) command for the commander program.
 */
export function createDownloadVersionCommand(): Command {
  return new Command("download-version")
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
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
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
}
