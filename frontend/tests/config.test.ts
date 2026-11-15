import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module keeps the loaded configuration in memory: import a fresh copy for each test
async function freshConfig() {
  vi.resetModules();
  return import("@/lib/config");
}

function mockConfigFile(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("loadConfig", () => {
  it("reads /config.json without cache", async () => {
    const fetchMock = mockConfigFile({
      authApiUrl: "https://api.example.org/api/auth/",
      gradesApiUrl: "https://api.example.org/api/grades",
    });
    const { loadConfig, getConfig } = await freshConfig();

    await loadConfig();

    expect(fetchMock).toHaveBeenCalledWith("/config.json", { cache: "no-store" });
    expect(getConfig()).toEqual({
      authApiUrl: "https://api.example.org/api/auth", // trailing slash removed
      gradesApiUrl: "https://api.example.org/api/grades",
    });
  });

  it("loads the file only once", async () => {
    const fetchMock = mockConfigFile({ authApiUrl: "/a", gradesApiUrl: "/g" });
    const { loadConfig } = await freshConfig();

    await Promise.all([loadConfig(), loadConfig()]);
    await loadConfig();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the defaults when the file is missing", async () => {
    mockConfigFile("not found", { status: 404 });
    const { loadConfig, getConfig, DEFAULT_CONFIG } = await freshConfig();
    await loadConfig();
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to the defaults when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const { loadConfig, getConfig, DEFAULT_CONFIG } = await freshConfig();
    await loadConfig();
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("falls back to the defaults when the file is not valid JSON", async () => {
    mockConfigFile("{ not json");
    const { loadConfig, getConfig, DEFAULT_CONFIG } = await freshConfig();
    await loadConfig();
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("uses the default for each missing or invalid field", async () => {
    mockConfigFile({ authApiUrl: 42, gradesApiUrl: "https://g.example.org/api/grades" });
    const { loadConfig, getConfig } = await freshConfig();
    await loadConfig();
    expect(getConfig()).toEqual({
      authApiUrl: "/api/auth",
      gradesApiUrl: "https://g.example.org/api/grades",
    });
  });

  it("returns the defaults before the file is loaded", async () => {
    const { getConfig, DEFAULT_CONFIG } = await freshConfig();
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe("resolveApiUrl", () => {
  it("leaves a relative path unchanged when the API is on the same origin", async () => {
    const { resolveApiUrl } = await freshConfig();
    expect(resolveApiUrl("/api/auth/me/photo")).toBe("/api/auth/me/photo");
  });

  it("resolves a relative path on the origin of an absolute authApiUrl", async () => {
    mockConfigFile({
      authApiUrl: "https://api.20u2671.inf4107.site/api/auth",
      gradesApiUrl: "/api/grades",
    });
    const { loadConfig, resolveApiUrl } = await freshConfig();
    await loadConfig();
    expect(resolveApiUrl("/api/auth/me/photo")).toBe(
      "https://api.20u2671.inf4107.site/api/auth/me/photo",
    );
  });

  it("leaves an absolute URL unchanged", async () => {
    mockConfigFile({ authApiUrl: "https://api.example.org/api/auth", gradesApiUrl: "/g" });
    const { loadConfig, resolveApiUrl } = await freshConfig();
    await loadConfig();
    const signed = "https://bucket.s3.amazonaws.com/photos/original/20u2671?X-Amz-Signature=abc";
    expect(resolveApiUrl(signed)).toBe(signed);
  });
});

describe("development gateway", () => {
  it("prefixes relative paths when NEXT_PUBLIC_DEV_GATEWAY is set in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_GATEWAY", "http://localhost:8080/");
    const { getConfig, resolveApiUrl } = await freshConfig();
    expect(getConfig()).toEqual({
      authApiUrl: "http://localhost:8080/api/auth",
      gradesApiUrl: "http://localhost:8080/api/grades",
    });
    expect(resolveApiUrl("/api/auth/me/photo")).toBe("http://localhost:8080/api/auth/me/photo");
  });

  it("does nothing outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEV_GATEWAY", "http://localhost:8080");
    const { getConfig, DEFAULT_CONFIG } = await freshConfig();
    expect(getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("does not touch absolute URLs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_GATEWAY", "http://localhost:8080");
    mockConfigFile({ authApiUrl: "https://api.example.org/api/auth", gradesApiUrl: "/api/grades" });
    const { loadConfig, getConfig } = await freshConfig();
    await loadConfig();
    expect(getConfig().authApiUrl).toBe("https://api.example.org/api/auth");
    expect(getConfig().gradesApiUrl).toBe("http://localhost:8080/api/grades");
  });
});
