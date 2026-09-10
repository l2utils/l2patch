#!/usr/bin/env node
import { Command } from "commander";
import {
  createDownloadCommand,
  createFileInfoMapCommand,
  createPatchFileInfoCommand,
  createUpdaterCommand,
} from "./commands";

const program = new Command();

program
  .name("l2patch")
  .description("Lineage 2 client patch inspection and file download utility")
  .version("1.0.0");

// Subcommand groups
program.addCommand(createUpdaterCommand());
program.addCommand(createDownloadCommand());

// Manifest utility commands
program.addCommand(createFileInfoMapCommand());
program.addCommand(createPatchFileInfoCommand());

program.parse(process.argv);
