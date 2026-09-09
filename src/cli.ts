#!/usr/bin/env node
import { Command } from "commander";
import {
  createCdnCommand,
  createDownloadCommand,
  createDownloadVersionCommand,
  createManifestCommand,
  createVersionCommand,
} from "./commands";

const program = new Command();

program
  .name("l2patch")
  .description("Lineage 2 client patch inspection and file download utility")
  .version("1.0.0");

// Global options that apply across commands
program
  .option("--base-url <url>", "Base URL of the patch server / CDN")
  .option(
    "--cdn-host <host>",
    "CDN Host of the patch server (e.g. d35293xeakkyq4.cloudfront.net)"
  )
  .option(
    "--updater-host <host>",
    "Updater TCP host (e.g. updater.nclauncher.ncsoft.com)"
  )
  .option("--updater-port <port>", "Updater TCP port")
  .option("--game-id <id>", "NCSoft Game ID (e.g. LINEAGE2)")
  .option(
    "--version-url <url>",
    "URL of the version check endpoint or manifest"
  )
  .option(
    "--auth-token <token>",
    "Authorization token for protected endpoints"
  );

// Add individual commands using addCommand
program.addCommand(createCdnCommand());
program.addCommand(createVersionCommand());
program.addCommand(createManifestCommand());
program.addCommand(createDownloadCommand());
program.addCommand(createDownloadVersionCommand());

program.parse(process.argv);

