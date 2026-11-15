import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, fetchPhotoBlob, getGrades, getMe, login, uploadPhoto } from "@/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("login", () => {
  it("posts the credentials as JSON and returns the token", async () => {
    const token = { access_token: "jwt", token_type: "bearer", expires_in: 3600 };
    fetchMock.mockResolvedValue(jsonResponse(token));

    await expect(login("20u2671", "secret")).resolves.toEqual(token);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ matricule: "20u2671", password: "secret" });
  });

  it("raises the server message on a 401", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Matricule ou mot de passe incorrect" }, 401),
    );
    const error = await failure(login("20u2671", "wrong"));
    expect(error.status).toBe(401);
    expect(error.detail).toBe("Matricule ou mot de passe incorrect");
  });

  it("gives a clear message for a validation error (422 with a list)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: [{ msg: "invalid" }] }, 422));
    const error = await failure(login("bad", "x"));
    expect(error.status).toBe(422);
    expect(error.detail).toBe("Données invalides");
  });

  it("turns a network error into a French message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await failure(login("20u2671", "x"));
    expect(error.status).toBe(0);
    expect(error.detail).toBe("Impossible de joindre le serveur");
  });

  it("gives up after 15 seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")));
        }),
    );
    const pending = failure(login("20u2671", "x"));
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await pending;
    expect(error.status).toBe(0);
    expect(error.detail).toBe("Le serveur met trop de temps à répondre");
  });

  it("handles an error body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    const error = await failure(login("20u2671", "x"));
    expect(error.status).toBe(502);
    expect(error.detail).toBe("Erreur du serveur (502)");
  });

  it("rejects a success response that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    const error = await failure(login("20u2671", "x"));
    expect(error.detail).toBe("Réponse invalide du serveur");
  });
});

describe("authenticated calls", () => {
  it("getMe sends the bearer token", async () => {
    const me = { matricule: "20u2671", full_name: "Estelle Diallo", photo_url: null };
    fetchMock.mockResolvedValue(jsonResponse(me));

    await expect(getMe("jwt")).resolves.toEqual(me);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/me");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer jwt");
  });

  it("returns a 401 as an ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Non authentifié" }, 401));
    const error = await failure(getMe("expired"));
    expect(error.status).toBe(401);
    expect(error.detail).toBe("Non authentifié");
  });

  it("getGrades asks for the semester", async () => {
    const grades = { matricule: "20u2671", semester: "S2", courses: [] };
    fetchMock.mockResolvedValue(jsonResponse(grades));

    await expect(getGrades("jwt", "S2")).resolves.toEqual(grades);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/grades/me/grades?semester=S2");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer jwt");
  });

  it("getGrades defaults to S1", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ matricule: "m", semester: "S1", courses: [] }));
    await getGrades("jwt");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/grades/me/grades?semester=S1");
  });

  it("uploadPhoto sends multipart data without a Content-Type header", async () => {
    const me = { matricule: "20u2671", full_name: "E D", photo_url: "/api/auth/me/photo" };
    fetchMock.mockResolvedValue(jsonResponse(me));
    const file = new File(["data"], "photo.png", { type: "image/png" });

    await expect(uploadPhoto("jwt", file)).resolves.toEqual(me);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/me/photo");
    expect(init.method).toBe("PUT");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer jwt");
    expect(headers.has("Content-Type")).toBe(false);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("uploadPhoto raises the server message for a refused file", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Format non supporté (JPEG ou PNG uniquement)" }, 415),
    );
    const error = await failure(uploadPhoto("jwt", new File(["x"], "a.gif")));
    expect(error.status).toBe(415);
    expect(error.detail).toBe("Format non supporté (JPEG ou PNG uniquement)");
  });

  it("fetchPhotoBlob downloads the image with the token", async () => {
    fetchMock.mockResolvedValue(
      new Response(new TextEncoder().encode("png-bytes"), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const blob = await fetchPhotoBlob("jwt", "/api/auth/me/photo");

    expect(blob.size).toBe(9);
    expect(blob.type).toBe("image/png");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/me/photo");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer jwt");
  });
});
