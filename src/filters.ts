/**
 * Categories of client files available for filtering update downloads.
 */
export type DownloadFilter =
  | "default"
  | "database"
  | "db"
  | "items"
  | "skills"
  | "textures"
  | "all";

export const LARGE_DOWNLOAD_WARNING =
  "⚠️  WARNING: Downloading all files entails a very large download size (often 20-40+ GB) " +
  "and carries a significant risk of CDN rate-limiting or throttling.\n" +
  "   Consider filtering with --filter <default|items|skills|textures> or specifying --delay and --concurrency.";

const ITEMS_REGEX = /(?:itemname|armorgrp|weapongrp|etcitemgrp|itemstatdata|setfeed|productdata)/i;
const SKILLS_REGEX = /(?:skillname|skillgrp|skill_trees|skillsoundgrp|transform|actionname)/i;
const QUESTS_REGEX = /(?:questname)/i;
const MONSTERS_REGEX = /(?:npcname|npcgrp|raiddata|castlename|zonename|huntingzone)/i;
const OTHER_DB_REGEX = /(?:recipe|symbolname|charcreationinfo|chargrp|hennagrp|sysstring|systemmsg|obscene|credit)/i;
const TEXTURES_REGEX = /(?:systextures|textures|\.utx$)/i;

/**
 * Checks if a relative file path matches the given filter category.
 */
export function matchesFilterCategory(filePath: string, category: string): boolean {
  const normalized = filePath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  const cat = category.trim().toLowerCase();

  switch (cat) {
    case "all":
      return true;

    case "textures":
      return TEXTURES_REGEX.test(normalized);

    case "items":
      return ITEMS_REGEX.test(normalized);

    case "skills":
      return SKILLS_REGEX.test(normalized);

    case "quests":
      return QUESTS_REGEX.test(normalized);

    case "monsters":
    case "npcs":
      return MONSTERS_REGEX.test(normalized);

    case "default":
    case "database":
    case "db":
      // Database building assets: items, skills, quests, monster names, recipes, and client system .dat tables
      if (
        ITEMS_REGEX.test(normalized) ||
        SKILLS_REGEX.test(normalized) ||
        QUESTS_REGEX.test(normalized) ||
        MONSTERS_REGEX.test(normalized) ||
        OTHER_DB_REGEX.test(normalized)
      ) {
        return true;
      }
      // Any .dat file under system/ (excluding manifests in Patch/)
      if (normalized.toLowerCase().startsWith("system/") && normalized.toLowerCase().endsWith(".dat")) {
        return true;
      }
      return false;

    default:
      // Fallback: match by substring or case-insensitive pattern
      return normalized.toLowerCase().includes(cat);
  }
}

/**
 * Filters a list of file paths based on one or more filter categories (comma-separated or array).
 */
export function filterFileList(
  files: string[],
  filter: DownloadFilter | string | string[] = "default"
): string[] {
  const categories: string[] = Array.isArray(filter)
    ? filter
    : filter.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);

  if (categories.length === 0 || categories.includes("all")) {
    return [...files];
  }

  return files.filter((file) =>
    categories.some((category) => matchesFilterCategory(file, category))
  );
}

/**
 * Determines whether a given filter string represents the "all" files filter.
 */
export function isAllFilter(filter?: string | string[]): boolean {
  if (!filter) return false;
  const categories: string[] = Array.isArray(filter)
    ? filter
    : filter.split(",").map((c) => c.trim().toLowerCase());
  return categories.includes("all");
}
