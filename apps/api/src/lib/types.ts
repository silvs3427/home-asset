/** Product faces on one login (EPIC 1 will flesh this out). */
export type AppFace = "homeowner" | "contractor";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  /** Faces this account may use. Stub defaults to homeowner. */
  faces: AppFace[];
  /** Active face for this session context (client may switch later). */
  activeFace: AppFace;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  faces: AppFace[];
  activeFace: AppFace;
};

export type JwtClaims = {
  sub: string;
  email: string;
  faces: AppFace[];
  activeFace: AppFace;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    faces: user.faces,
    activeFace: user.activeFace,
  };
}
