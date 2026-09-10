import { Command } from "commander";
import {
  requireGameId,
  requireUpdaterHost,
  requireUpdaterPort,
  updateDotEnv,
} from "../config";
import { queryCdnConfig } from "../version";
import { buildConfigFromCli } from "./common";

/**
 * Creates the `cdn` command for the commander program.
 */
export function createCdnCommand(): Command {
  return new Command("cdn")
    .description(
      "Query the active CDN host from the updater server (Opcode 0x0003)"
    )
    .option(
      "--updater-host <host>",
      "Updater TCP host (e.g. updater.nclauncher.ncsoft.com)"
    )
    .option("--updater-port <port>", "Updater TCP port (default: 27500)")
    .option("--game-id <id>", "NCSoft Game ID (e.g. LINEAGE2)")
    .option("--json", "Output CDN configuration as JSON")
    .option("--env", "Output formatted as .env variable (L2_PATCH_CDN_HOST=...)")
    .option(
      "--set-env",
      "Write retrieved CDN host and base URL to local .env file"
    )
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        const host = requireUpdaterHost(config);
        const port = config.updaterPort || 27500;
        const gameId = config.gameId || "LINEAGE2";

        const cdnInfo = await queryCdnConfig(host, port, gameId);
        if (cmdOpts.setEnv) {
          updateDotEnv({
            L2_PATCH_CDN_HOST: cdnInfo.cdnHost,
            L2_PATCH_BASE_URL: cdnInfo.baseUrl,
          });
        }

        if (cmdOpts.json) {
          console.log(JSON.stringify(cdnInfo, null, 2));
        } else if (cmdOpts.env) {
          console.log(`L2_PATCH_CDN_HOST=${cdnInfo.cdnHost}`);
          console.log(`L2_PATCH_BASE_URL=${cdnInfo.baseUrl}`);
        } else {
          console.log(cdnInfo.cdnHost);
        }
      } catch (err) {
        console.error(`Error querying CDN config: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
