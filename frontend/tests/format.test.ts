import { describe, expect, it } from "vitest";

import { formatGrade, initials, isValidMatricule, normalizeMatricule } from "@/lib/format";

describe("formatGrade", () => {
  it("uses the French format with two decimals", () => {
    expect(formatGrade(14.5)).toBe("14,50");
    expect(formatGrade(12)).toBe("12,00");
    expect(formatGrade(11.08)).toBe("11,08");
    expect(formatGrade(0)).toBe("0,00");
    expect(formatGrade(20)).toBe("20,00");
  });

  it("shows a dash for a missing grade", () => {
    expect(formatGrade(null)).toBe("—");
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Estelle Diallo")).toBe("ED");
    expect(initials("awa ndiaye")).toBe("AN");
  });

  it("ignores extra words and spaces", () => {
    expect(initials("  Jean  Pierre Martin ")).toBe("JP");
  });

  it("handles a single word and an empty name", () => {
    expect(initials("Madonna")).toBe("M");
    expect(initials("   ")).toBe("?");
  });
});

describe("matricule", () => {
  it("is trimmed and lowercased", () => {
    expect(normalizeMatricule("  20U2671 ")).toBe("20u2671");
  });

  it("accepts only the expected format", () => {
    expect(isValidMatricule("20u2671")).toBe(true);
    for (const bad of ["", "20U2671", "2671", "20u267", "20u26711", "20x2671", "20u2671 "]) {
      expect(isValidMatricule(bad)).toBe(false);
    }
  });
});
