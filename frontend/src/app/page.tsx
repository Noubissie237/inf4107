import { ConsultButton } from "@/components/ConsultButton";

const POINTS = [
  "Consultez vos notes de CC, de TP et de SN pour chaque matière.",
  "Voyez la moyenne de chaque matière.",
  "Personnalisez votre photo de profil.",
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">
        Vos résultats, en un seul endroit
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Le Portail des résultats vous permet de consulter vos notes et de gérer votre photo de
        profil.
      </p>
      <div className="mt-8">
        <ConsultButton />
      </div>
      <ul className="mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
        {POINTS.map((point) => (
          <li key={point} className="rounded-card border border-line bg-surface p-4 text-sm">
            {point}
          </li>
        ))}
      </ul>
    </main>
  );
}
