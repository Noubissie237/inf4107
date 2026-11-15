import { getConfig, resolveApiUrl } from "@/lib/config";

const TIMEOUT_MS = 15_000;
const NETWORK_MESSAGE = "Impossible de joindre le serveur";
const TIMEOUT_MESSAGE = "Le serveur met trop de temps à répondre";

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type Me = {
  matricule: string;
  full_name: string;
  photo_url: string | null;
};

export type CourseGrades = {
  code: string;
  title: string;
  credits: number;
  cc: number | null;
  tp: number | null;
  sn: number | null;
  average: number | null;
};

export type GradesResponse = {
  matricule: string;
  semester: string;
  courses: CourseGrades[];
};

/** Error with the HTTP status (0 for network errors and timeouts) and a message in French. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") {
        return detail;
      }
      return "Données invalides"; // FastAPI validation errors are a list
    }
  } catch {
    // the body is not JSON: use the generic message below
  }
  return `Erreur du serveur (${response.status})`;
}

async function request(url: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError(0, controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await errorDetail(response));
  }
  return response;
}

async function requestJson<T>(url: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await request(url, init, token);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "Réponse invalide du serveur");
  }
}

export function login(matricule: string, password: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>(`${getConfig().authApiUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matricule, password }),
  });
}

export function getMe(token: string): Promise<Me> {
  return requestJson<Me>(`${getConfig().authApiUrl}/me`, {}, token);
}

export function uploadPhoto(token: string, file: File): Promise<Me> {
  const body = new FormData();
  body.append("file", file);
  // No Content-Type header: the browser adds the multipart boundary
  return requestJson<Me>(`${getConfig().authApiUrl}/me/photo`, { method: "PUT", body }, token);
}

/** Download the photo with the Authorization header (local storage mode). */
export async function fetchPhotoBlob(token: string, photoUrl: string): Promise<Blob> {
  const response = await request(resolveApiUrl(photoUrl), { cache: "no-store" }, token);
  return response.blob();
}

export function getGrades(token: string, semester = "S1"): Promise<GradesResponse> {
  const query = new URLSearchParams({ semester });
  return requestJson<GradesResponse>(`${getConfig().gradesApiUrl}/me/grades?${query}`, {}, token);
}
