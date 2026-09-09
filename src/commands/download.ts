import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { fetchFullZip, fetchPatch } from "../downloader";
import { checkCurrentVersion } from "../version";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `download` command for the commander program.
 */
export function createDownloadCommand(): Command {
  return new Command("download")
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
    .action(async (filePath, cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const targetVersion = cmdOpts.to || cmdOpts.version;

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
            config,
          });
        } else {
          buffer = await fetchFullZip(filePath, {
            version: targetVersion,
            latest: cmdOpts.latest && !targetVersion,
            config,
          });
        }

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
