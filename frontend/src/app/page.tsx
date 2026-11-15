import { ConsultButton } from "@/components/ConsultButton";
import { card, eyebrow } from "@/components/styles";

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const POINTS = [
  {
    text: "Consultez vos notes de CC, de TP et de SN pour chaque matière.",
    icon: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
  {
    text: "Voyez la moyenne de chaque matière.",
    icon: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  },
  {
    text: "Personnalisez votre photo de profil.",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <section className="mx-auto max-w-3xl text-center">
        <p className={eyebrow}>Espace étudiant</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Vos résultats, en un seul endroit
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Le Portail des résultats vous permet de consulter vos notes et de gérer votre photo de
          profil.
        </p>
        <div className="mt-8 flex justify-center">
          <ConsultButton />
        </div>
      </section>
      <ul className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
        {POINTS.map((point) => (
          <li key={point.text} className={`${card} p-5`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" {...ICON}>
                {point.icon}
              </svg>
            </span>
            <p className="mt-4 text-sm leading-relaxed">{point.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
