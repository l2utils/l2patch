import { Command } from "commander";
import {
  requireGameId,
  requireUpdaterHost,
  requireUpdaterPort,
} from "../../config";
import { queryUpdaterStatus } from "../../version";
import { buildConfigFromCli } from "../common";

/**
 * Creates the `status` command for querying server readiness (Opcode 0x0004).
 */
export function createStatusCommand(): Command {
  return new Command("status")
    .description(
      "Query updater server readiness and maintenance gate (Opcode 0x0004)"
    )
    .option(
      "--updater-host <host>",
      "Updater TCP host (e.g. updater.nclauncher.ncsoft.com)"
    )
    .option("--updater-port <port>", "Updater TCP port (default: 27500)")
    .option("--game-id <id>", "NCSoft Game ID (e.g. LINEAGE2)")
    .option("--timeout <ms>", "Socket timeout in milliseconds", "5000")
    .option("--json", "Output status information as JSON")
    .action(async (cmdOpts, cmd) => {
      try {
        const config = buildConfigFromCli(cmd, cmdOpts);
        const host = requireUpdaterHost(config);
        const port = config.updaterPort || 27500;
        const gameId = config.gameId || "LINEAGE2";
        const timeoutMs = parseInt(cmdOpts.timeout, 10) || 5000;

        const statusInfo = await queryUpdaterStatus(host, port, gameId, timeoutMs);

        if (cmdOpts.json) {
          console.log(JSON.stringify(statusInfo, null, 2));
        } else {
          console.log(statusInfo.status);
        }
      } catch (err) {
        console.error(`Error querying updater status: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
