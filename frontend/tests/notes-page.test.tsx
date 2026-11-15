import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NotesPage from "@/app/notes/page";
import { ApiError } from "@/lib/api";
import type { GradesResponse } from "@/lib/api";

import { ME, router, setAuth } from "./helpers";

const api = vi.hoisted(() => ({ getGrades: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getGrades: api.getGrades,
}));
vi.mock("next/navigation", async () => {
  const helpers = await import("./helpers");
  return { usePathname: () => "/notes/", useRouter: () => helpers.router };
});
vi.mock("@/lib/auth", async () => {
  const helpers = await import("./helpers");
  return { useAuth: () => helpers.authState.current };
});

const GRADES_S1: GradesResponse = {
  matricule: "20u2671",
  semester: "S1",
  courses: [
    { code: "INF4101", title: "Génie logiciel avancé", credits: 4, cc: 14.5, tp: 12, sn: 10, average: 11.45 },
    { code: "INF4108", title: "Architecture logicielle", credits: 3, cc: 9.25, tp: null, sn: 12, average: null },
  ],
};
const EMPTY_S2: GradesResponse = { matricule: "20u2671", semester: "S2", courses: [] };

function loggedIn() {
  return setAuth({
    status: "authenticated",
    user: ME,
    authenticated: <T,>(call: (token: string) => Promise<T>) => call("jwt"),
  });
}

beforeEach(() => {
  api.getGrades.mockReset();
  router.replace.mockReset();
  loggedIn();
});

describe("NotesPage", () => {
  it("shows a loading skeleton, then the table for S1", async () => {
    let resolve!: (value: GradesResponse) => void;
    api.getGrades.mockReturnValue(new Promise<GradesResponse>((r) => (resolve = r)));
    render(<NotesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Chargement des notes");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Semestre S1", { selector: "p" })).toBeInTheDocument();

    resolve(GRADES_S1);
    expect(await screen.findByRole("table", { name: "Notes du semestre S1" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(api.getGrades).toHaveBeenCalledWith("jwt", "S1");
    expect(screen.getAllByText("Note absente").length).toBeGreaterThan(0);
  });

  it("asks for S2 when the semester changes and shows the empty state", async () => {
    api.getGrades.mockImplementation((_token: string, semester: string) =>
      Promise.resolve(semester === "S1" ? GRADES_S1 : EMPTY_S2),
    );
    render(<NotesPage />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Semestre"), { target: { value: "S2" } });

    expect(await screen.findByText("Aucune note pour ce semestre.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(api.getGrades).toHaveBeenLastCalledWith("jwt", "S2");
    expect(screen.getByText("Semestre S2", { selector: "p" })).toBeInTheDocument();
  });

  it("offers S1 and S2, S1 selected by default", () => {
    api.getGrades.mockReturnValue(new Promise(() => {}));
    render(<NotesPage />);
    const select = screen.getByLabelText("Semestre") as HTMLSelectElement;
    expect(select.value).toBe("S1");
    expect([...select.options].map((o) => o.value)).toEqual(["S1", "S2"]);
  });

  it("shows the error with a retry button, and retries", async () => {
    api.getGrades
      .mockRejectedValueOnce(new ApiError(0, "Impossible de joindre le serveur"))
      .mockResolvedValueOnce(GRADES_S1);
    render(<NotesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de joindre le serveur");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getGrades).toHaveBeenCalledTimes(2);
  });

  it("does not show an error for a 401 (the session handling takes over)", async () => {
    api.getGrades.mockRejectedValue(new ApiError(401, "Non authentifié"));
    render(<NotesPage />);
    await waitFor(() => expect(api.getGrades).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores an answer that arrives after the semester changed", async () => {
    let resolveS1!: (value: GradesResponse) => void;
    api.getGrades.mockImplementation((_token: string, semester: string) =>
      semester === "S1"
        ? new Promise<GradesResponse>((r) => (resolveS1 = r))
        : Promise.resolve(EMPTY_S2),
    );
    render(<NotesPage />);
    fireEvent.change(screen.getByLabelText("Semestre"), { target: { value: "S2" } });
    expect(await screen.findByText("Aucune note pour ce semestre.")).toBeInTheDocument();

    resolveS1(GRADES_S1); // late answer for S1

    await waitFor(() => expect(screen.getByText("Aucune note pour ce semestre.")).toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("redirects an anonymous visitor to the login page without calling the API", () => {
    setAuth({ status: "anonymous" });
    render(<NotesPage />);
    expect(router.replace).toHaveBeenCalledWith("/connexion/");
    expect(api.getGrades).not.toHaveBeenCalled();
  });
});
