import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../api/shares/index.js";
import { onRequestGet as getShare } from "../api/shares/[id].js";

class FakeD1 {
  constructor() { this.rows = []; }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async first() {
        if (sql.includes("COUNT(*)")) {
          const [ipHash, cutoff] = this.values;
          return { total: db.rows.filter((row) => row.ip_hash === ipHash && row.created_at >= cutoff).length };
        }
        if (sql.includes("WHERE id = ?")) {
          const [id] = this.values;
          return db.rows.find((row) => row.id === id && row.status === "published") || null;
        }
        return null;
      },
      async all() {
        const limit = this.values[0];
        return {
          results: db.rows
            .filter((row) => row.status === "published")
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, limit),
        };
      },
      async run() {
        if (sql.startsWith("INSERT INTO public_shares")) {
          const [id, title, prompt, systemPrompt, outputs, ipHash, createdAt] = this.values;
          db.rows.push({
            id, title, prompt, system_prompt: systemPrompt, outputs,
            ip_hash: ipHash, created_at: createdAt, status: "published",
          });
        }
        return { success: true };
      },
    };
  }
}

function context(db, request, params = {}) {
  return { env: { DB: db, SHARE_RATE_SALT: "test-salt" }, request, params };
}

test("POST rejects cross-origin submissions", async () => {
  const db = new FakeD1();
  const request = new Request("https://bench.example/api/shares", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "test", outputs: [{ model: "m", text: "answer" }] }),
  });
  const response = await onRequestPost(context(db, request));
  assert.equal(response.status, 403);
  assert.equal(db.rows.length, 0);
});

test("POST stores an explicit share without credentials and GET exposes only a summary", async () => {
  const db = new FakeD1();
  const request = new Request("https://bench.example/api/shares", {
    method: "POST",
    headers: {
      Origin: "https://bench.example",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify({
      prompt: "Compare these models",
      apiKey: "sk-proj-NEVER_STORE_THIS_SECRET_123456",
      outputs: [{ model: "model-a", provider: "provider", text: "answer" }],
    }),
  });
  const response = await onRequestPost(context(db, request));
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.match(created.id, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(db.rows).includes("NEVER_STORE_THIS_SECRET"), false);

  const listResponse = await onRequestGet(context(db, new Request("https://bench.example/api/shares")));
  const list = await listResponse.json();
  assert.equal(list.shares.length, 1);
  assert.equal(list.shares[0].outputs[0].model, "model-a");
  assert.equal("text" in list.shares[0].outputs[0], false);

  const detailResponse = await getShare(context(
    db,
    new Request("https://bench.example/api/shares/" + created.id),
    { id: created.id },
  ));
  const detail = await detailResponse.json();
  assert.equal(detail.share.outputs[0].text, "answer");
});

test("POST applies a five-submissions-per-hour limit per address", async () => {
  const db = new FakeD1();
  const body = JSON.stringify({ prompt: "question", outputs: [{ model: "m", text: "answer" }] });
  let last;
  for (let index = 0; index < 6; index++) {
    const request = new Request("https://bench.example/api/shares", {
      method: "POST",
      headers: {
        Origin: "https://bench.example",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.11",
      },
      body,
    });
    last = await onRequestPost(context(db, request));
  }
  assert.equal(last.status, 429);
  assert.equal(db.rows.length, 5);
});
