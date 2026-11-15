import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/connexion/page";
import { ApiError } from "@/lib/api";

import { ME, router, setAuth } from "./helpers";

vi.mock("next/navigation", async () => {
  const helpers = await import("./helpers");
  return { usePathname: () => "/connexion/", useRouter: () => helpers.router };
});
vi.mock("@/lib/auth", async () => {
  const helpers = await import("./helpers");
  return { useAuth: () => helpers.authState.current };
});

function fill(matricule: string, password = "secret") {
  fireEvent.change(screen.getByLabelText("Matricule"), { target: { value: matricule } });
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
}

beforeEach(() => {
  router.replace.mockReset();
  setAuth();
});

describe("LoginPage", () => {
  it("shows the form with the example matricule", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
    expect(screen.getByLabelText("Matricule")).toHaveAttribute("placeholder", "20u2671");
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
  });

  it("refuses a badly formed matricule before sending anything", () => {
    const auth = setAuth();
    render(<LoginPage />);
    fill("abc");
    submit();
    expect(screen.getByText("Format attendu : 20u2671")).toBeInTheDocument();
    expect(screen.getByLabelText("Matricule")).toHaveAttribute("aria-invalid", "true");
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("trims and lowercases the matricule before sending", async () => {
    const auth = setAuth();
    render(<LoginPage />);
    fill("  20U2671 ", "my-password");
    submit();
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith("20u2671", "my-password"));
  });

  it("shows the server message when the login is refused", async () => {
    setAuth({
      login: vi.fn().mockRejectedValue(new ApiError(401, "Matricule ou mot de passe incorrect")),
    });
    render(<LoginPage />);
    fill("20u2671", "wrong");
    submit();
    expect(await screen.findByText("Matricule ou mot de passe incorrect")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it("says when the server cannot be reached", async () => {
    setAuth({
      login: vi.fn().mockRejectedValue(new ApiError(0, "Impossible de joindre le serveur")),
    });
    render(<LoginPage />);
    fill("20u2671");
    submit();
    expect(await screen.findByText("Impossible de joindre le serveur")).toBeInTheDocument();
  });

  it("announces errors to screen readers", async () => {
    setAuth({ login: vi.fn().mockRejectedValue(new ApiError(401, "Erreur annoncée")) });
    const { container } = render(<LoginPage />);
    fill("20u2671");
    submit();
    const message = await screen.findByText("Erreur annoncée");
    expect(message.closest("[aria-live]")).not.toBeNull();
    expect(container.querySelector("[aria-live='polite']")).toBe(message);
  });

  it("disables the button with a loading state while sending", async () => {
    let finish!: () => void;
    setAuth({ login: vi.fn().mockReturnValue(new Promise<void>((resolve) => (finish = resolve))) });
    render(<LoginPage />);
    fill("20u2671");
    submit();
    const button = await screen.findByRole("button", { name: "Connexion…" });
    expect(button).toBeDisabled();
    await act(async () => finish());
  });

  it("can show and hide the password", () => {
    render(<LoginPage />);
    const toggle = screen.getByRole("button", { name: "Afficher" });
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Masquer" }));
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
  });

  it("goes to the grades once logged in", () => {
    setAuth({ status: "authenticated", user: ME });
    render(<LoginPage />);
    expect(router.replace).toHaveBeenCalledWith("/notes/");
    expect(screen.queryByLabelText("Matricule")).not.toBeInTheDocument();
  });

  it("does not show the form nor redirect while the session is being restored", () => {
    setAuth({ status: "loading" });
    render(<LoginPage />);
    expect(screen.queryByLabelText("Matricule")).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("tells the user when the session has expired", () => {
    setAuth({ sessionExpired: true });
    render(<LoginPage />);
    expect(screen.getByText("Votre session a expiré.")).toBeInTheDocument();
  });
});
