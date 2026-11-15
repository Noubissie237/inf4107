import { initials } from "@/lib/format";

type AvatarProps = {
  name: string;
  /** Image address; the initials are shown when it is missing. */
  src?: string | null;
  /** Diameter in pixels. */
  size?: number;
  /** Called when the image cannot be loaded. */
  onError?: () => void;
};

export function Avatar({ name, src, size = 32, onError }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size / 2.6) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimization
    return <img src={src} alt="" style={style} onError={onError} className="rounded-full object-cover ring-2 ring-surface shadow-card" />;
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ring-2 ring-surface"
    >
      {initials(name)}
    </span>
  );
}
