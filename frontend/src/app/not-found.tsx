import Link from "next/link";

import { buttonPrimary, eyebrow } from "@/components/styles";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className={eyebrow}>Erreur 404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="mt-4 text-muted">Cette page n&apos;existe pas.</p>
      <Link href="/" className={`${buttonPrimary} mt-8`}>
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
