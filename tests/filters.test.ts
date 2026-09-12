import {
  filterFileList,
  isAllFilter,
  LARGE_DOWNLOAD_WARNING,
  matchesFilterCategory,
} from "../src/filters";

describe("filters", () => {
  const sampleFiles = [
    "system/itemname-e.dat",
    "system/armorgrp.dat",
    "system/weapongrp.dat",
    "system/etcitemgrp.dat",
    "system/itemstatdata.dat",
    "system/skillname-e.dat",
    "system/skillgrp.dat",
    "system/skill_trees.dat",
    "system/questname-e.dat",
    "system/npcname-e.dat",
    "system/npcgrp.dat",
    "system/raiddata.dat",
    "system/recipe-c.dat",
    "system/zonename-e.dat",
    "system/castlename-e.dat",
    "system/sysstring-e.dat",
    "system/core.dll",
    "system/L2.bin",
    "textures/l2font.utx",
    "systextures/weapon.utx",
    "animations/m_fighter.ukx",
    "staticmeshes/castle.usx",
    "sounds/ambient.ogg",
  ];

  describe("matchesFilterCategory", () => {
    test("matches items", () => {
      expect(matchesFilterCategory("system/itemname-e.dat", "items")).toBe(true);
      expect(matchesFilterCategory("system/armorgrp.dat", "items")).toBe(true);
      expect(matchesFilterCategory("system/skillname-e.dat", "items")).toBe(false);
    });

    test("matches skills", () => {
      expect(matchesFilterCategory("system/skillname-e.dat", "skills")).toBe(true);
      expect(matchesFilterCategory("system/skillgrp.dat", "skills")).toBe(true);
      expect(matchesFilterCategory("system/itemname-e.dat", "skills")).toBe(false);
    });

    test("matches textures", () => {
      expect(matchesFilterCategory("textures/l2font.utx", "textures")).toBe(true);
      expect(matchesFilterCategory("systextures/ui.utx", "textures")).toBe(true);
      expect(matchesFilterCategory("system/itemname-e.dat", "textures")).toBe(false);
    });

    test("matches quests and monsters", () => {
      expect(matchesFilterCategory("system/questname-e.dat", "quests")).toBe(true);
      expect(matchesFilterCategory("system/npcname-e.dat", "monsters")).toBe(true);
      expect(matchesFilterCategory("system/npcgrp.dat", "npcs")).toBe(true);
    });

    test("all matches everything", () => {
      expect(matchesFilterCategory("anything/file.xyz", "all")).toBe(true);
    });
  });

  describe("filterFileList", () => {
    test("filters to default database building files", () => {
      const filtered = filterFileList(sampleFiles, "default");
      expect(filtered).toContain("system/itemname-e.dat");
      expect(filtered).toContain("system/skillname-e.dat");
      expect(filtered).toContain("system/questname-e.dat");
      expect(filtered).toContain("system/npcname-e.dat");
      expect(filtered).toContain("system/recipe-c.dat");
      expect(filtered).toContain("system/zonename-e.dat");
      expect(filtered).toContain("system/sysstring-e.dat");

      // Non-database assets must be excluded
      expect(filtered).not.toContain("system/core.dll");
      expect(filtered).not.toContain("system/L2.bin");
      expect(filtered).not.toContain("textures/l2font.utx");
      expect(filtered).not.toContain("systextures/weapon.utx");
      expect(filtered).not.toContain("animations/m_fighter.ukx");
      expect(filtered).not.toContain("staticmeshes/castle.usx");
      expect(filtered).not.toContain("sounds/ambient.ogg");
    });

    test("filters to items only", () => {
      const filtered = filterFileList(sampleFiles, "items");
      expect(filtered).toEqual([
        "system/itemname-e.dat",
        "system/armorgrp.dat",
        "system/weapongrp.dat",
        "system/etcitemgrp.dat",
        "system/itemstatdata.dat",
      ]);
    });

    test("filters to skills only", () => {
      const filtered = filterFileList(sampleFiles, "skills");
      expect(filtered).toEqual([
        "system/skillname-e.dat",
        "system/skillgrp.dat",
        "system/skill_trees.dat",
      ]);
    });

    test("filters to textures only", () => {
      const filtered = filterFileList(sampleFiles, "textures");
      expect(filtered).toEqual([
        "textures/l2font.utx",
        "systextures/weapon.utx",
      ]);
    });

    test("filters to comma-separated categories (items,skills)", () => {
      const filtered = filterFileList(sampleFiles, "items,skills");
      expect(filtered).toContain("system/itemname-e.dat");
      expect(filtered).toContain("system/skillname-e.dat");
      expect(filtered).not.toContain("system/questname-e.dat");
      expect(filtered).not.toContain("textures/l2font.utx");
    });

    test("returns all files when filter is all", () => {
      const filtered = filterFileList(sampleFiles, "all");
      expect(filtered).toHaveLength(sampleFiles.length);
      expect(filtered).toEqual(sampleFiles);
    });

    test("defaults to default filter when omitted", () => {
      const filtered = filterFileList(sampleFiles);
      expect(filtered).toContain("system/itemname-e.dat");
      expect(filtered).not.toContain("textures/l2font.utx");
    });
  });

  describe("isAllFilter and LARGE_DOWNLOAD_WARNING", () => {
    test("isAllFilter correctly detects all", () => {
      expect(isAllFilter("all")).toBe(true);
      expect(isAllFilter("items,all")).toBe(true);
      expect(isAllFilter(["all"])).toBe(true);
      expect(isAllFilter("items")).toBe(false);
      expect(isAllFilter(undefined)).toBe(false);
    });

    test("LARGE_DOWNLOAD_WARNING contains throttling and large size warnings", () => {
      expect(LARGE_DOWNLOAD_WARNING).toContain("WARNING");
      expect(LARGE_DOWNLOAD_WARNING).toContain("throttl");
      expect(LARGE_DOWNLOAD_WARNING).toContain("download size");
    });
  });
});
