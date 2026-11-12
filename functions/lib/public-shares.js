export const MAX_SHARE_BYTES = 48 * 1024;
export const MAX_OUTPUTS = 4;
export const MAX_TEXT_LENGTH = 12000;

const SECRET_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}\b/gi,
  /\b(?:api[_-]?key|authorization)\s*[:=]\s*["']?[^,\s"'<>]{12,}/gi,
];

export function redactSecrets(value) {
  let text = String(value || "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

function cleanText(value, maxLength) {
  return redactSecrets(String(value || "").replace(/\u0000/g, "")).trim().slice(0, maxLength);
}

export function validateSharePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "Invalid share payload" };
  }
  const prompt = cleanText(input.prompt, 4000);
  const systemPrompt = cleanText(input.systemPrompt, 2000);
  const outputs = Array.isArray(input.outputs) ? input.outputs.slice(0, MAX_OUTPUTS) : [];
  if (!prompt) return { valid: false, error: "Prompt is required" };
  if (!outputs.length) return { valid: false, error: "At least one model result is required" };
  const normalized = outputs.map((item) => {
    if (!item || typeof item !== "object") return null;
    const model = cleanText(item.model, 160);
    const provider = cleanText(item.provider, 100);
    const text = cleanText(item.text, MAX_TEXT_LENGTH);
    if (!model || !text) return null;
    return {
      model,
      provider,
      text,
      durationMs: Number.isFinite(Number(item.durationMs))
        ? Math.max(0, Math.min(3600000, Math.round(Number(item.durationMs))))
        : null,
      rating: Number.isFinite(Number(item.rating))
        ? Math.max(0, Math.min(10, Math.round(Number(item.rating))))
        : null,
    };
  }).filter(Boolean);
  if (!normalized.length) return { valid: false, error: "No valid model results" };
  const title = cleanText(input.title || prompt, 100) || "Untitled evaluation";
  return {
    valid: true,
    value: { title, prompt, systemPrompt, outputs: normalized },
  };
}

export async function hashClientAddress(address, salt = "public-share-v1") {
  const bytes = new TextEncoder().encode(String(salt) + ":" + String(address || "unknown"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newShareId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
