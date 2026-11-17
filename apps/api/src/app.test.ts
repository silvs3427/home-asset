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
