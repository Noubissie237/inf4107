import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePhotoSrc } from "@/lib/photo";

const api = vi.hoisted(() => ({ fetchPhotoBlob: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchPhotoBlob: api.fetchPhotoBlob }));

const user = (photo_url: string | null) => ({
  matricule: "20u2671",
  full_name: "Estelle Diallo",
  photo_url,
});

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

beforeEach(() => {
  api.fetchPhotoBlob.mockReset();
  createObjectURL.mockReset().mockImplementation(() => `blob:${createObjectURL.mock.calls.length}`);
  revokeObjectURL.mockReset();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

describe("usePhotoSrc", () => {
  it("returns null without a photo (the initials are shown)", () => {
    const me = user(null);
    const { result } = renderHook(() => usePhotoSrc(me, "jwt"));
    expect(result.current).toBeNull();
    expect(api.fetchPhotoBlob).not.toHaveBeenCalled();
  });

  it("returns null when nobody is logged in", () => {
    const { result } = renderHook(() => usePhotoSrc(null, null));
    expect(result.current).toBeNull();
  });

  it("uses an absolute URL directly, without any request", () => {
    const me = user("https://bucket.example/photos/original/20u2671?X-Amz-Signature=abc");
    const { result } = renderHook(() => usePhotoSrc(me, "jwt"));
    expect(result.current).toBe(me.photo_url);
    expect(api.fetchPhotoBlob).not.toHaveBeenCalled();
  });

  it("downloads a relative path with the token and shows an object URL", async () => {
    const blob = new Blob(["png"]);
    api.fetchPhotoBlob.mockResolvedValue(blob);
    const me = user("/api/auth/me/photo");

    const { result } = renderHook(() => usePhotoSrc(me, "jwt"));

    expect(result.current).toBeNull(); // initials while downloading
    await waitFor(() => expect(result.current).toBe("blob:1"));
    expect(api.fetchPhotoBlob).toHaveBeenCalledWith("jwt", "/api/auth/me/photo");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("revokes the object URL when the component goes away", async () => {
    api.fetchPhotoBlob.mockResolvedValue(new Blob(["png"]));
    const me = user("/api/auth/me/photo");
    const { result, unmount } = renderHook(() => usePhotoSrc(me, "jwt"));
    await waitFor(() => expect(result.current).toBe("blob:1"));

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("downloads again, and revokes the old image, when the user is refreshed", async () => {
    api.fetchPhotoBlob.mockResolvedValue(new Blob(["png"]));
    let me = user("/api/auth/me/photo"); // same path, new photo: a new user object
    const { result, rerender } = renderHook(() => usePhotoSrc(me, "jwt"));
    await waitFor(() => expect(result.current).toBe("blob:1"));

    me = user("/api/auth/me/photo");
    rerender();

    await waitFor(() => expect(result.current).toBe("blob:2"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    expect(api.fetchPhotoBlob).toHaveBeenCalledTimes(2);
  });

  it("keeps the initials when the download fails", async () => {
    api.fetchPhotoBlob.mockRejectedValue(new Error("boom"));
    const me = user("/api/auth/me/photo");
    const { result } = renderHook(() => usePhotoSrc(me, "jwt"));
    await waitFor(() => expect(api.fetchPhotoBlob).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("does not use an image that arrives after the component went away", async () => {
    let resolve!: (blob: Blob) => void;
    api.fetchPhotoBlob.mockReturnValue(new Promise<Blob>((r) => (resolve = r)));
    const me = user("/api/auth/me/photo");
    const { unmount } = renderHook(() => usePhotoSrc(me, "jwt"));

    unmount();
    resolve(new Blob(["png"]));
    await Promise.resolve();

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
