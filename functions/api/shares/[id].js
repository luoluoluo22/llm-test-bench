import { json, notConfigured, notFound, serverError } from "../../lib/http.js";

export async function onRequestGet({ env, params }) {
  if (!env.DB) return notConfigured();
  const id = String(params.id || "");
  if (!/^[a-f0-9]{16}$/.test(id)) return notFound();
  try {
    const row = await env.DB.prepare(
      "SELECT id, title, prompt, system_prompt, outputs, created_at FROM public_shares WHERE id = ? AND status = 'published'"
    ).bind(id).first();
    if (!row) return notFound();
    return json({
      share: {
        id: row.id,
        title: row.title,
        prompt: row.prompt,
        systemPrompt: row.system_prompt,
        outputs: JSON.parse(row.outputs),
        createdAt: row.created_at,
      },
    }, { cache: "public, max-age=60" });
  } catch (error) {
    return serverError(error);
  }
}
