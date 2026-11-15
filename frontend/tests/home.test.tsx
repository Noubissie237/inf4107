import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

import { ME, setAuth } from "./helpers";

vi.mock("@/lib/auth", async () => {
  const helpers = await import("./helpers");
  return { useAuth: () => helpers.authState.current };
});

describe("HomePage", () => {
  it("presents the platform and its three features", () => {
    setAuth();
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("sends a visitor to the login page", () => {
    setAuth({ status: "anonymous" });
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Consulter mes notes" })).toHaveAttribute("href", expect.stringMatching(new RegExp("^/connexion/?$")));
  });

  it("sends a logged-in student to the grades", () => {
    setAuth({ status: "authenticated", user: ME });
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Consulter mes notes" })).toHaveAttribute("href", expect.stringMatching(new RegExp("^/notes/?$")));
  });
});
