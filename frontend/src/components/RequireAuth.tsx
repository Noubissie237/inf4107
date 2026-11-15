"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";

/**
 * Client-side guard for pages that need a session. It is NOT a security measure (a static
 * export has no server): the API is what protects the data.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/connexion/");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <p role="status" className="mx-auto max-w-6xl px-4 py-24 text-center text-muted">
        Chargement…
      </p>
    );
  }
  return <>{children}</>;
}
