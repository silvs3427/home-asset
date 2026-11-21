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

  it("accepts custom asset categories and remembers them per home", async () => {
    const app = createApp();
    const auth = await signup(app, "custom-cat@example.com");
    const home = await createHome(app, auth.accessToken, "Custom Cat Home");
    const created = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ name: "Pool pump", category: "Pool gear" }),
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as {
      asset: { category: string };
    };
    assert.equal(createdBody.asset.category, "Pool gear");

    const labels = await app.request(
      `/properties/${home.id}/labels?kind=asset_category`,
      { headers: { authorization: `Bearer ${auth.accessToken}` } },
    );
    assert.equal(labels.status, 200);
    const labelsBody = (await labels.json()) as {
      labels: Array<{ value: string }>;
    };
    assert.ok(
      labelsBody.labels.some((row) => row.value === "Pool gear"),
      "custom category should be reusable for this home",
    );

    const remember = await app.request(`/properties/${home.id}/labels`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ kind: "document_type", value: "HOA letter" }),
    });
    assert.equal(remember.status, 201);
    const docLabels = await app.request(
      `/properties/${home.id}/labels?kind=document_type`,
      { headers: { authorization: `Bearer ${auth.accessToken}` } },
    );
    const docBody = (await docLabels.json()) as {
      labels: Array<{ value: string }>;
    };
    assert.ok(docBody.labels.some((row) => row.value === "HOA letter"));
  });

  it("stores warranty end date and term on an asset", async () => {
    const app = createApp();
    const auth = await signup(app, "warranty@example.com");
    const home = await createHome(app, auth.accessToken, "Warranty Home");
    const created = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        name: "Roof",
        category: "roof",
        warrantyEndDate: "2040-05-01",
        warrantyTerm: "20 years",
      }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as {
      asset: { warrantyEndDate: string; warrantyTerm: string };
    };
    assert.equal(body.asset.warrantyEndDate, "2040-05-01");
    assert.equal(body.asset.warrantyTerm, "20 years");
  });

  it("stores last serviced date and contractor confirmation on an asset", async () => {
    const app = createApp();
    const auth = await signup(app, "service-audit@example.com");
    const home = await createHome(app, auth.accessToken, "Service Home");
    const created = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        name: "Furnace",
        category: "HVAC",
        lastServicedAt: "2026-03-15",
        confirmedByContractorName: "Cool Air Co",
      }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as {
      asset: {
        lastServicedAt: string;
        confirmedByContractorName: string;
      };
    };
    assert.equal(body.asset.lastServicedAt, "2026-03-15");
    assert.equal(body.asset.confirmedByContractorName, "Cool Air Co");

    const exported = await app.request(`/properties/${home.id}/export`, {
      headers: { authorization: `Bearer ${auth.accessToken}` },
    });
    assert.equal(exported.status, 200);
    const exportBody = (await exported.json()) as {
      packet: {
        assets: Array<{
          lastServicedAt: string | null;
          confirmedByContractorName: string | null;
        }>;
      };
    };
    assert.equal(exportBody.packet.assets[0]?.lastServicedAt, "2026-03-15");
    assert.equal(
      exportBody.packet.assets[0]?.confirmedByContractorName,
      "Cool Air Co",
    );
  });
});

type DocumentBody = {
  document: {
    id: string;
    propertyId: string;
    assetId: string | null;
    title: string;
    docType: string;
    source: string;
    mimeType: string;
    originalFilename: string;
    byteSize: number;
  };
};

describe("HomeAsset API — documents & warranties", () => {
  it("rejects document list without a token", async () => {
    const app = createApp();
    const res = await app.request("/properties/fake/documents");
    assert.equal(res.status, 401);
  });

  it("uploads, lists, downloads, and deletes a document on an owned home", async () => {
    const app = createApp();
    const auth = await signup(app, "docs@example.com");
    const home = await createHome(app, auth.accessToken, "Doc Home");

    const assetRes = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        name: "Furnace",
        category: "hvac",
        warrantyEndDate: "2030-01-15",
        warrantyTerm: "10 years",
      }),
    });
    assert.equal(assetRes.status, 201);
    const asset = ((await assetRes.json()) as AssetBody).asset;

    const form = new FormData();
    form.append(
      "file",
      new File([Buffer.from("warranty-pdf-bytes")], "warranty.pdf", {
        type: "application/pdf",
      }),
    );
    form.append("title", "Furnace warranty");
    form.append("docType", "warranty");
    form.append("documentDate", "2022-06-15");
    form.append("assetId", asset.id);

    const uploaded = await app.request(`/properties/${home.id}/documents`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.accessToken}` },
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = (await uploaded.json()) as DocumentBody;
    assert.equal(uploadedBody.document.title, "Furnace warranty");
    assert.equal(uploadedBody.document.assetId, asset.id);
    assert.equal(uploadedBody.document.source, "user");
    assert.equal(uploadedBody.document.docType, "warranty");
    assert.ok(uploadedBody.document.byteSize > 0);

    const list = await app.request(
      `/properties/${home.id}/documents?assetId=${asset.id}`,
      { headers: { authorization: `Bearer ${auth.accessToken}` } },
    );
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { documents: Array<{ id: string }> };
    assert.equal(listBody.documents.length, 1);

    const content = await app.request(
      `/properties/${home.id}/documents/${uploadedBody.document.id}/content`,
      { headers: { authorization: `Bearer ${auth.accessToken}` } },
    );
    assert.equal(content.status, 200);
    assert.equal(content.headers.get("content-type"), "application/pdf");
    const bytes = Buffer.from(await content.arrayBuffer());
    assert.equal(bytes.toString("utf8"), "warranty-pdf-bytes");

    const deleted = await app.request(
      `/properties/${home.id}/documents/${uploadedBody.document.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${auth.accessToken}` },
      },
    );
    assert.equal(deleted.status, 200);

    const empty = await app.request(`/properties/${home.id}/documents`, {
      headers: { authorization: `Bearer ${auth.accessToken}` },
    });
    const emptyBody = (await empty.json()) as { documents: unknown[] };
    assert.equal(emptyBody.documents.length, 0);
  });

  it("supports property-level documents and home packet export", async () => {
    const app = createApp();
    const auth = await signup(app, "export@example.com");
    const home = await createHome(app, auth.accessToken, "Export Home");

    const form = new FormData();
    form.append(
      "file",
      new File([Buffer.from("home-photo")], "front.jpg", {
        type: "image/jpeg",
      }),
    );
    form.append("title", "Front of house");
    form.append("docType", "photo");

    const uploaded = await app.request(`/properties/${home.id}/documents`, {
      method: "POST",
      headers: { authorization: `Bearer ${auth.accessToken}` },
      body: form,
    });
    assert.equal(uploaded.status, 201);

    const propertyOnly = await app.request(
      `/properties/${home.id}/documents?scope=property`,
      { headers: { authorization: `Bearer ${auth.accessToken}` } },
    );
    const propertyBody = (await propertyOnly.json()) as {
      documents: Array<{ assetId: string | null; title: string }>;
    };
    assert.equal(propertyBody.documents.length, 1);
    assert.equal(propertyBody.documents[0]?.assetId, null);

    const exported = await app.request(`/properties/${home.id}/export`, {
      headers: { authorization: `Bearer ${auth.accessToken}` },
    });
    assert.equal(exported.status, 200);
    const exportBody = (await exported.json()) as {
      packet: {
        format: string;
        privacy: { silentSharing: boolean };
        property: { name: string };
        documents: unknown[];
        reminders: unknown[];
      };
    };
    assert.equal(exportBody.packet.format, "homeasset.home_packet.v1");
    assert.equal(exportBody.packet.privacy.silentSharing, false);
    assert.equal(exportBody.packet.property.name, "Export Home");
    assert.equal(exportBody.packet.documents.length, 1);
    assert.ok(Array.isArray(exportBody.packet.reminders));
  });

  it("never leaks documents across accounts or homes", async () => {
    const app = createApp();
    const alice = await signup(app, "alice-docs@example.com");
    const bob = await signup(app, "bob-docs@example.com");
    const aliceHome = await createHome(app, alice.accessToken, "Alice Docs");
    const bobHome = await createHome(app, bob.accessToken, "Bob Docs");

    const form = new FormData();
    form.append(
      "file",
      new File([Buffer.from("secret")], "secret.pdf", {
        type: "application/pdf",
      }),
    );
    form.append("title", "Private receipt");
    form.append("docType", "receipt");

    const uploaded = await app.request(`/properties/${aliceHome.id}/documents`, {
      method: "POST",
      headers: { authorization: `Bearer ${alice.accessToken}` },
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const doc = ((await uploaded.json()) as DocumentBody).document;

    const bobList = await app.request(`/properties/${aliceHome.id}/documents`, {
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobList.status, 404);

    const bobSteal = await app.request(
      `/properties/${bobHome.id}/documents/${doc.id}/content`,
      { headers: { authorization: `Bearer ${bob.accessToken}` } },
    );
    assert.equal(bobSteal.status, 404);
  });
});

type ReminderBody = {
  reminder: {
    id: string;
    propertyId: string;
    assetId: string;
    assetName: string | null;
    title: string;
    dueDate: string;
    recurrence: string;
    status: string;
    lastCompletedAt: string | null;
  };
};

describe("HomeAsset API — maintenance reminders", () => {
  it("rejects reminder list without a token", async () => {
    const app = createApp();
    const res = await app.request("/properties/fake/reminders");
    assert.equal(res.status, 401);
  });

  it("creates one-off and recurring reminders, marks complete, and keeps history", async () => {
    const app = createApp();
    const auth = await signup(app, "reminders@example.com");
    const home = await createHome(app, auth.accessToken, "Reminder Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const assetRes = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Furnace", category: "hvac" }),
    });
    assert.equal(assetRes.status, 201);
    const asset = ((await assetRes.json()) as AssetBody).asset;

    const oneOff = await app.request(`/properties/${home.id}/reminders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assetId: asset.id,
        title: "One-time inspection",
        dueDate: "2026-12-01",
        recurrence: "none",
      }),
    });
    assert.equal(oneOff.status, 201);
    const oneOffBody = (await oneOff.json()) as ReminderBody;
    assert.equal(oneOffBody.reminder.status, "active");
    assert.equal(oneOffBody.reminder.assetName, "Furnace");

    const recurring = await app.request(`/properties/${home.id}/reminders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assetId: asset.id,
        title: "Replace air filter",
        dueDate: "2026-03-15",
        recurrence: "quarterly",
        notes: "16x25x1",
      }),
    });
    assert.equal(recurring.status, 201);
    const recurringBody = (await recurring.json()) as ReminderBody;

    const list = await app.request(`/properties/${home.id}/reminders`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as {
      reminders: Array<{ id: string; title: string }>;
    };
    assert.equal(listBody.reminders.length, 2);
    assert.equal(listBody.reminders[0]?.title, "Replace air filter");

    const doneOneOff = await app.request(
      `/properties/${home.id}/reminders/${oneOffBody.reminder.id}/complete`,
      { method: "POST", headers, body: JSON.stringify({ note: "Done" }) },
    );
    assert.equal(doneOneOff.status, 200);
    const doneOneOffBody = (await doneOneOff.json()) as ReminderBody & {
      completion: { note: string | null };
    };
    assert.equal(doneOneOffBody.reminder.status, "completed");
    assert.equal(doneOneOffBody.completion.note, "Done");

    const doneRecurring = await app.request(
      `/properties/${home.id}/reminders/${recurringBody.reminder.id}/complete`,
      { method: "POST", headers, body: JSON.stringify({}) },
    );
    assert.equal(doneRecurring.status, 200);
    const doneRecurringBody = (await doneRecurring.json()) as ReminderBody;
    assert.equal(doneRecurringBody.reminder.status, "active");
    assert.equal(doneRecurringBody.reminder.dueDate, "2026-06-15");
    assert.ok(doneRecurringBody.reminder.lastCompletedAt);

    const upcoming = await app.request(`/properties/${home.id}/reminders`, {
      headers: { authorization: headers.authorization },
    });
    const upcomingBody = (await upcoming.json()) as {
      reminders: Array<{ id: string }>;
    };
    assert.equal(upcomingBody.reminders.length, 1);
    assert.equal(upcomingBody.reminders[0]?.id, recurringBody.reminder.id);

    const history = await app.request(
      `/properties/${home.id}/reminders/${recurringBody.reminder.id}/history`,
      { headers: { authorization: headers.authorization } },
    );
    assert.equal(history.status, 200);
    const historyBody = (await history.json()) as {
      history: Array<{ dueDateAtCompletion: string }>;
    };
    assert.equal(historyBody.history.length, 1);
    assert.equal(historyBody.history[0]?.dueDateAtCompletion, "2026-03-15");

    const templates = await app.request(
      `/properties/${home.id}/reminders/templates?category=hvac`,
      { headers: { authorization: headers.authorization } },
    );
    assert.equal(templates.status, 200);
    const templatesBody = (await templates.json()) as {
      templates: Array<{ id: string; category: string }>;
    };
    assert.ok(templatesBody.templates.some((t) => t.id === "hvac-filter"));
    assert.ok(templatesBody.templates.every((t) => t.category === "hvac" || t.category === "any"));
  });

  it("never leaks reminders across accounts or homes", async () => {
    const app = createApp();
    const alice = await signup(app, "alice-reminders@example.com");
    const bob = await signup(app, "bob-reminders@example.com");
    const aliceHome = await createHome(app, alice.accessToken, "Alice Rem");
    const bobHome = await createHome(app, bob.accessToken, "Bob Rem");
    const aliceCabin = await createHome(app, alice.accessToken, "Alice Cabin");

    const aliceHeaders = {
      "content-type": "application/json",
      authorization: `Bearer ${alice.accessToken}`,
    };
    const assetRes = await app.request(`/properties/${aliceHome.id}/assets`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ name: "Generator", category: "generator" }),
    });
    const asset = ((await assetRes.json()) as AssetBody).asset;

    const created = await app.request(`/properties/${aliceHome.id}/reminders`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        assetId: asset.id,
        title: "Test run",
        dueDate: "2026-04-01",
        recurrence: "monthly",
      }),
    });
    assert.equal(created.status, 201);
    const reminder = ((await created.json()) as ReminderBody).reminder;

    const bobList = await app.request(`/properties/${aliceHome.id}/reminders`, {
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobList.status, 404);

    const bobSteal = await app.request(
      `/properties/${bobHome.id}/reminders/${reminder.id}`,
      { headers: { authorization: `Bearer ${bob.accessToken}` } },
    );
    assert.equal(bobSteal.status, 404);

    const cabinList = await app.request(
      `/properties/${aliceCabin.id}/reminders`,
      { headers: { authorization: `Bearer ${alice.accessToken}` } },
    );
    assert.equal(cabinList.status, 200);
    const cabinBody = (await cabinList.json()) as { reminders: unknown[] };
    assert.equal(cabinBody.reminders.length, 0);

    const wrongHome = await app.request(
      `/properties/${aliceCabin.id}/reminders/${reminder.id}`,
      { headers: { authorization: `Bearer ${alice.accessToken}` } },
    );
    assert.equal(wrongHome.status, 404);
  });

  it("rejects invalid reminder payloads", async () => {
    const app = createApp();
    const auth = await signup(app, "bad-reminder@example.com");
    const home = await createHome(app, auth.accessToken, "Bad Reminder");
    const res = await app.request(`/properties/${home.id}/reminders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ title: "Missing asset and due date" }),
    });
    assert.equal(res.status, 400);
  });
});

type NotificationListBody = {
  notifications: Array<{
    id: string;
    kind: string;
    title: string;
    readAt: string | null;
    pushStatus: string;
    relatedReminderId: string | null;
  }>;
  unreadCount: number;
};

describe("HomeAsset API — notifications", () => {
  it("rejects notification center without a token", async () => {
    const app = createApp();
    assert.equal((await app.request("/me/notifications")).status, 401);
    assert.equal(
      (await app.request("/me/notifications/preferences")).status,
      401,
    );
  });

  it("serves default prefs, registers a device, and creates due notices", async () => {
    const app = createApp();
    const auth = await signup(app, "notify@example.com");
    const home = await createHome(app, auth.accessToken, "Notify Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const prefsRes = await app.request("/me/notifications/preferences", {
      headers: { authorization: headers.authorization },
    });
    assert.equal(prefsRes.status, 200);
    const prefsBody = (await prefsRes.json()) as {
      preferences: {
        remindersEnabled: boolean;
        reminderLeadDays: number;
        pushEnabled: boolean;
      };
      privacy: { marketing: boolean; sms: boolean };
    };
    assert.equal(prefsBody.preferences.remindersEnabled, true);
    assert.equal(prefsBody.preferences.reminderLeadDays, 3);
    assert.equal(prefsBody.privacy.marketing, false);
    assert.equal(prefsBody.privacy.sms, false);

    const patch = await app.request("/me/notifications/preferences", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ reminderLeadDays: 7, pushEnabled: true }),
    });
    assert.equal(patch.status, 200);
    const patchBody = (await patch.json()) as {
      preferences: { reminderLeadDays: number };
    };
    assert.equal(patchBody.preferences.reminderLeadDays, 7);

    const device = await app.request("/me/notifications/devices", {
      method: "POST",
      headers,
      body: JSON.stringify({
        expoPushToken: "ExponentPushToken[test-token-notify]",
        platform: "ios",
        deviceName: "Test Phone",
      }),
    });
    assert.equal(device.status, 201);

    const assetRes = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Water heater", category: "water_heater" }),
    });
    assert.equal(assetRes.status, 201);
    const asset = ((await assetRes.json()) as AssetBody).asset;

    // Due today → within any lead window.
    const today = new Date();
    const yy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const dueToday = `${yy}-${mm}-${dd}`;

    const reminderRes = await app.request(`/properties/${home.id}/reminders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assetId: asset.id,
        title: "Flush tank",
        dueDate: dueToday,
        recurrence: "yearly",
      }),
    });
    assert.equal(reminderRes.status, 201);
    const reminder = ((await reminderRes.json()) as ReminderBody).reminder;

    const dueCheck = await app.request("/me/notifications/run-due-check", {
      method: "POST",
      headers: { authorization: headers.authorization },
    });
    assert.equal(dueCheck.status, 200);
    const dueBody = (await dueCheck.json()) as {
      result: { created: number; scanned: number };
      unreadCount: number;
    };
    assert.ok(dueBody.result.scanned >= 1);
    assert.equal(dueBody.result.created, 1);
    assert.equal(dueBody.unreadCount, 1);

    const list = await app.request("/me/notifications", {
      headers: { authorization: headers.authorization },
    });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as NotificationListBody;
    assert.equal(listBody.notifications.length, 1);
    assert.equal(listBody.notifications[0]?.kind, "reminder_due");
    assert.equal(listBody.notifications[0]?.relatedReminderId, reminder.id);
    assert.equal(listBody.notifications[0]?.readAt, null);
    // No EXPO_ACCESS_TOKEN in tests → stubbed push.
    assert.equal(listBody.notifications[0]?.pushStatus, "stubbed");

    // Idempotent: second run does not duplicate.
    const dueCheck2 = await app.request("/me/notifications/run-due-check", {
      method: "POST",
      headers: { authorization: headers.authorization },
    });
    const dueBody2 = (await dueCheck2.json()) as {
      result: { created: number; skippedExisting: number };
    };
    assert.equal(dueBody2.result.created, 0);
    assert.ok(dueBody2.result.skippedExisting >= 1);

    const read = await app.request(
      `/me/notifications/${listBody.notifications[0]!.id}/read`,
      { method: "POST", headers: { authorization: headers.authorization } },
    );
    assert.equal(read.status, 200);
    const readBody = (await read.json()) as {
      notification: { readAt: string | null };
    };
    assert.ok(readBody.notification.readAt);

    const job = await app.request("/jobs/due-reminders", { method: "POST" });
    assert.equal(job.status, 200);
    const jobBody = (await job.json()) as {
      ok: boolean;
      privacy: { marketing: boolean };
    };
    assert.equal(jobBody.ok, true);
    assert.equal(jobBody.privacy.marketing, false);
  });

  it("never leaks notifications across accounts", async () => {
    const app = createApp();
    const alice = await signup(app, "alice-notify@example.com");
    const bob = await signup(app, "bob-notify@example.com");
    const aliceHome = await createHome(app, alice.accessToken, "Alice N");
    const aliceHeaders = {
      "content-type": "application/json",
      authorization: `Bearer ${alice.accessToken}`,
    };

    const assetRes = await app.request(`/properties/${aliceHome.id}/assets`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ name: "Roof", category: "roof" }),
    });
    const asset = ((await assetRes.json()) as AssetBody).asset;
    const today = new Date();
    const dueToday = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    await app.request(`/properties/${aliceHome.id}/reminders`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        assetId: asset.id,
        title: "Inspect shingles",
        dueDate: dueToday,
        recurrence: "none",
      }),
    });
    await app.request("/me/notifications/run-due-check", {
      method: "POST",
      headers: { authorization: aliceHeaders.authorization },
    });

    const aliceList = await app.request("/me/notifications", {
      headers: { authorization: `Bearer ${alice.accessToken}` },
    });
    const aliceBody = (await aliceList.json()) as NotificationListBody;
    assert.ok(aliceBody.notifications.length >= 1);
    const noteId = aliceBody.notifications[0]!.id;

    const bobList = await app.request("/me/notifications", {
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    const bobBody = (await bobList.json()) as NotificationListBody;
    assert.equal(bobBody.notifications.length, 0);

    const bobRead = await app.request(`/me/notifications/${noteId}/read`, {
      method: "POST",
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobRead.status, 404);
  });

  it("skips reminder notices when reminders preference is off", async () => {
    const app = createApp();
    const auth = await signup(app, "quiet@example.com");
    const home = await createHome(app, auth.accessToken, "Quiet Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    await app.request("/me/notifications/preferences", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ remindersEnabled: false }),
    });

    const assetRes = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "HVAC", category: "hvac" }),
    });
    const asset = ((await assetRes.json()) as AssetBody).asset;
    const today = new Date();
    const dueToday = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    await app.request(`/properties/${home.id}/reminders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assetId: asset.id,
        title: "Filter",
        dueDate: dueToday,
        recurrence: "monthly",
      }),
    });

    const dueCheck = await app.request("/me/notifications/run-due-check", {
      method: "POST",
      headers: { authorization: headers.authorization },
    });
    const dueBody = (await dueCheck.json()) as {
      result: { created: number; skippedPrefs: number };
      unreadCount: number;
    };
    assert.equal(dueBody.result.created, 0);
    assert.ok(dueBody.result.skippedPrefs >= 1);
    assert.equal(dueBody.unreadCount, 0);
  });
});

describe("HomeAsset API — AI assist (EPIC 6)", () => {
  it("rejects AI scan / howto without a token", async () => {
    const app = createApp();
    const fakeId = "00000000-0000-4000-8000-000000000001";
    assert.equal(
      (
        await app.request(`/properties/${fakeId}/ai/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hint: "generator" }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await app.request(`/properties/${fakeId}/ai/howto`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: "How do I start it?" }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await app.request("/ai/contractor/format", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inputText: "Installed HVAC", inputKind: "typed" }),
        })
      ).status,
      401,
    );
  });

  it("scans to a draft without writing assets, then confirms manuals", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "ai-scan@example.com");
    const home = await createHome(app, auth.accessToken, "AI Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const before = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await before.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const scan = await app.request(`/properties/${home.id}/ai/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hint: "Generac GP6500 portable generator" }),
    });
    assert.equal(scan.status, 200);
    const scanBody = (await scan.json()) as {
      draft: {
        draftId: string;
        privacy: { writes: boolean; confirmRequired: boolean };
        suggestedAsset: { name: string; category: string };
        manuals: Array<{ id: string; selectedByDefault: boolean }>;
      };
      aiMode: string;
    };
    assert.equal(scanBody.aiMode, "mock");
    assert.equal(scanBody.draft.privacy.writes, false);
    assert.equal(scanBody.draft.privacy.confirmRequired, true);
    assert.match(scanBody.draft.suggestedAsset.name, /Generac/i);
    assert.ok(scanBody.draft.manuals.length >= 1);

    const mid = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await mid.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const selectedIds = scanBody.draft.manuals
      .filter((m) => m.selectedByDefault)
      .map((m) => m.id);
    const confirm = await app.request(`/properties/${home.id}/ai/confirm-scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        draftId: scanBody.draft.draftId,
        selectedManualIds: selectedIds,
      }),
    });
    assert.equal(confirm.status, 200);
    const confirmBody = (await confirm.json()) as {
      asset: { id: string; name: string; manufacturer: string | null };
      documents: Array<{ source: string; docType: string }>;
      storedManualCount: number;
      privacy: { confirmedByUser: boolean };
    };
    assert.equal(confirmBody.privacy.confirmedByUser, true);
    assert.ok(confirmBody.storedManualCount >= 1);
    assert.equal(confirmBody.documents[0]?.source, "ai_fetched");
    assert.equal(confirmBody.documents[0]?.docType, "manual");
    assert.equal(confirmBody.asset.manufacturer, "Generac");

    const reuse = await app.request(`/properties/${home.id}/ai/confirm-scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        draftId: scanBody.draft.draftId,
        selectedManualIds: selectedIds,
      }),
    });
    assert.equal(reuse.status, 404);
  });

  it("answers how-to grounded in stored manuals and refuses ungrounded open advice", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "ai-howto@example.com");
    const home = await createHome(app, auth.accessToken, "HowTo Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const scan = await app.request(`/properties/${home.id}/ai/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hint: "generator oil start" }),
    });
    const scanBody = (await scan.json()) as {
      draft: { draftId: string; manuals: Array<{ id: string }> };
    };
    const confirm = await app.request(`/properties/${home.id}/ai/confirm-scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        draftId: scanBody.draft.draftId,
        selectedManualIds: scanBody.draft.manuals.map((m) => m.id),
      }),
    });
    const assetId = ((await confirm.json()) as { asset: { id: string } }).asset
      .id;

    const howto = await app.request(`/properties/${home.id}/ai/howto`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        question: "How do I start the generator safely outdoors?",
        assetId,
      }),
    });
    assert.equal(howto.status, 200);
    const howtoBody = (await howto.json()) as {
      grounded: boolean;
      answer: string;
      citations: Array<{ kind: string }>;
      privacy: { writes: boolean };
    };
    assert.equal(howtoBody.grounded, true);
    assert.equal(howtoBody.privacy.writes, false);
    assert.match(howtoBody.answer, /outdoor|oil|choke|fuel/i);
    assert.ok(howtoBody.citations.length >= 1);

    const emptyHome = await createHome(app, auth.accessToken, "Empty AI Home");
    await app.request(`/properties/${emptyHome.id}/select`, {
      method: "POST",
      headers: { authorization: headers.authorization },
    });
    const ungrounded = await app.request(`/properties/${emptyHome.id}/ai/howto`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        question: "How often should I service a ZX4 turbo muffler bearing?",
      }),
    });
    assert.equal(ungrounded.status, 200);
    const ungroundedBody = (await ungrounded.json()) as {
      grounded: boolean;
      answer: string;
    };
    assert.equal(ungroundedBody.grounded, false);
    assert.match(ungroundedBody.answer, /don.?t have enough|manuals/i);
  });

  it("soft-rejects clearly off-topic Ask HomeAsset how-to asks", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "ai-offtopic@example.com");
    const home = await createHome(app, auth.accessToken, "Scope Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const refused = await app.request(`/properties/${home.id}/ai/howto`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        question: "Write me a Python function to parse JSON and debug my React app",
      }),
    });
    assert.equal(refused.status, 200);
    const body = (await refused.json()) as {
      grounded: boolean;
      refused?: boolean;
      code?: string;
      answer: string;
      privacy: { writes: boolean };
    };
    assert.equal(body.grounded, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "off_topic");
    assert.equal(body.privacy.writes, false);
    assert.match(body.answer, /home help|coding projects|Ask HomeAsset/i);
  });

  it("enforces per-user Ask HomeAsset burst rate limits", async () => {
    process.env.AI_FORCE_MOCK = "1";
    process.env.AI_ASSIST_BURST_LIMIT = "3";
    process.env.AI_ASSIST_BURST_WINDOW_SECONDS = "60";
    process.env.AI_ASSIST_DAILY_CAP = "40";
    const { __resetAiAssistRateLimitForTests } = await import(
      "./lib/ai/rateLimit.js"
    );
    __resetAiAssistRateLimitForTests();

    const app = createApp();
    const auth = await signup(app, "ai-ratelimit@example.com");
    const home = await createHome(app, auth.accessToken, "Limit Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    for (let i = 0; i < 3; i += 1) {
      const scan = await app.request(`/properties/${home.id}/ai/scan`, {
        method: "POST",
        headers,
        body: JSON.stringify({ hint: `Generac scan ${i}` }),
      });
      assert.equal(scan.status, 200, `scan ${i} should succeed`);
    }

    const blocked = await app.request(`/properties/${home.id}/ai/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hint: "Generac blocked" }),
    });
    assert.equal(blocked.status, 429);
    const blockedBody = (await blocked.json()) as {
      error: string;
      code: string;
      message: string;
    };
    assert.equal(blockedBody.error, "rate_limited");
    assert.equal(blockedBody.code, "burst");
    assert.match(blockedBody.message, /short pause|too many asks/i);

    delete process.env.AI_ASSIST_BURST_LIMIT;
    delete process.env.AI_ASSIST_BURST_WINDOW_SECONDS;
    delete process.env.AI_ASSIST_DAILY_CAP;
    __resetAiAssistRateLimitForTests();
  });

  it("formats contractor notes as a draft without writing the ledger", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "pro-ai@example.com", "contractor");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const status = await app.request("/ai/contractor/status", {
      headers: { authorization: headers.authorization },
    });
    assert.equal(status.status, 200);
    const statusBody = (await status.json()) as {
      privacy: { writes: boolean; homeownerApproveRequired: boolean };
      capabilities: { submitToLedger: boolean };
    };
    assert.equal(statusBody.privacy.writes, false);
    assert.equal(statusBody.privacy.homeownerApproveRequired, true);
    assert.equal(statusBody.capabilities.submitToLedger, false);

    const formatted = await app.request("/ai/contractor/format", {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputKind: "typed",
        inputText:
          "Replaced Carrier Infinity filter and checked outdoor coil. Left old filter in garage.",
      }),
    });
    assert.equal(formatted.status, 200);
    const body = (await formatted.json()) as {
      draft: { summary: string; assetsSuggested: unknown[] };
      privacy: { writes: boolean; confirmRequired: boolean };
    };
    assert.equal(body.privacy.writes, false);
    assert.equal(body.privacy.confirmRequired, true);
    assert.ok(body.draft.summary.length > 0);
    assert.ok(body.draft.assetsSuggested.length >= 1);
  });

  it("never lets another account confirm or query AI for your home", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const alice = await signup(app, "alice-ai@example.com");
    const bob = await signup(app, "bob-ai@example.com");
    const aliceHome = await createHome(app, alice.accessToken, "Alice AI");

    const scan = await app.request(`/properties/${aliceHome.id}/ai/scan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${alice.accessToken}`,
      },
      body: JSON.stringify({ hint: "water heater rheem" }),
    });
    const draftId = ((await scan.json()) as { draft: { draftId: string } })
      .draft.draftId;

    const bobConfirm = await app.request(
      `/properties/${aliceHome.id}/ai/confirm-scan`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bob.accessToken}`,
        },
        body: JSON.stringify({ draftId, selectedManualIds: [] }),
      },
    );
    assert.equal(bobConfirm.status, 404);

    const bobHowto = await app.request(`/properties/${aliceHome.id}/ai/howto`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bob.accessToken}`,
      },
      body: JSON.stringify({ question: "How do I flush the tank?" }),
    });
    assert.equal(bobHowto.status, 404);
  });
});

describe("HomeAsset API — email + permit intake (D18)", () => {
  it("rejects email intake and permit suggest without a token", async () => {
    const app = createApp();
    const fakeId = "00000000-0000-4000-8000-000000000001";
    assert.equal(
      (
        await app.request(`/properties/${fakeId}/ai/email-intake`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            emailText:
              "From: Acme HVAC\nSubject: Install complete\nInstalled Carrier Infinity unit today.",
          }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await app.request(`/properties/${fakeId}/ai/permits/suggest`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
  });

  it("drafts multi-source asset intake without writing, then confirms add", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "asset-intake@example.com");
    const home = await createHome(app, auth.accessToken, "Asset Intake Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const before = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await before.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const intake = await app.request(
      `/properties/${home.id}/ai/asset-intake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          sourceKind: "email",
          text: [
            "From: Acme HVAC LLC <jobs@acme.example>",
            "Subject: Installed ductless AC/Heater — 2024-05-10",
            "",
            "Installed your new Carrier Infinity ductless unit today.",
          ].join("\n"),
        }),
      },
    );
    assert.equal(intake.status, 200);
    const intakeBody = (await intake.json()) as {
      draft: {
        draftId: string;
        intent: "add" | "update";
        privacy: { writes: boolean; confirmRequired: boolean };
        suggestedAsset: {
          name: string;
          category: string;
          manufacturer: string | null;
          model: string | null;
          serial: string | null;
          purchaseDate: string | null;
          installDate: string | null;
          installerVendor: string | null;
          location: string | null;
          notes: string | null;
          warrantyEndDate: string | null;
          warrantyTerm: string | null;
        };
        missingFields: Array<{ key: string }>;
      };
      aiMode: string;
    };
    assert.equal(intakeBody.aiMode, "mock");
    assert.equal(intakeBody.draft.privacy.writes, false);
    assert.equal(intakeBody.draft.privacy.confirmRequired, true);
    assert.equal(intakeBody.draft.intent, "add");
    assert.ok(intakeBody.draft.suggestedAsset.name.length > 0);
    assert.ok(intakeBody.draft.missingFields.length >= 1);

    const mid = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await mid.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const confirm = await app.request(
      `/properties/${home.id}/ai/confirm-asset-intake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          draftId: intakeBody.draft.draftId,
          intent: "add",
          assetOverrides: {
            ...intakeBody.draft.suggestedAsset,
            serial: "SN-TEST-001",
            location: "Living room",
          },
        }),
      },
    );
    assert.equal(confirm.status, 200);
    const confirmBody = (await confirm.json()) as {
      asset: { id: string; name: string; serial: string | null };
      intent: string;
      privacy: { confirmedByUser: boolean };
    };
    assert.equal(confirmBody.privacy.confirmedByUser, true);
    assert.equal(confirmBody.intent, "add");
    assert.equal(confirmBody.asset.serial, "SN-TEST-001");

    const reuse = await app.request(
      `/properties/${home.id}/ai/confirm-asset-intake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          draftId: intakeBody.draft.draftId,
          intent: "add",
          assetOverrides: intakeBody.draft.suggestedAsset,
        }),
      },
    );
    assert.equal(reuse.status, 404);
  });

  it("drafts email intake without writing, then confirms selected assets", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "email-intake@example.com");
    const home = await createHome(app, auth.accessToken, "Email Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const before = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await before.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const intake = await app.request(
      `/properties/${home.id}/ai/email-intake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          emailText: [
            "From: Acme HVAC LLC <jobs@acme.example>",
            "Subject: Carrier Infinity install complete — 2024-05-10",
            "",
            "Hi — we finished installing your Carrier Infinity outdoor unit and new filter.",
            "Serial left on the unit sticker. Call us if the thermostat needs pairing.",
          ].join("\n"),
        }),
      },
    );
    assert.equal(intake.status, 200);
    const intakeBody = (await intake.json()) as {
      draft: {
        draftId: string;
        privacy: { writes: boolean; confirmRequired: boolean };
        summary: string;
        assetsSuggested: Array<{ name: string; category: string }>;
      };
      aiMode: string;
    };
    assert.equal(intakeBody.aiMode, "mock");
    assert.equal(intakeBody.draft.privacy.writes, false);
    assert.equal(intakeBody.draft.privacy.confirmRequired, true);
    assert.ok(intakeBody.draft.summary.length > 0);
    assert.ok(intakeBody.draft.assetsSuggested.length >= 1);

    const mid = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await mid.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const confirm = await app.request(
      `/properties/${home.id}/ai/confirm-email-intake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          draftId: intakeBody.draft.draftId,
          selectedAssetIndexes: [0],
          storeSummaryDocument: true,
        }),
      },
    );
    assert.equal(confirm.status, 200);
    const confirmBody = (await confirm.json()) as {
      assets: Array<{ id: string; name: string; provenance: string }>;
      summaryDocument: { source: string; docType: string } | null;
      privacy: { confirmedByUser: boolean };
    };
    assert.equal(confirmBody.privacy.confirmedByUser, true);
    assert.equal(confirmBody.assets.length, 1);
    assert.equal(confirmBody.assets[0]?.provenance, "homeowner");
    assert.equal(confirmBody.summaryDocument?.source, "ai_fetched");
    assert.equal(confirmBody.summaryDocument?.docType, "install_paperwork");

    const reuse = await app.request(
      `/properties/${home.id}/ai/confirm-email-intake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          draftId: intakeBody.draft.draftId,
          selectedAssetIndexes: [0],
        }),
      },
    );
    assert.equal(reuse.status, 404);
  });

  it("suggests permits as drafts then confirms only selected ones", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const app = createApp();
    const auth = await signup(app, "permit-intake@example.com");
    const home = await createHome(app, auth.accessToken, "Oak Permit Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const suggest = await app.request(
      `/properties/${home.id}/ai/permits/suggest`,
      {
        method: "POST",
        headers,
        body: "{}",
      },
    );
    assert.equal(suggest.status, 200);
    const suggestBody = (await suggest.json()) as {
      sourceMode: string;
      draft: {
        draftId: string;
        mode: string;
        sourceNote: string;
        privacy: { writes: boolean; confirmRequired: boolean };
        permits: Array<{
          id: string;
          selectedByDefault: boolean;
          suggestedAsset: { name: string };
        }>;
      };
    };
    assert.equal(suggestBody.sourceMode, "stub");
    assert.equal(suggestBody.draft.mode, "stub");
    assert.equal(suggestBody.draft.privacy.writes, false);
    assert.equal(suggestBody.draft.privacy.confirmRequired, true);
    assert.match(suggestBody.draft.sourceNote, /stub/i);
    assert.ok(suggestBody.draft.permits.length >= 1);

    const mid = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await mid.json()) as { assets: unknown[] }).assets.length,
      0,
    );

    const firstId = suggestBody.draft.permits[0]!.id;
    const confirm = await app.request(
      `/properties/${home.id}/ai/permits/confirm`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          draftId: suggestBody.draft.draftId,
          selectedPermitIds: [firstId],
        }),
      },
    );
    assert.equal(confirm.status, 200);
    const confirmBody = (await confirm.json()) as {
      assets: Array<{ id: string; name: string }>;
      sourceMode: string;
      privacy: { confirmedByUser: boolean };
    };
    assert.equal(confirmBody.sourceMode, "stub");
    assert.equal(confirmBody.privacy.confirmedByUser, true);
    assert.equal(confirmBody.assets.length, 1);

    const after = await app.request(`/properties/${home.id}/assets`, {
      headers: { authorization: headers.authorization },
    });
    assert.equal(
      ((await after.json()) as { assets: unknown[] }).assets.length,
      1,
    );

    const bob = await signup(app, "bob-permit@example.com");
    const bobSuggest = await app.request(
      `/properties/${home.id}/ai/permits/suggest`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bob.accessToken}`,
        },
        body: "{}",
      },
    );
    assert.equal(bobSuggest.status, 404);
  });
});

describe("HomeAsset API — recalls (EPIC 7)", () => {
  it("rejects recall routes without a token", async () => {
    const app = createApp();
    const fakeId = "00000000-0000-4000-8000-000000000001";
    assert.equal(
      (await app.request(`/properties/${fakeId}/recalls`)).status,
      401,
    );
    assert.equal(
      (
        await app.request("/me/notifications/run-recall-check", {
          method: "POST",
        })
      ).status,
      401,
    );
  });

  it("matches fixture recalls, notifies, and supports ack/dismiss history", async () => {
    const app = createApp();
    const auth = await signup(app, "recalls@example.com");
    const home = await createHome(app, auth.accessToken, "Recall Home");
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${auth.accessToken}`,
    };

    const assetRes = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Portable generator",
        category: "generator",
        manufacturer: "Generac",
        model: "GP6500",
        serial: "G-1001",
      }),
    });
    assert.equal(assetRes.status, 201);
    const asset = ((await assetRes.json()) as AssetBody).asset;

    const kidsRes = await app.request(`/properties/${home.id}/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "High chair",
        category: "kids_gear",
        manufacturer: "Evenflo",
        model: "Big Kid High Chair",
      }),
    });
    assert.equal(kidsRes.status, 201);

    const check = await app.request("/me/notifications/run-recall-check", {
      method: "POST",
      headers: { authorization: headers.authorization },
    });
    assert.equal(check.status, 200);
    const checkBody = (await check.json()) as {
      result: {
        mode: string;
        matchesFound: number;
        alertsCreated: number;
        notificationsCreated: number;
      };
      unreadCount: number;
    };
    assert.equal(checkBody.result.mode, "fixture");
    assert.ok(checkBody.result.matchesFound >= 2);
    assert.ok(checkBody.result.alertsCreated >= 2);
    assert.ok(checkBody.result.notificationsCreated >= 1);
    assert.ok(checkBody.unreadCount >= 1);

    const list = await app.request(
      `/properties/${home.id}/recalls?status=open`,
      { headers: { authorization: headers.authorization } },
    );
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as {
      alerts: Array<{
        id: string;
        assetId: string;
        status: string;
        recall: { title: string; manufacturer: string };
      }>;
    };
    assert.ok(listBody.alerts.length >= 2);

    const assetAlerts = await app.request(
      `/properties/${home.id}/recalls?assetId=${asset.id}&status=all`,
      { headers: { authorization: headers.authorization } },
    );
    const assetBody = (await assetAlerts.json()) as {
      alerts: Array<{ id: string; assetId: string; status: string }>;
    };
    assert.ok(assetBody.alerts.every((a) => a.assetId === asset.id));
    assert.ok(assetBody.alerts.length >= 1);
    const alertId = assetBody.alerts[0]!.id;

    const notices = await app.request("/me/notifications", {
      headers: { authorization: headers.authorization },
    });
    const noticeBody = (await notices.json()) as NotificationListBody;
    assert.ok(
      noticeBody.notifications.some((n) => n.kind === "recall_alert"),
    );

    // Idempotent second run.
    const check2 = await app.request("/me/notifications/run-recall-check", {
      method: "POST",
      headers: { authorization: headers.authorization },
    });
    const check2Body = (await check2.json()) as {
      result: { alertsCreated: number; alertsExisting: number };
    };
    assert.equal(check2Body.result.alertsCreated, 0);
    assert.ok(check2Body.result.alertsExisting >= 2);

    const ack = await app.request(
      `/properties/${home.id}/recalls/${alertId}/acknowledge`,
      { method: "POST", headers: { authorization: headers.authorization } },
    );
    assert.equal(ack.status, 200);
    const ackBody = (await ack.json()) as {
      alert: { status: string; acknowledgedAt: string | null };
    };
    assert.equal(ackBody.alert.status, "acknowledged");
    assert.ok(ackBody.alert.acknowledgedAt);

    const dismiss = await app.request(
      `/properties/${home.id}/recalls/${alertId}/dismiss`,
      { method: "POST", headers: { authorization: headers.authorization } },
    );
    assert.equal(dismiss.status, 200);
    const dismissBody = (await dismiss.json()) as {
      alert: { status: string; dismissedAt: string | null };
    };
    assert.equal(dismissBody.alert.status, "dismissed");
    assert.ok(dismissBody.alert.dismissedAt);

    const history = await app.request(
      `/properties/${home.id}/recalls?assetId=${asset.id}&status=all`,
      { headers: { authorization: headers.authorization } },
    );
    const historyBody = (await history.json()) as {
      alerts: Array<{ id: string; status: string }>;
    };
    assert.ok(
      historyBody.alerts.some(
        (a) => a.id === alertId && a.status === "dismissed",
      ),
    );

    const job = await app.request("/jobs/recalls", { method: "POST" });
    assert.equal(job.status, 200);
    const jobBody = (await job.json()) as {
      ok: boolean;
      job: string;
      privacy: { marketing: boolean };
    };
    assert.equal(jobBody.ok, true);
    assert.equal(jobBody.job, "recalls");
    assert.equal(jobBody.privacy.marketing, false);

    const propertyCheck = await app.request(
      `/properties/${home.id}/recalls/run-check`,
      { method: "POST", headers: { authorization: headers.authorization } },
    );
    assert.equal(propertyCheck.status, 200);
  });

  it("never leaks recall alerts across accounts and respects prefs", async () => {
    const app = createApp();
    const alice = await signup(app, "alice-recall@example.com");
    const bob = await signup(app, "bob-recall@example.com");
    const aliceHome = await createHome(app, alice.accessToken, "Alice R");
    const aliceHeaders = {
      "content-type": "application/json",
      authorization: `Bearer ${alice.accessToken}`,
    };

    await app.request(`/properties/${aliceHome.id}/assets`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        name: "Washer",
        category: "appliance",
        manufacturer: "Whirlpool",
        model: "WFW72HEDW",
      }),
    });
    await app.request("/me/notifications/run-recall-check", {
      method: "POST",
      headers: { authorization: aliceHeaders.authorization },
    });

    const aliceList = await app.request(
      `/properties/${aliceHome.id}/recalls`,
      { headers: { authorization: `Bearer ${alice.accessToken}` } },
    );
    const aliceBody = (await aliceList.json()) as {
      alerts: Array<{ id: string }>;
    };
    assert.ok(aliceBody.alerts.length >= 1);
    const alertId = aliceBody.alerts[0]!.id;

    const bobList = await app.request(`/properties/${aliceHome.id}/recalls`, {
      headers: { authorization: `Bearer ${bob.accessToken}` },
    });
    assert.equal(bobList.status, 404);

    const bobAck = await app.request(
      `/properties/${aliceHome.id}/recalls/${alertId}/acknowledge`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${bob.accessToken}` },
      },
    );
    assert.equal(bobAck.status, 404);

    // Prefs off → match may create alert row but skip notification.
    const quiet = await signup(app, "quiet-recall@example.com");
    const quietHome = await createHome(app, quiet.accessToken, "Quiet R");
    const quietHeaders = {
      "content-type": "application/json",
      authorization: `Bearer ${quiet.accessToken}`,
    };
    await app.request("/me/notifications/preferences", {
      method: "PATCH",
      headers: quietHeaders,
      body: JSON.stringify({ recallsEnabled: false }),
    });
    await app.request(`/properties/${quietHome.id}/assets`, {
      method: "POST",
      headers: quietHeaders,
      body: JSON.stringify({
        name: "Tire",
        category: "vehicle",
        manufacturer: "Firestone",
        model: "Wilderness AT",
      }),
    });
    const quietCheck = await app.request("/me/notifications/run-recall-check", {
      method: "POST",
      headers: { authorization: quietHeaders.authorization },
    });
    const quietBody = (await quietCheck.json()) as {
      result: { alertsCreated: number; notificationsCreated: number };
      unreadCount: number;
    };
    assert.ok(quietBody.result.alertsCreated >= 1);
    assert.equal(quietBody.result.notificationsCreated, 0);
    assert.equal(quietBody.unreadCount, 0);
  });
});
