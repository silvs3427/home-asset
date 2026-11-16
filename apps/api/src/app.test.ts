import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { __resetUsersForTests } from "./lib/users.js";

type AuthBody = {
  accessToken: string;
  user: { email: string; activeFace: string; faces: string[] };
};

type MeBody = {
  user: { email: string };
  privacy: { silentSharing: boolean; approveBeforeOfficial: boolean };
};

afterEach(() => {
  __resetUsersForTests();
});

describe("HomeAsset API foundation", () => {
  it("health check is public", async () => {
    const app = createApp();
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("rejects /me without a token", async () => {
    const app = createApp();
    const res = await app.request("/me");
    assert.equal(res.status, 401);
  });

  it("signs up, returns token, and serves authenticated /me", async () => {
    const app = createApp();
    const signup = await app.request("/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "homeowner@example.com",
        password: "securepass1",
        startingFace: "homeowner",
      }),
    });
    assert.equal(signup.status, 201);
    const signupBody = (await signup.json()) as AuthBody;
    assert.ok(signupBody.accessToken);
    assert.equal(signupBody.user.activeFace, "homeowner");
    assert.equal(signupBody.user.faces[0], "homeowner");

    const me = await app.request("/me", {
      headers: { authorization: `Bearer ${signupBody.accessToken}` },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as MeBody;
    assert.equal(meBody.user.email, "homeowner@example.com");
    assert.equal(meBody.privacy.silentSharing, false);
    assert.equal(meBody.privacy.approveBeforeOfficial, true);
  });

  it("logs in with the same credentials", async () => {
    const app = createApp();
    await app.request("/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "pro@example.com",
        password: "securepass1",
        startingFace: "contractor",
      }),
    });

    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "pro@example.com",
        password: "securepass1",
      }),
    });
    assert.equal(login.status, 200);
    const body = (await login.json()) as AuthBody;
    assert.equal(body.user.activeFace, "contractor");
  });

  it("does not leak whether an email exists on bad login", async () => {
    const app = createApp();
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "wrongpassword",
      }),
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "invalid_credentials");
  });
});
