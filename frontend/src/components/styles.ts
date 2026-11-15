// Shared class names for buttons, form fields and cards, so the look is defined once.
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

export const buttonPrimary = `${base} bg-accent text-white shadow-card hover:bg-accent-strong`;
export const buttonSecondary = `${base} border border-line bg-surface text-ink shadow-card hover:bg-page`;
export const inputField =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink shadow-card placeholder:text-muted/70 focus:border-accent aria-[invalid=true]:border-danger";
export const card = "rounded-card border border-line bg-surface shadow-card";
export const eyebrow = "text-xs font-semibold uppercase tracking-[0.16em] text-accent";
