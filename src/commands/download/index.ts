import { Command } from "commander";
import { createDownloadFileCommand } from "./file";
import { createDownloadVersionCommand } from "./version";

export * from "./file";
export * from "./version";

/**
 * Creates the `download` subcommand group for the commander program.
 */
export function createDownloadCommand(): Command {
  const cmd = new Command("download")
    .description("Download Lineage 2 client patch files and updates");

  cmd.addCommand(createDownloadFileCommand());
  cmd.addCommand(createDownloadVersionCommand());

  return cmd;
}
