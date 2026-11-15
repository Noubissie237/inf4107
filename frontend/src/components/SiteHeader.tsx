"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

import { Avatar } from "@/components/Avatar";
import { buttonPrimary, buttonSecondary } from "@/components/styles";
import { useAuth } from "@/lib/auth";

const linkClass = "rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-page hover:text-ink";
const activeClass = "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent";

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

function Logo() {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={50}
      height={50}
      priority
    />
  );
}

export function SiteHeader() {
  const { status, user, photoSrc, reportPhotoError, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
            <Logo />
          Portail des résultats
        </Link>
        <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1.5">
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
              <span className="mx-2 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
              <span className="flex items-center gap-2 pr-1 text-sm">
                <Avatar name={user.full_name} src={photoSrc} onError={reportPhotoError} />
                <span className="hidden font-medium sm:inline">{user.full_name}</span>
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
