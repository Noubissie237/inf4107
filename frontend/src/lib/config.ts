// Runtime configuration: the API addresses are read from /config.json when the app starts,
// never frozen at build time, so the same build works with any deployment architecture.

export type AppConfig = {
  authApiUrl: string;
  gradesApiUrl: string;
};

export const DEFAULT_CONFIG: AppConfig = {
  authApiUrl: "/api/auth",
  gradesApiUrl: "/api/grades",
};

let loaded: AppConfig | null = null;
let loading: Promise<AppConfig> | null = null;

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Development only: `npm run dev` (port 3000) talks to the Docker gateway.
// NODE_ENV is replaced at build time, so this branch does not exist in production.
function devGateway(): string | undefined {
  if (process.env.NODE_ENV === "development") {
    return process.env.NEXT_PUBLIC_DEV_GATEWAY || undefined;
  }
  return undefined;
}

function withDevGateway(url: string): string {
  const gateway = devGateway();
  if (gateway && !isAbsolute(url)) {
    return gateway.replace(/\/+$/, "") + url;
  }
  return url;
}

function cleanUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  return value.trim().replace(/\/+$/, "");
}

async function readConfig(): Promise<AppConfig> {
  try {
    const response = await fetch("/config.json", { cache: "no-store" });
    if (!response.ok) {
      return DEFAULT_CONFIG;
    }
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) {
      return DEFAULT_CONFIG;
    }
    const record = data as Record<string, unknown>;
    return {
      authApiUrl: cleanUrl(record.authApiUrl, DEFAULT_CONFIG.authApiUrl),
      gradesApiUrl: cleanUrl(record.gradesApiUrl, DEFAULT_CONFIG.gradesApiUrl),
    };
  } catch {
    return DEFAULT_CONFIG; // missing or invalid file: use the defaults
  }
}

/** Load /config.json once; later calls return the same result. */
export function loadConfig(): Promise<AppConfig> {
  loading ??= readConfig().then((config) => {
    loaded = config;
    return config;
  });
  return loading;
}

/** Current configuration (the defaults until loadConfig() has finished). */
export function getConfig(): AppConfig {
  const config = loaded ?? DEFAULT_CONFIG;
  return {
    authApiUrl: withDevGateway(config.authApiUrl),
    gradesApiUrl: withDevGateway(config.gradesApiUrl),
  };
}

/**
 * Resolve a path returned by the API (for example photo_url "/api/auth/me/photo").
 * It is resolved on the origin of authApiUrl when that one is absolute, otherwise left as is
 * (same origin as the frontend).
 */
export function resolveApiUrl(path: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  const { authApiUrl } = getConfig();
  if (isAbsolute(authApiUrl)) {
    return new URL(authApiUrl).origin + path;
  }
  return path;
}
