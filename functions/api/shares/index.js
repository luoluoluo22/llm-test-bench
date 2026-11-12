import { json, notConfigured, serverError } from "../../lib/http.js";
import {
  MAX_SHARE_BYTES,
  hashClientAddress,
  newShareId,
  validateSharePayload,
} from "../../lib/public-shares.js";

const HOURLY_LIMIT = 5;

export async function onRequestGet({ env, request }) {
  if (!env.DB) return notConfigured();
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(40, Number(url.searchParams.get("limit")) || 20));
  try {
    const result = await env.DB.prepare(
      "SELECT id, title, prompt, outputs, created_at FROM public_shares WHERE status = 'published' ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    const shares = (result.results || []).map((row) => ({
      id: row.id,
      title: row.title,
      prompt: row.prompt,
      outputs: JSON.parse(row.outputs).map((item) => ({
        model: item.model,
        provider: item.provider,
        rating: item.rating,
      })),
      createdAt: row.created_at,
    }));
    return json({ shares }, { cache: "public, max-age=30" });
  } catch (error) {
    return serverError(error);
  }
}

export async function onRequestPost({ env, request }) {
  if (!env.DB) return notConfigured();
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin sharing is not allowed" }, { status: 403 });
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_SHARE_BYTES) {
    return json({ error: "Share is too large" }, { status: 413 });
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_SHARE_BYTES) {
      return json({ error: "Share is too large" }, { status: 413 });
    }
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const checked = validateSharePayload(input);
    if (!checked.valid) return json({ error: checked.error }, { status: 400 });

    const address = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipHash = await hashClientAddress(address, env.SHARE_RATE_SALT || "public-share-v1");
    const cutoff = Date.now() - 60 * 60 * 1000;
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM public_shares WHERE ip_hash = ? AND created_at >= ?"
    ).bind(ipHash, cutoff).first();
    if (Number(recent?.total || 0) >= HOURLY_LIMIT) {
      return json({ error: "Share limit reached. Try again in an hour." }, { status: 429 });
    }

    const id = newShareId();
    const createdAt = Date.now();
    const value = checked.value;
    await env.DB.prepare(
      "INSERT INTO public_shares (id, title, prompt, system_prompt, outputs, status, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, 'published', ?, ?)"
    ).bind(
      id,
      value.title,
      value.prompt,
      value.systemPrompt,
      JSON.stringify(value.outputs),
      ipHash,
      createdAt,
    ).run();
    return json({ id, url: "/shares.html?id=" + id, createdAt }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
