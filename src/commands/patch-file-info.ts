import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { fetchPatchFileInfo } from "../downloader";
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
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const buffer = await fetchPatchFileInfo(cmdOpts.version, {
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
        console.error(`Error downloading PatchFileInfo: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}