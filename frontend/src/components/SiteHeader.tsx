"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { buttonPrimary, buttonSecondary } from "@/components/styles";
import { useAuth } from "@/lib/auth";

const linkClass = "rounded-card px-2 py-1 text-sm font-medium text-muted hover:text-ink";
const activeClass = "text-ink underline decoration-accent decoration-2 underline-offset-8";

function NavLink({ href, pathname, children }: { href: string; pathname: string; children: string }) {
  // With trailingSlash the path is "/notes/": compare without the trailing slash
  const active = pathname.replace(/\/$/, "") === href.replace(/\/$/, "");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${linkClass} ${active ? activeClass : ""}`}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { status, user, photoSrc, reportPhotoError, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Portail des résultats
        </Link>
        <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-2">
          {status === "anonymous" && (
            <Link href="/connexion/" className={buttonPrimary}>
              Connexion
            </Link>
          )}
          {status === "authenticated" && user && (
            <>
              <NavLink href="/notes/" pathname={pathname}>
                Mes notes
              </NavLink>
              <NavLink href="/profil/" pathname={pathname}>
                Mon profil
              </NavLink>
              <span className="ml-2 flex items-center gap-2 text-sm">
                <Avatar name={user.full_name} src={photoSrc} onError={reportPhotoError} />
                <span className="font-medium">{user.full_name}</span>
              </span>
              <button type="button" onClick={logout} className={buttonSecondary}>
                Se déconnecter
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
