"use client";

import Link from "next/link";

import { buttonPrimary } from "@/components/styles";
import { useAuth } from "@/lib/auth";

export function ConsultButton() {
  const { status } = useAuth();
  const href = status === "authenticated" ? "/notes/" : "/connexion/";
  return (
    <Link href={href} className={buttonPrimary}>
      Consulter mes notes
    </Link>
  );
}
