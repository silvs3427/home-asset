import { API_BASE_URL } from "./config";

export type AppFace = "homeowner" | "contractor";

export type PublicUser = {
  id: string;
  email: string;
  faces: AppFace[];
  activeFace: AppFace;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: PublicUser;
};

export type MeResponse = {
  user: PublicUser;
  privacy: {
    ledgerOwner: string;
    silentSharing: boolean;
    approveBeforeOfficial: boolean;
  };
};

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  }
  return body;
}

export async function signup(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<AuthResponse>(res);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<AuthResponse>(res);
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE_URL}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson<MeResponse>(res);
}
