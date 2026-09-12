import { Command } from "commander";
import { createCdnCommand } from "./cdn";
import { createStatusCommand } from "./status";
import { createVersionCommand } from "./version";

export * from "./cdn";
export * from "./status";
export * from "./version";

/**
 * Creates the `updater` subcommand group for the commander program.
 */
export function createUpdaterCommand(): Command {
  const cmd = new Command("updater")
    .description(
      "Query Lineage 2 updater server for version, status, and CDN information"
    );

  cmd.addCommand(createVersionCommand());
  cmd.addCommand(createStatusCommand());
  cmd.addCommand(createCdnCommand());

  return cmd;
}
