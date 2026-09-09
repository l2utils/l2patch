import { Command } from "commander";
import { resolveConfig } from "../config";
import { PatchConfig } from "../types";

/**
 * Builds the effective PatchConfig from command-specific and global CLI options.
 */
export function buildConfigFromCli(
  cmd: Command,
  cmdOpts: Record<string, unknown>
): PatchConfig {
  const globalOpts =
    typeof cmd.optsWithGlobals === "function"
      ? cmd.optsWithGlobals()
      : cmd.opts();

  const cdnHost =
    (cmdOpts.cdnHost as string) || (globalOpts.cdnHost as string) || undefined;
  const gameId =
    (cmdOpts.gameId as string) || (globalOpts.gameId as string) || undefined;
  const updaterHost =
    (cmdOpts.updaterHost as string) ||
    (globalOpts.updaterHost as string) ||
    undefined;
  const updaterPortStr =
    (cmdOpts.updaterPort as string) ||
    (globalOpts.updaterPort as string) ||
    undefined;
  const baseUrl =
    (cmdOpts.baseUrl as string) || (globalOpts.baseUrl as string) || undefined;
  const versionUrl =
    (cmdOpts.versionUrl as string) ||
    (globalOpts.versionUrl as string) ||
    undefined;
  const authToken =
    (cmdOpts.authToken as string) || (globalOpts.authToken as string) || undefined;

  return resolveConfig({
    baseUrl,
    cdnHost,
    updaterHost,
    updaterPort: updaterPortStr ? parseInt(updaterPortStr, 10) : undefined,
    gameId,
    versionUrl,
    authToken,
  });
}
