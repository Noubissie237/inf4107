import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "@/app/profil/page";
import { ApiError } from "@/lib/api";

import { ME, router, setAuth } from "./helpers";

const api = vi.hoisted(() => ({ uploadPhoto: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadPhoto: api.uploadPhoto,
}));
vi.mock("next/navigation", async () => {
  const helpers = await import("./helpers");
  return { usePathname: () => "/profil/", useRouter: () => helpers.router };
});
vi.mock("@/lib/auth", async () => {
  const helpers = await import("./helpers");
  return { useAuth: () => helpers.authState.current };
});

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function loggedIn(overrides = {}) {
  return setAuth({
    status: "authenticated",
    user: ME,
    authenticated: <T,>(call: (token: string) => Promise<T>) => call("jwt"),
    ...overrides,
  });
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Choisir une photo"), { target: { files: [file] } });
}

const jpeg = () => new File(["jpeg-bytes"], "me.jpg", { type: "image/jpeg" });
const png = () => new File(["png-bytes"], "me.png", { type: "image/png" });
const saveButton = () => screen.getByRole("button", { name: /Enregistrer la photo|Enregistrement/ });

beforeEach(() => {
  api.uploadPhoto.mockReset();
  router.replace.mockReset();
  createObjectURL.mockReset().mockReturnValue("blob:preview");
  revokeObjectURL.mockReset();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  loggedIn();
});

describe("ProfilePage", () => {
  it("shows the name, the matricule and the initials when there is no photo", () => {
    render(<ProfilePage />);
    expect(screen.getByRole("heading", { name: "Mon profil" })).toBeInTheDocument();
    expect(screen.getByText("Estelle Diallo")).toBeInTheDocument();
    expect(screen.getByText("20u2671")).toBeInTheDocument();
    expect(screen.getByText("ED")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the photo at 128 px when there is one", () => {
    loggedIn({ photoSrc: "blob:current-photo" });
    render(<ProfilePage />);
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "blob:current-photo");
    expect(image).toHaveStyle({ width: "128px", height: "128px" });
    expect(screen.queryByText("ED")).not.toBeInTheDocument();
  });

  it("accepts only JPEG and PNG in the file picker", () => {
    render(<ProfilePage />);
    expect(screen.getByLabelText("Choisir une photo")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png",
    );
    expect(saveButton()).toBeDisabled();
  });

  it("shows a preview and enables the button for a valid JPEG", () => {
    render(<ProfilePage />);
    pick(jpeg());
    expect(screen.getByText("Aperçu avant enregistrement")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", "blob:preview");
    expect(saveButton()).toBeEnabled();
  });

  it("accepts a PNG too", () => {
    render(<ProfilePage />);
    pick(png());
    expect(saveButton()).toBeEnabled();
  });

  it("refuses a GIF with a clear message, without preview", () => {
    render(<ProfilePage />);
    pick(new File(["gif"], "a.gif", { type: "image/gif" }));
    expect(screen.getByText("Format non supporté : choisissez une image JPEG ou PNG.")).toBeInTheDocument();
    expect(screen.queryByText("Aperçu avant enregistrement")).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("refuses a text file", () => {
    render(<ProfilePage />);
    pick(new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(screen.getByText(/Format non supporté/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("refuses a file larger than 2 Mio", () => {
    render(<ProfilePage />);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    pick(big);
    expect(screen.getByText("Photo trop volumineuse (2 Mo maximum).")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("accepts a file of exactly 2 Mio", () => {
    render(<ProfilePage />);
    pick(new File([new Uint8Array(2 * 1024 * 1024)], "ok.png", { type: "image/png" }));
    expect(saveButton()).toBeEnabled();
  });

  it("clears the error and the preview when the file is cleared or replaced", () => {
    render(<ProfilePage />);
    pick(new File(["gif"], "a.gif", { type: "image/gif" }));
    pick(jpeg());
    expect(screen.queryByText(/Format non supporté/)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("sends the file, refreshes the profile and confirms", async () => {
    const auth = loggedIn();
    api.uploadPhoto.mockResolvedValue({ ...ME, photo_url: "/api/auth/me/photo" });
    render(<ProfilePage />);
    const file = jpeg();
    pick(file);

    fireEvent.click(saveButton());

    expect(await screen.findByText("Votre photo de profil a été enregistrée.")).toBeInTheDocument();
    expect(api.uploadPhoto).toHaveBeenCalledWith("jwt", file);
    expect(auth.refreshUser).toHaveBeenCalledTimes(1); // updates the page and the header
    expect(saveButton()).toBeDisabled(); // nothing selected any more
    expect(screen.queryByText("Aperçu avant enregistrement")).not.toBeInTheDocument();
  });

  it("shows a loading state while sending", async () => {
    let finish!: (me: typeof ME) => void;
    api.uploadPhoto.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ProfilePage />);
    pick(png());

    fireEvent.click(saveButton());

    const button = await screen.findByRole("button", { name: "Enregistrement…" });
    expect(button).toBeDisabled();
    finish(ME);
    await screen.findByText("Votre photo de profil a été enregistrée.");
  });

  it.each([
    [413, "Photo trop volumineuse (2 Mo maximum)"],
    [415, "Format non supporté (JPEG ou PNG uniquement)"],
    [422, "Dimensions trop grandes (4000 x 4000 maximum)"],
  ])("shows the server message for a %i", async (status, detail) => {
    api.uploadPhoto.mockRejectedValue(new ApiError(status, detail));
    render(<ProfilePage />);
    pick(jpeg()); // for example a text file renamed .jpg: only the server can tell

    fireEvent.click(saveButton());

    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.queryByText("Votre photo de profil a été enregistrée.")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled(); // the student can try again
  });

  it("says when the server cannot be reached", async () => {
    api.uploadPhoto.mockRejectedValue(new ApiError(0, "Impossible de joindre le serveur"));
    render(<ProfilePage />);
    pick(jpeg());
    fireEvent.click(saveButton());
    expect(await screen.findByText("Impossible de joindre le serveur")).toBeInTheDocument();
  });

  it("announces messages to screen readers", async () => {
    api.uploadPhoto.mockRejectedValue(new ApiError(415, "Format non supporté"));
    render(<ProfilePage />);
    pick(jpeg());
    fireEvent.click(saveButton());
    const message = await screen.findByText("Format non supporté");
    expect(message.closest("[aria-live]")).not.toBeNull();
  });

  it("revokes the preview URL when the page goes away", () => {
    const { unmount } = render(<ProfilePage />);
    pick(jpeg());
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("redirects an anonymous visitor to the login page", async () => {
    setAuth({ status: "anonymous" });
    render(<ProfilePage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/connexion/"));
    expect(screen.queryByRole("heading", { name: "Mon profil" })).not.toBeInTheDocument();
  });
});
