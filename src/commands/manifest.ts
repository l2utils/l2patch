import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { requireBaseUrl } from "../config";
import { fetchManifest } from "../downloader";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `manifest` command for the commander program.
 */
export function createManifestCommand(): Command {
  return new Command("manifest")
    .description(
      "Download manifest for a specific version (or latest) and output to stdout"
    )
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
      "-o, --output <file>",
      "Save to a file instead of streaming to stdout"
    )
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        requireBaseUrl(config);

        const buffer = await fetchManifest(cmdOpts.version, {
          latest: cmdOpts.latest && !cmdOpts.version,
          type: cmdOpts.type as "patch" | "filemap",
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
        console.error(`Error downloading manifest: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
