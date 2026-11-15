const MATRICULE_RE = /^\d{2}u\d{4}$/;
const gradeFormat = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const ABSENT = "—";

/** French format with two decimals (14,50), or "—" when the grade is missing. */
export function formatGrade(value: number | null): string {
  return value === null ? ABSENT : gradeFormat.format(value);
}

/** First letters of the first two words of the name, in capitals. */
export function initials(fullName: string): string {
  const letters = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase());
  return letters.join("") || "?";
}

/** Trim spaces and lowercase, as the API expects. */
export function normalizeMatricule(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidMatricule(value: string): boolean {
  return MATRICULE_RE.test(value);
}
