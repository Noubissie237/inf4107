import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";

const api = vi.hoisted(() => ({ getMe: vi.fn(), login: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMe: api.getMe,
  login: api.login,
}));
vi.mock("@/lib/config", () => ({ loadConfig: vi.fn().mockResolvedValue({}) }));

const ME = { matricule: "20u2671", full_name: "Estelle Diallo", photo_url: null };

function Probe({ onAuth }: { onAuth?: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  onAuth?.(auth);
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="name">{auth.user?.full_name ?? "-"}</p>
      <p data-testid="expired">{String(auth.sessionExpired)}</p>
    </div>
  );
}

function renderProbe() {
  let current!: ReturnType<typeof useAuth>;
  render(
    <AuthProvider>
      <Probe onAuth={(auth) => (current = auth)} />
    </AuthProvider>,
  );
  return () => current;
}

function storeSession(expiresAt: number) {
  sessionStorage.setItem("portal.session", JSON.stringify({ token: "stored-jwt", expiresAt }));
}

beforeEach(() => {
  sessionStorage.clear();
  api.getMe.mockReset();
  api.login.mockReset();
});

describe("AuthProvider", () => {
  it("is loading, then anonymous when there is no stored session", async () => {
    renderProbe();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it("restores a valid stored session and loads the profile", async () => {
    storeSession(Date.now() + 60_000);
    api.getMe.mockResolvedValue(ME);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("name")).toHaveTextContent("Estelle Diallo");
    expect(api.getMe).toHaveBeenCalledWith("stored-jwt");
  });

  it("ignores an expired stored session and says it has expired", async () => {
    storeSession(Date.now() - 1000);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(api.getMe).not.toHaveBeenCalled();
    expect(screen.getByTestId("expired")).toHaveTextContent("true");
    expect(sessionStorage.getItem("portal.session")).toBeNull();
  });

  it("does not claim an expiry when there was no session", async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("expired")).toHaveTextContent("false");
  });

  it("drops a stored token that the server refuses and says the session has expired", async () => {
    storeSession(Date.now() + 60_000);
    api.getMe.mockRejectedValue(new ApiError(401, "Non authentifié"));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(sessionStorage.getItem("portal.session")).toBeNull();
    expect(screen.getByTestId("expired")).toHaveTextContent("true");
  });

  it("does not claim an expiry when the server cannot be reached", async () => {
    storeSession(Date.now() + 60_000);
    api.getMe.mockRejectedValue(new ApiError(0, "Impossible de joindre le serveur"));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("expired")).toHaveTextContent("false");
  });

  it("logs in, stores the token with its expiry, then logs out", async () => {
    api.login.mockResolvedValue({ access_token: "new-jwt", token_type: "bearer", expires_in: 3600 });
    api.getMe.mockResolvedValue(ME);
    const auth = renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    await act(() => auth().login("20u2671", "secret"));

    expect(api.login).toHaveBeenCalledWith("20u2671", "secret");
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    const stored = JSON.parse(sessionStorage.getItem("portal.session") ?? "{}");
    expect(stored.token).toBe("new-jwt");
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);

    act(() => auth().logout());

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(sessionStorage.getItem("portal.session")).toBeNull();
  });

  it("keeps the user anonymous when the login is refused", async () => {
    api.login.mockRejectedValue(new ApiError(401, "Matricule ou mot de passe incorrect"));
    const auth = renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    await expect(act(() => auth().login("20u2671", "bad"))).rejects.toThrow(
      "Matricule ou mot de passe incorrect",
    );

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(sessionStorage.getItem("portal.session")).toBeNull();
  });

  it("logs out and flags the session as expired when an authenticated call gets a 401", async () => {
    storeSession(Date.now() + 60_000);
    api.getMe.mockResolvedValue(ME);
    const auth = renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    const call = vi.fn().mockRejectedValue(new ApiError(401, "Non authentifié"));
    let thrown: unknown;
    await act(async () => {
      thrown = await auth().authenticated(call).catch((error: unknown) => error);
    });

    expect(thrown).toBeInstanceOf(ApiError); // the caller still sees the error
    expect(call).toHaveBeenCalledWith("stored-jwt");
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("expired")).toHaveTextContent("true");
    expect(sessionStorage.getItem("portal.session")).toBeNull();
  });

  it("reloads the profile once when the photo image fails (expired signed URL)", async () => {
    storeSession(Date.now() + 60_000);
    const withPhoto = { ...ME, photo_url: "https://bucket.example/photo?X-Amz-Signature=old" };
    api.getMe.mockResolvedValue(withPhoto);
    const auth = renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(api.getMe).toHaveBeenCalledTimes(1);
    expect(auth().photoSrc).toBe(withPhoto.photo_url);

    api.getMe.mockResolvedValue({ ...ME, photo_url: "https://bucket.example/photo?X-Amz-Signature=new" });
    await act(async () => auth().reportPhotoError());
    await waitFor(() => expect(auth().photoSrc).toContain("X-Amz-Signature=new"));
    expect(api.getMe).toHaveBeenCalledTimes(2);

    // the new URL fails too: no second reload
    await act(async () => auth().reportPhotoError());
    expect(api.getMe).toHaveBeenCalledTimes(2);
  });

  it("allows a new reload after the profile was refreshed on purpose", async () => {
    storeSession(Date.now() + 60_000);
    api.getMe.mockResolvedValue({ ...ME, photo_url: "https://bucket.example/photo?v=1" });
    const auth = renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await act(async () => auth().reportPhotoError()); // 1st reload
    await act(async () => auth().reportPhotoError()); // ignored
    expect(api.getMe).toHaveBeenCalledTimes(2);

    await act(() => auth().refreshUser()); // e.g. after uploading a new photo
    await act(async () => auth().reportPhotoError()); // allowed again
    expect(api.getMe).toHaveBeenCalledTimes(4);
  });

  it("does not log out on other errors", async () => {
    storeSession(Date.now() + 60_000);
    api.getMe.mockResolvedValue(ME);
    const auth = renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    const call = vi.fn().mockRejectedValue(new ApiError(0, "Impossible de joindre le serveur"));
    await expect(act(() => auth().authenticated(call))).rejects.toThrow();

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("expired")).toHaveTextContent("false");
  });
});
