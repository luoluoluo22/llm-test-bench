import test from "node:test";
import assert from "node:assert/strict";
import {
  redactSecrets,
  validateSharePayload,
  MAX_OUTPUTS,
} from "../lib/public-shares.js";

test("valid share payload keeps only public evaluation fields", () => {
  const result = validateSharePayload({
    title: "Compare models",
    prompt: "Explain gravity",
    systemPrompt: "Be concise",
    apiKey: "sk-proj-THIS_SHOULD_NOT_BE_SAVED_123456",
    outputs: [
      { provider: "Local", model: "model-a", text: "Gravity attracts mass.", durationMs: 900, rating: 8, apiKey: "secret" },
    ],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(result.value), ["title", "prompt", "systemPrompt", "outputs"]);
  assert.equal(result.value.outputs[0].model, "model-a");
  assert.equal(JSON.stringify(result.value).includes("SHOULD_NOT"), false);
});

test("share text redacts common credential formats", () => {
  const text = redactSecrets("key sk-proj-abcdefghijklmnop123456 and Bearer abcdefghijklmnopqrstuvwxyz");
  assert.equal(text.includes("abcdefghijklmnop123456"), false);
  assert.equal(text.includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.match(text, /\[REDACTED\]/);
});

test("payload validation rejects empty prompts and bounds result count", () => {
  assert.equal(validateSharePayload({ prompt: "", outputs: [{ model: "m", text: "x" }] }).valid, false);
  const outputs = Array.from({ length: MAX_OUTPUTS + 2 }, (_, index) => ({
    model: "model-" + index,
    text: "result-" + index,
  }));
  const result = validateSharePayload({ prompt: "p", outputs });
  assert.equal(result.value.outputs.length, MAX_OUTPUTS);
});

test("payload rejects results without model text", () => {
  assert.equal(validateSharePayload({ prompt: "p", outputs: [{ model: "m", text: "" }] }).valid, false);
});
