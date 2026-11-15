import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireAuth } from "@/components/RequireAuth";

import { ME, router, setAuth } from "./helpers";

vi.mock("next/navigation", async () => {
  const helpers = await import("./helpers");
  return { usePathname: () => "/notes/", useRouter: () => helpers.router };
});
vi.mock("@/lib/auth", async () => {
  const helpers = await import("./helpers");
  return { useAuth: () => helpers.authState.current };
});

beforeEach(() => {
  router.replace.mockReset();
});

describe("RequireAuth", () => {
  it("shows the content to an authenticated user", () => {
    setAuth({ status: "authenticated", user: ME });
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("redirects an anonymous user to the login page", () => {
    setAuth({ status: "anonymous" });
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/connexion/");
  });

  it("waits without redirecting while the session is being restored", () => {
    setAuth({ status: "loading" });
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Chargement");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
