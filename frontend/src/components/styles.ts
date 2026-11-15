// Shared class names for buttons and form fields, so the look is defined once.
const base =
  "inline-flex items-center justify-center gap-2 rounded-card px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export const buttonPrimary = `${base} bg-accent text-white hover:bg-accent-strong`;
export const buttonSecondary = `${base} border border-line bg-surface text-ink hover:bg-page`;
export const inputField =
  "block w-full rounded-card border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted/70 aria-[invalid=true]:border-danger";
