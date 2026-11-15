"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { buttonPrimary, buttonSecondary, card, eyebrow, inputField } from "@/components/styles";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isValidMatricule, normalizeMatricule } from "@/lib/format";

const MATRICULE_ERROR = "Format attendu : 20u2671";
const NETWORK_ERROR = "Impossible de joindre le serveur";

export default function LoginPage() {
  const { status, login, sessionExpired } = useAuth();
  const router = useRouter();
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [matriculeError, setMatriculeError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Logged in (just now or earlier): go to the grades
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/notes/");
    }
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = normalizeMatricule(matricule);
    setMatricule(cleaned);
    setFormError("");
    if (!isValidMatricule(cleaned)) {
      setMatriculeError(MATRICULE_ERROR); // refused before sending anything
      return;
    }
    setMatriculeError("");
    setSubmitting(true);
    try {
      await login(cleaned, password);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.detail : NETWORK_ERROR);
      setSubmitting(false);
    }
  }

  if (status !== "anonymous") {
    return (
      <p role="status" className="mx-auto max-w-6xl px-4 py-24 text-center text-muted">
        Chargement…
      </p>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl items-stretch gap-6 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section aria-labelledby="login-title" className={`${card} w-full p-6 sm:p-8`}>
        <p className={eyebrow}>Espace étudiant</p>
        <h1
          id="login-title"
          className="mt-2 text-2xl font-semibold tracking-tight"
        >
          Connexion
        </h1>

        {sessionExpired && (
          <p role="status" className="mt-6 rounded-lg bg-accent-soft p-3 text-sm text-accent-strong">
            Votre session a expiré.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          <div>
            <label htmlFor="matricule" className="block text-sm font-medium">
              Matricule
            </label>
            <input
              id="matricule"
              name="matricule"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="20u2671"
              value={matricule}
              onChange={(event) => setMatricule(event.target.value)}
              aria-invalid={matriculeError ? true : undefined}
              aria-describedby={matriculeError ? "matricule-error" : "matricule-hint"}
              className={`${inputField} mt-1`}
            />
            {matriculeError ? (
              <p id="matricule-error" className="mt-1 text-sm text-danger">
                {matriculeError}
              </p>
            ) : (
              <p id="matricule-hint" className="mt-1 text-sm text-muted">
                Exemple : 20u2671
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Mot de passe
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputField}
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-pressed={showPassword}
                className={`${buttonSecondary} shrink-0`}
              >
                {showPassword ? "Masquer" : "Afficher"}
              </button>
            </div>
          </div>

          <div aria-live="polite" className="min-h-5 text-sm font-medium text-danger">
            {formError}
          </div>

          <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
            {submitting && (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 animate-spin"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <circle cx="12" cy="12" r="9" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
              </svg>
            )}
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </section>

      <aside className="relative hidden overflow-hidden rounded-card bg-accent p-8 text-white shadow-pop lg:flex lg:flex-col lg:justify-end">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/5"
        />
        <div className="relative">
          <h2 className="text-2xl font-semibold tracking-tight">Vos résultats en ligne</h2>
          <p className="mt-3 max-w-md leading-relaxed text-white/85">
            Connectez-vous avec votre matricule pour consulter vos notes de contrôle continu, de
            travaux pratiques et de session normale, et pour mettre à jour votre photo de profil.
          </p>
        </div>
      </aside>
    </main>
  );
}
