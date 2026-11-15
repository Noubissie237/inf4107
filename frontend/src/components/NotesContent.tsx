"use client";

import { useEffect, useState } from "react";

import { GradesTable } from "@/components/GradesTable";
import { buttonSecondary, card, eyebrow, inputField } from "@/components/styles";
import { ApiError, getGrades } from "@/lib/api";
import type { GradesResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const SEMESTERS = ["S1", "S2"];

type Result = { key: string; grades?: GradesResponse; error?: string };

function GradesSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`${card} animate-pulse space-y-3 p-5`}
    >
      <span className="sr-only">Chargement des notes…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-7 rounded-md bg-line" />
      ))}
    </div>
  );
}

export function NotesContent() {
  const { authenticated } = useAuth();
  const [semester, setSemester] = useState("S1");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  // One request per (semester, attempt). Loading means "no result for the current key yet".
  const key = `${semester}:${attempt}`;
  const loading = result?.key !== key;

  useEffect(() => {
    let cancelled = false;
    authenticated((token) => getGrades(token, semester)).then(
      (grades) => {
        if (!cancelled) setResult({ key, grades });
      },
      (error: unknown) => {
        // a 401 logs the user out and the page is replaced: nothing to show
        if (!cancelled && !(error instanceof ApiError && error.status === 401)) {
          setResult({
            key,
            error: error instanceof ApiError ? error.detail : "Impossible de joindre le serveur",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authenticated, semester, key]);

  const courses = loading ? undefined : result?.grades?.courses;
  const summary = courses?.length
    ? `${courses.length} matières · ${courses.reduce((sum, course) => sum + course.credits, 0)} crédits`
    : "";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrow}>Semestre {semester}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mes notes</h1>
          {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="semester" className="text-sm font-medium">
            Semestre
          </label>
          <select
            id="semester"
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
            className={`${inputField} inline-block w-auto pr-8`}
          >
            {SEMESTERS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6">
        {loading && <GradesSkeleton />}
        {!loading && result?.error && (
          <div role="alert" className={`${card} p-6`}>
            <p className="text-danger">{result.error}</p>
            <button
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
              className={`${buttonSecondary} mt-4`}
            >
              Réessayer
            </button>
          </div>
        )}
        {!loading && result?.grades && result.grades.courses.length === 0 && (
          <p className={`${card} p-8 text-center text-muted`}>
            Aucune note pour ce semestre.
          </p>
        )}
        {!loading && result?.grades && result.grades.courses.length > 0 && (
          <GradesTable courses={result.grades.courses} semester={semester} />
        )}
      </div>
    </main>
  );
}
