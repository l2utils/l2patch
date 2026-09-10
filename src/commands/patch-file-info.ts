import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { fetchPatchFileInfo } from "../downloader";
import { FileProgressReporter } from "../progress";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `patch-file-info` command for the commander program.
 */
export function createPatchFileInfoCommand(): Command {
  return new Command("patch-file-info")
    .description(
      "Download PatchFileInfo manifest for a specific version (or latest) and output to stdout"
    )
    .option("-v, --version <version>", "Target version to download PatchFileInfo for")
    .option(
      "-l, --latest",
      "Download PatchFileInfo for the latest version automatically",
      true
    )
    .option(
      "-o, --output <file>",
      "Save to a file instead of streaming to stdout"
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
    .option(
      "-r, --retries <number>",
      "Maximum retry attempts for failed requests",
      "3"
    )
    .option("--progress", "Display download progress", true)
    .option("--no-progress", "Disable download progress")
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const dest = cmdOpts.output
          ? path.resolve(process.cwd(), cmdOpts.output)
          : "<stdout>";

        const reporter = new FileProgressReporter({
          stream: process.stderr,
          enabled: cmdOpts.progress,
          label: "PatchFileInfo",
        });

        const buffer = await fetchPatchFileInfo(cmdOpts.version, {
          latest: cmdOpts.latest && !cmdOpts.version,
          outDir: dest,
          config,
          onProgress: (p) => reporter.update(p),
          onComplete: (info) => reporter.logDownload(info),
        });

        reporter.finish();

        if (cmdOpts.output) {
          const dir = path.dirname(dest);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(dest, buffer);
        } else {
          process.stdout.write(buffer);
        }
      } catch (err) {
        console.error(`Error downloading PatchFileInfo: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}