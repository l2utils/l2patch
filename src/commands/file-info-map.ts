import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { fetchFileInfoMap } from "../downloader";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `file-info-map` command for the commander program.
 */
export function createFileInfoMapCommand(): Command {
  return new Command("file-info-map")
    .alias("manifest")
    .description(
      "Download FileInfoMap manifest for a specific version (or latest) and output to stdout"
    )
    .option("-v, --version <version>", "Target version to download FileInfoMap for")
    .option(
      "-l, --latest",
      "Download FileInfoMap for the latest version automatically",
      true
    )
    .option(
      "-o, --output <file>",
      "Save to a file instead of streaming to stdout"
    )
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const buffer = await fetchFileInfoMap(cmdOpts.version, {
          latest: cmdOpts.latest && !cmdOpts.version,
          config,
        });

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
        console.error(`Error downloading FileInfoMap: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}