import { vi } from "vitest";

import type { AuthContextValue } from "@/lib/auth";

export const router = { replace: vi.fn(), push: vi.fn() };
export const navigation = { pathname: "/" };

export const ME = { matricule: "20u2671", full_name: "Estelle Diallo", photo_url: null };

/** Auth state that tests change, read by the mocked useAuth(). */
export const authState = { current: {} as AuthContextValue };

export function setAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  authState.current = {
    status: "anonymous",
    user: null,
    token: null,
    sessionExpired: false,
    photoSrc: null,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    reportPhotoError: vi.fn(),
    authenticated: vi.fn(),
    ...overrides,
  };
  return authState.current;
}
