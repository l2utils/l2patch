import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { requireBaseUrl } from "../../config";
import { fetchFullZip, fetchPatch } from "../../downloader";
import { FileProgressReporter } from "../../progress";
import { checkCurrentVersion } from "../../version";
import { buildConfigFromCli } from "../common";

/**
 * Creates the `download file` command for downloading a single client file.
 */
export function createDownloadFileCommand(): Command {
  return new Command("file")
    .alias("download-file")
    .description(
      "Download full zip or patch delta of a single client file and output to stdout"
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
      "-o, --output <file>",
      "Save to a file instead of streaming to stdout"
    )
    .option(
      "-r, --retries <number>",
      "Maximum retry attempts for failed requests",
      "3"
    )
    .option(
      "-d, --delay <ms>",
      "Delay in milliseconds between requests (default: 0)",
      "0"
    )
    .option(
      "--skip-existing",
      "Skip downloading if output file already exists locally",
      false
    )
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
    .action(async (filePath, cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const targetVersion = cmdOpts.to || cmdOpts.version;
        const maxRetries = parseInt(cmdOpts.retries, 10);
        const dest = cmdOpts.output
          ? path.resolve(process.cwd(), cmdOpts.output)
          : "<stdout>";

        if (cmdOpts.output && cmdOpts.skipExisting) {
          if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            return;
          }
        }

        const reporter = new FileProgressReporter({
          stream: process.stderr,
          enabled: cmdOpts.progress,
          label: filePath,
        });

        let buffer: Buffer;
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

          buffer = await fetchPatch(filePath, {
            fromVersion: cmdOpts.from,
            toVersion,
            outDir: dest,
            config,
            maxRetries,
            onProgress: (p) => reporter.update(p),
            onComplete: (info) => reporter.logDownload(info),
          });
        } else {
          buffer = await fetchFullZip(filePath, {
            version: targetVersion,
            latest: cmdOpts.latest && !targetVersion,
            outDir: dest,
            config,
            maxRetries,
            onProgress: (p) => reporter.update(p),
            onComplete: (info) => reporter.logDownload(info),
          });
        }

        reporter.finish();

        if (cmdOpts.output) {
          const dest = path.resolve(process.cwd(), cmdOpts.output);
          const dir = path.dirname(dest);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(dest, buffer);
        } else {
          process.stdout.write(buffer);
        }
      } catch (err) {
        console.error(`Error downloading: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
