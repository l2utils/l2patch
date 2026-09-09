import { Command } from "commander";
import { requireVersionUrl, updateDotEnv } from "../config";
import { checkCurrentVersion } from "../version";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `version` command for the commander program.
 */
export function createVersionCommand(): Command {
  return new Command("version")
    .description("Check the latest or current Lineage 2 client patch version")
    .option("--json", "Output version information as JSON")
    .option("--set-env", "Write retrieved version to local .env file")
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
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
}
