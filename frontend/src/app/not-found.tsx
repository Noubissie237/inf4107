import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="mt-4 text-muted">Cette page n&apos;existe pas.</p>
      <Link href="/" className="mt-6 inline-block font-medium text-accent underline">
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
