"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, getMe, login as apiLogin } from "@/lib/api";
import type { Me } from "@/lib/api";
import { loadConfig } from "@/lib/config";
import { usePhotoSrc } from "@/lib/photo";

const STORAGE_KEY = "portal.session";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

type StoredSession = { token: string; expiresAt: number };

export type AuthContextValue = {
  status: AuthStatus;
  user: Me | null;
  token: string | null;
  /** True after an authenticated call was refused (401): the session has expired. */
  sessionExpired: boolean;
  /** Address to show for the profile photo, or null (show the initials). */
  photoSrc: string | null;
  login: (matricule: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Call when the photo image fails to load: reloads /me once (an S3 signed URL may have expired). */
  reportPhotoError: () => void;
  /** Run an authenticated call. A 401 logs the user out. */
  authenticated: <T>(call: (token: string) => Promise<T>) => Promise<T>;
};

// The token lives in sessionStorage (cleared when the tab closes): a deliberate trade-off
// for a teaching project, see "Frontend : décisions" in the README.
// Returns the session, "expired" when one is stored but past its expiry time, or null.
function readSession(): StoredSession | "expired" | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) {
      return null;
    }
    const { token, expiresAt } = data as Partial<StoredSession>;
    if (typeof token !== "string" || typeof expiresAt !== "number") {
      return null;
    }
    return expiresAt <= Date.now() ? "expired" : { token, expiresAt };
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable: the session only lasts until the page is reloaded
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const photoErrorReported = useRef(false);

  // Restore the session once: load the configuration first, then check the stored token
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      await loadConfig();
      const stored = readSession();
      if (stored === null || stored === "expired") {
        // an "expired" session was really there: tell the user, like after a 401
        clearSession();
        if (!cancelled) {
          setSessionExpired(stored === "expired");
          setStatus("anonymous");
        }
        return;
      }
      try {
        const me = await getMe(stored.token);
        if (!cancelled) {
          setToken(stored.token);
          setUser(me);
          setStatus("authenticated");
        }
      } catch (error) {
        clearSession();
        if (!cancelled) {
          setSessionExpired(error instanceof ApiError && error.status === 401);
          setStatus("anonymous");
        }
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const login = useCallback(async (matricule: string, password: string) => {
    const response = await apiLogin(matricule, password);
    const me = await getMe(response.access_token);
    writeSession({
      token: response.access_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    });
    setToken(response.access_token);
    setUser(me);
    setSessionExpired(false);
    setStatus("authenticated");
  }, []);

  const authenticated = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      if (!token) {
        throw new ApiError(401, "Non authentifié");
      }
      try {
        return await call(token);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          logout();
          setSessionExpired(true);
        }
        throw error;
      }
    },
    [token, logout],
  );

  const loadUser = useCallback(async () => {
    setUser(await authenticated(getMe));
  }, [authenticated]);

  const refreshUser = useCallback(async () => {
    photoErrorReported.current = false;
    await loadUser();
  }, [loadUser]);

  const reportPhotoError = useCallback(() => {
    if (photoErrorReported.current) {
      return; // only once: a second failure is not an expired URL
    }
    photoErrorReported.current = true;
    loadUser().catch(() => undefined);
  }, [loadUser]);

  const photoSrc = usePhotoSrc(user, token);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      sessionExpired,
      photoSrc,
      login,
      logout,
      refreshUser,
      reportPhotoError,
      authenticated,
    }),
    [
      status,
      user,
      token,
      sessionExpired,
      photoSrc,
      login,
      logout,
      refreshUser,
      reportPhotoError,
      authenticated,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider");
  }
  return context;
}
