import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { __resetUsersForTests } from "./lib/users.js";

type AuthBody = {
  accessToken: string;
  user: {
    email: string;
    activeFace: string;
    faces: string[];
    activePropertyId: string | null;
  };
};

type MeBody = {
  user: { email: string; activePropertyId: string | null };
  properties: Array<{ id: string; name: string }>;
  activeProperty: { id: string; name: string } | null;
  privacy: {
    silentSharing: boolean;
    approveBeforeOfficial: boolean;
    dataScope: string;
  };
};

type PropertiesBody = {
  properties: Array<{ id: string; name: string; city: string }>;
  activePropertyId: string | null;
};

afterEach(() => {
  __resetUsersForTests();
});

async function signup(
  app: ReturnType<typeof createApp>,
  email: string,
  face: "homeowner" | "contractor" = "homeowner",
) {
  const res = await app.request("/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "securepass1",
      startingFace: face,
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as AuthBody;
}

describe("HomeAsset API — accounts & properties", () => {
  it("health check is public", async () => {
    const app = createApp();
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("rejects /me and /properties without a token", async () => {
    const app = createApp();
    assert.equal((await app.request("/me")).status, 401);
    assert.equal((await app.request("/properties")).status, 401);
  });

  it("signs up, returns token, and serves authenticated /me", async () => {
    const app = createApp();
    const signupBody = await signup(app, "homeowner@example.com");
    assert.ok(signupBody.accessToken);
    assert.equal(signupBody.user.activeFace, "homeowner");
    assert.equal(signupBody.user.activePropertyId, null);

    const me = await app.request("/me", {
      headers: { authorization: `Bearer ${signupBody.accessToken}` },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as MeBody;
    assert.equal(meBody.user.email, "homeowner@example.com");
    assert.equal(meBody.properties.length, 0);
    assert.equal(meBody.activeProperty, null);
    assert.equal(meBody.privacy.silentSharing, false);
    assert.equal(meBody.privacy.approveBeforeOfficial, true);
    assert.equal(meBody.privacy.dataScope, "property");
  });

  it("logs in with the same credentials after restart-safe store", async () => {
    const app = createApp();
    await signup(app, "pro@example.com", "contractor");

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

  it("creates a home, auto-selects it, and lists only owned homes", async () => {
    const app = createApp();
    const a = await signup(app, "alice@example.com");
    const b = await signup(app, "bob@example.com");

    const created = await app.request("/properties", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${a.accessToken}`,
      },
      body: JSON.stringify({
        name: "Oak Street",
        addressLine1: "12 Oak St",
        city: "Austin",
        region: "TX",
        postalCode: "78701",
        country: "US",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as {
      property: { id: string; name: string };
      user: { activePropertyId: string };
    };
    assert.equal(createdBody.property.name, "Oak Street");
    assert.equal(createdBody.user.activePropertyId, createdBody.property.id);

    const listA = await app.request("/properties", {
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    const listABody = (await listA.json()) as PropertiesBody;
    assert.equal(listABody.properties.length, 1);
    assert.equal(listABody.activePropertyId, createdBody.property.id);

    // Bob cannot see Alice's home (property-scoped + ownership).
    const listB = await app.request("/properties", {
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    const listBBody = (await listB.json()) as PropertiesBody;
    assert.equal(listBBody.properties.length, 0);

    const steal = await app.request(`/properties/${createdBody.property.id}`, {
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    assert.equal(steal.status, 404);
  });

  it("supports thin multi-home switcher", async () => {
    const app = createApp();
    const auth = await signup(app, "multi@example.com");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const first = await app.request("/properties", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Primary",
        addressLine1: "1 Main",
        city: "Denver",
        region: "CO",
        postalCode: "80202",
      }),
    });
    const firstBody = (await first.json()) as { property: { id: string } };

    const second = await app.request("/properties", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Cabin",
        addressLine1: "9 Lake Rd",
        city: "Boulder",
        region: "CO",
        postalCode: "80302",
      }),
    });
    const secondBody = (await second.json()) as {
      property: { id: string };
      user: { activePropertyId: string };
    };
    // First home stays active until user switches.
    assert.equal(secondBody.user.activePropertyId, firstBody.property.id);

    const select = await app.request(
      `/properties/${secondBody.property.id}/select`,
      { method: "POST", headers: { authorization: headers.authorization } },
    );
    assert.equal(select.status, 200);
    const selectBody = (await select.json()) as {
      property: { id: string; name: string };
      user: { activePropertyId: string };
    };
    assert.equal(selectBody.property.name, "Cabin");
    assert.equal(selectBody.user.activePropertyId, secondBody.property.id);

    const me = await app.request("/me", {
      headers: { authorization: headers.authorization },
    });
    const meBody = (await me.json()) as MeBody;
    assert.equal(meBody.properties.length, 2);
    assert.equal(meBody.activeProperty?.name, "Cabin");
  });

  it("switches face on the same login and refreshes the token", async () => {
    const app = createApp();
    const auth = await signup(app, "faces@example.com", "homeowner");

    const face = await app.request("/me/face", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ face: "contractor", enableIfMissing: true }),
    });
    assert.equal(face.status, 200);
    const faceBody = (await face.json()) as AuthBody;
    assert.ok(faceBody.accessToken);
    assert.equal(faceBody.user.activeFace, "contractor");
    assert.ok(faceBody.user.faces.includes("homeowner"));
    assert.ok(faceBody.user.faces.includes("contractor"));
  });
});

type AssetBody = {
  asset: {
    id: string;
    propertyId: string;
    name: string;
    category: string;
    manufacturer: string | null;
    model: string | null;
    serial: string | null;
    location: string | null;
    provenance: string;
  };
};

async function createHome(
  app: ReturnType<typeof createApp>,
  token: string,
  name: string,
) {
  const created = await app.request("/properties", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      addressLine1: "1 Test St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
    }),
  });
  assert.equal(created.status, 201);
  const body = (await created.json()) as { property: { id: string; name: string } };
  return body.property;
}

describe("HomeAsset API — asset registry", () => {
  it("rejects asset list without a token", async () => {
    const app = createApp();
    const res = await app.request("/properties/fake/assets");
    assert.equal(res.status, 401);
  });

  it("creates, lists, updates, and deletes assets on an owned home", async () => {
    const app = createApp();
    const auth = await signup(app, "assets@example.com");
    const home = await createHome(app, auth.accessToken, "Oak Street");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const created = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Furnace",
        category: "hvac",
        manufacturer: "Carrier",
        model: "59TN6",
        serial: "SN-1001",
        installDate: "2022-06-15",
        installerVendor: "Cool Air Co",
        location: "Basement",
        notes: "Annual filter change each fall",
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as AssetBody;
    assert.equal(createdBody.asset.name, "Furnace");
    assert.equal(createdBody.asset.propertyId, home.id);
    assert.equal(createdBody.asset.manufacturer, "Carrier");
    assert.equal(createdBody.asset.serial, "SN-1001");
    assert.equal(createdBody.asset.provenance, "homeowner");

    const list = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { assets: Array<{ id: string }> };
    assert.equal(listBody.assets.length, 1);

    const detail = await app.request(
      `/properties/${home.id}/assets/${createdBody.asset.id}`,
      { headers: { authorization: headers.authorization } },
    );
    assert.equal(detail.status, 200);

    const patched = await app.request(
      `/properties/${home.id}/assets/${createdBody.asset.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ location: "Utility closet", serial: "SN-1001-B" }),
      },
    );
    assert.equal(patched.status, 200);
    const patchedBody = (await patched.json()) as AssetBody;
    assert.equal(patchedBody.asset.location, "Utility closet");
    assert.equal(patchedBody.asset.serial, "SN-1001-B");
    assert.equal(patchedBody.asset.manufacturer, "Carrier");

    const deleted = await app.request(
      `/properties/${home.id}/assets/${createdBody.asset.id}`,
      { method: "DELETE", headers: { authorization: headers.authorization } },
    );
    assert.equal(deleted.status, 200);

    const empty = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    const emptyBody = (await empty.json()) as { assets: unknown[] };
    assert.equal(emptyBody.assets.length, 0);
  });

  it("never leaks assets across accounts or homes", async () => {
    const app = createApp();
    const alice = await signup(app, "alice-assets@example.com");
    const bob = await signup(app, "bob-assets@example.com");
    const aliceHome = await createHome(app, alice.accessToken, "Alice Home");
    const aliceCabin = await createHome(app, alice.accessToken, "Alice Cabin");
    const bobHome = await createHome(app, bob.accessToken, "Bob Home");

    const create = await app.request(`/properties/${aliceHome.id}/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${alice.accessToken}`,
      },
      body: JSON.stringify({
        name: "Generator",
        category: "generator",
        manufacturer: "Generac",
        model: "7043",
        serial: "PRIV-1",
      }),
    });
    assert.equal(create.status, 201);
    const asset = ((await create.json()) as AssetBody).asset;

    // Bob cannot list Alice's home assets.
    const bobList = await app.request(`/properties/${aliceHome.id}/assets`, {
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobList.status, 404);

    // Bob cannot read Alice's asset by id under his own home.
    const bobSteal = await app.request(
      `/properties/${bobHome.id}/assets/${asset.id}`,
      { headers: { authorization: `Bearer ${bob.accessToken}` } },
    );
    assert.equal(bobSteal.status, 404);

    // Alice's second home does not include the first home's asset.
    const cabinList = await app.request(`/properties/${aliceCabin.id}/assets`, {
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    assert.equal(cabinList.status, 200);
    const cabinBody = (await cabinList.json()) as { assets: unknown[] };
    assert.equal(cabinBody.assets.length, 0);

    // Wrong property id for a known asset id → not found (no cross-home leak).
    const crossHome = await app.request(
      `/properties/${aliceCabin.id}/assets/${asset.id}`,
      { headers: { authorization: `Bearer ${alice.accessToken}` } },
    );
    assert.equal(crossHome.status, 404);
  });

  it("rejects invalid asset payloads", async () => {
    const app = createApp();
    const auth = await signup(app, "bad-asset@example.com");
    const home = await createHome(app, auth.accessToken, "Home");
    const res = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ name: "", category: "spaceship" }),
    });
    assert.equal(res.status, 400);
  });
});
