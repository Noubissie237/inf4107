import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/SiteHeader";

import { ME, authState, navigation, setAuth } from "./helpers";

vi.mock("next/navigation", async () => {
  const helpers = await import("./helpers");
  return { usePathname: () => helpers.navigation.pathname, useRouter: () => helpers.router };
});
vi.mock("@/lib/auth", async () => {
  const helpers = await import("./helpers");
  return { useAuth: () => helpers.authState.current };
});

beforeEach(() => {
  navigation.pathname = "/";
  setAuth();
});

describe("SiteHeader", () => {
  it("shows the site name and a login button when logged out", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Portail des résultats" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Connexion" })).toHaveAttribute("href", expect.stringMatching(new RegExp("^/connexion/?$")));
    expect(screen.queryByRole("link", { name: "Mes notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Se déconnecter" })).not.toBeInTheDocument();
  });

  it("shows nothing on the right while the session is being restored", () => {
    setAuth({ status: "loading" });
    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: "Connexion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mes notes" })).not.toBeInTheDocument();
  });

  it("shows the links, the student and a logout button when logged in", () => {
    setAuth({ status: "authenticated", user: ME });
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Mes notes" })).toHaveAttribute("href", expect.stringMatching(new RegExp("^/notes/?$")));
    expect(screen.getByRole("link", { name: "Mon profil" })).toHaveAttribute("href", expect.stringMatching(new RegExp("^/profil/?$")));
    expect(screen.getByText("Estelle Diallo")).toBeInTheDocument();
    expect(screen.getByText("ED")).toBeInTheDocument(); // initials avatar
    expect(screen.queryByRole("link", { name: "Connexion" })).not.toBeInTheDocument();
  });

  it("shows the photo in the header, and reports an image that fails", () => {
    const auth = setAuth({ status: "authenticated", user: ME, photoSrc: "blob:photo" });
    render(<SiteHeader />);
    const image = document.querySelector("header img")!;
    expect(image).toHaveAttribute("src", "blob:photo");
    expect(screen.queryByText("ED")).not.toBeInTheDocument();
    fireEvent.error(image);
    expect(auth.reportPhotoError).toHaveBeenCalledTimes(1);
  });

  it("calls logout when the button is clicked", () => {
    const auth = setAuth({ status: "authenticated", user: ME });
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("marks the current page link", () => {
    setAuth({ status: "authenticated", user: ME });
    navigation.pathname = "/notes/";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Mes notes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Mon profil" })).not.toHaveAttribute("aria-current");
  });

  it("also recognises the path without trailing slash", () => {
    setAuth({ status: "authenticated", user: ME });
    navigation.pathname = "/profil";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Mon profil" })).toHaveAttribute("aria-current", "page");
  });

  it("has a labelled navigation", () => {
    expect(authState.current.status).toBe("anonymous");
    render(<SiteHeader />);
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
  });
});
