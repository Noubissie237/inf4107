"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Avatar } from "@/components/Avatar";
import { buttonPrimary, card, eyebrow } from "@/components/styles";
import { ApiError, uploadPhoto } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const NETWORK_ERROR = "Impossible de joindre le serveur";

type Selected = { file: File; previewUrl: string };

/** Client-side checks before sending; the server checks again (it has the last word). */
function checkFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Format non supporté : choisissez une image JPEG ou PNG.";
  }
  if (file.size > MAX_BYTES) {
    return "Photo trop volumineuse (2 Mo maximum).";
  }
  return null;
}

export function ProfileContent() {
  const { user, photoSrc, reportPhotoError, authenticated, refreshUser } = useAuth();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  // Changing the key empties the file input after a successful upload
  const [inputKey, setInputKey] = useState(0);

  const previewUrl = selected?.previewUrl;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!user) {
    return null; // RequireAuth only renders this page for a logged-in user
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSuccess("");
    setSelected(null);
    if (!file) {
      setError("");
      return;
    }
    const problem = checkFile(file);
    setError(problem ?? "");
    if (!problem) {
      setSelected({ file, previewUrl: URL.createObjectURL(file) });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setSuccess("");
    setUploading(true);
    try {
      await authenticated((token) => uploadPhoto(token, selected.file));
      await refreshUser(); // new photo in the page and in the header
      setSelected(null);
      setInputKey((key) => key + 1);
      setSuccess("Votre photo de profil a été enregistrée.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : NETWORK_ERROR);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className={eyebrow}>Espace étudiant</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mon profil</h1>

      <div className="mt-8 grid items-start gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div className={`${card} flex flex-col items-center p-8 text-center`}>
          <Avatar name={user.full_name} src={photoSrc} size={128} onError={reportPhotoError} />
          <dl className="mt-5 text-sm">
            <dt className="sr-only">Nom</dt>
            <dd className="text-xl font-semibold tracking-tight">{user.full_name}</dd>
            <dt className="sr-only">Matricule</dt>
            <dd className="mt-2 inline-block rounded-full bg-accent-soft px-3 py-1 font-medium tabular-nums text-accent">
              {user.matricule}
            </dd>
          </dl>
        </div>

        <form onSubmit={handleSubmit} className={`${card} p-6 sm:p-8`}>
          <h2 className="text-lg font-semibold tracking-tight">Photo de profil</h2>
          <label htmlFor="photo" className="mt-4 block text-sm font-medium">
            Choisir une photo
          </label>
          <input
            key={inputKey}
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleChange}
            aria-describedby="photo-hint"
            className="mt-1 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-page file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-line/50"
          />
          <p id="photo-hint" className="mt-1 text-sm text-muted">
            JPEG ou PNG, 2 Mo maximum.
          </p>

          {selected && (
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-page p-3">
              <Avatar name={user.full_name} src={selected.previewUrl} size={64} />
              <p className="text-sm text-muted">Aperçu avant enregistrement</p>
            </div>
          )}

          <div aria-live="polite" className="mt-4 min-h-5 text-sm">
            {error && <p className="font-medium text-danger">{error}</p>}
            {success && <p className="rounded-lg bg-success-soft px-3 py-2 font-medium text-success">{success}</p>}
          </div>

          <button
            type="submit"
            disabled={!selected || uploading}
            className={`${buttonPrimary} mt-2`}
          >
            {uploading && (
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
            {uploading ? "Enregistrement…" : "Enregistrer la photo"}
          </button>
        </form>
      </div>
    </main>
  );
}
