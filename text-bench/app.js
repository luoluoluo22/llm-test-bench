const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "llm-test-bench:text-bench:connection";
const HISTORY_KEY = "llm-test-bench:text-bench:history";
const KEY_SESSION = "llm-test-bench:text-bench:api-key";
const MAX_MODELS = 4;

let availableModels = [];
let selectedModels = [];
let latestResults = [];

function setStatus(id, message, kind = "") {
  const node = $(id);
  node.textContent = message;
  node.className = "status" + (kind ? " " + kind : "");
}

function normalizedBaseUrl(value) {
  const base = String(value || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("请填写 API Base URL");
  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("只支持 HTTP 或 HTTPS 地址");
  return base.endsWith("/v1") ? base : base + "/v1";
}

function authHeaders() {
  const key = $("apiKey").value.trim();
  return key ? { Authorization: "Bearer " + key } : {};
}

function providerConfig() {
  return {
    baseUrl: normalizedBaseUrl($("baseUrl").value),
    apiKey: $("apiKey").value.trim(),
  };
}

function parseModelIds(value) {
  return String(value || "").split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function saveConnection() {
  const baseUrl = normalizedBaseUrl($("baseUrl").value);
  const modelIds = parseModelIds($("modelIds").value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl, modelIds }));
  if ($("apiKey").value.trim()) sessionStorage.setItem(KEY_SESSION, $("apiKey").value.trim());
  else sessionStorage.removeItem(KEY_SESSION);
  setStatus("connectionStatus", "连接信息已保存；API Key 仅保存在当前会话。", "success");
}

function loadConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) {
      $("baseUrl").value = saved.baseUrl || "";
      $("modelIds").value = (saved.modelIds || []).join("\n");
      availableModels = saved.modelIds || [];
    }
  } catch {}
  $("apiKey").value = sessionStorage.getItem(KEY_SESSION) || "";
  if (availableModels.length) {
    selectedModels = availableModels.slice(0, MAX_MODELS);
    renderModelChoices();
  }
}

function renderModelChoices() {
  const host = $("modelChoices");
  host.replaceChildren();
  if (!availableModels.length) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = "连接服务并获取模型列表，或在模型 ID 中手动填写。";
    host.append(p);
    return;
  }
  for (const model of availableModels) {
    const label = document.createElement("label");
    label.className = "model-chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = model;
    input.checked = selectedModels.includes(model);
    input.addEventListener("change", () => {
      if (input.checked && selectedModels.length >= MAX_MODELS) {
        input.checked = false;
        setStatus("connectionStatus", "最多同时选择 4 个模型。", "error");
        return;
      }
      selectedModels = input.checked
        ? [...selectedModels, model]
        : selectedModels.filter((item) => item !== model);
      setStatus("connectionStatus", "已选择 " + selectedModels.length + " 个模型。");
    });
    const span = document.createElement("span");
    span.textContent = model;
    label.append(input, span);
    host.append(label);
  }
}

async function fetchModels() {
  try {
    const config = providerConfig();
    setStatus("connectionStatus", "正在读取模型目录……");
    const response = await fetch(config.baseUrl + "/models", {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("模型目录请求失败：HTTP " + response.status);
    const data = await response.json();
    const ids = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
    if (!ids.length) throw new Error("接口未返回模型 ID；可以手动填写模型 ID。");
    availableModels = [...new Set(ids)];
    $("modelIds").value = availableModels.join("\n");
    selectedModels = availableModels.slice(0, MAX_MODELS);
    renderModelChoices();
    setStatus("connectionStatus", "已发现 " + availableModels.length + " 个模型，默认勾选前 " + selectedModels.length + " 个。", "success");
  } catch (error) {
    setStatus("connectionStatus", error.message + "（请检查 CORS、地址和 Key）", "error");
  }
}

function makeResultCard(model) {
  const card = document.createElement("article");
  card.className = "result-card";
  const head = document.createElement("div");
  head.className = "result-head";
  const identity = document.createElement("div");
  const name = document.createElement("div");
  name.className = "result-model";
  name.textContent = model;
  const meta = document.createElement("div");
  meta.className = "result-meta";
  meta.textContent = "等待请求";
  identity.append(name, meta);
  const state = document.createElement("span");
  state.className = "result-state";
  state.textContent = "排队中";
  head.append(identity, state);
  const body = document.createElement("div");
  body.className = "result-body";
  const pre = document.createElement("pre");
  pre.className = "result-placeholder";
  pre.textContent = "等待模型返回……";
  body.append(pre);
  const ratingRow = document.createElement("div");
  ratingRow.className = "rating-row";
  const label = document.createElement("span");
  label.textContent = "人工评分";
  const select = document.createElement("select");
  select.setAttribute("aria-label", model + " 人工评分");
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "未评分";
  select.append(blank);
  for (let score = 1; score <= 10; score++) {
    const option = document.createElement("option");
    option.value = String(score);
    option.textContent = score + " / 10";
    select.append(option);
  }
  ratingRow.append(label, select);
  card.append(head, body, ratingRow);
  return { card, meta, state, pre, select };
}

async function runOne(model, ui, prompt, systemPrompt, config) {
  const started = performance.now();
  ui.state.textContent = "生成中";
  ui.meta.textContent = "正在连接模型……";
  ui.pre.className = "";
  ui.pre.textContent = "";
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  const response = await fetch(config.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });
  if (!response.ok) {
    let message = "HTTP " + response.status;
    try {
      const error = await response.json();
      message = error.error?.message || error.message || message;
    } catch {}
    throw new Error(message);
  }

  let text = "";
  let usage = null;
  const contentType = response.headers.get("content-type") || "";
  if (!response.body || contentType.includes("application/json")) {
    const data = await response.json();
    text = data.choices?.[0]?.message?.content || "";
    usage = data.usage || null;
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        if (buffer.trim()) buffer += "\n";
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            text += delta;
            ui.pre.textContent = text;
          }
          if (event.usage) usage = event.usage;
        } catch {}
      }
    }
    const trailing = buffer.trim();
    if (trailing.startsWith("data:")) {
      const data = trailing.slice(5).trim();
      if (data && data !== "[DONE]") {
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (typeof delta === "string") text += delta;
          if (event.usage) usage = event.usage;
        } catch {}
      }
    }
  }
  const durationMs = Math.round(performance.now() - started);
  ui.pre.textContent = text || "(模型未返回文本内容)";
  ui.meta.textContent = durationMs + " ms" + (usage?.total_tokens ? " · " + usage.total_tokens + " tokens" : "");
  ui.state.textContent = "完成";
  ui.state.className = "result-state";
  return { model, provider: new URL(config.baseUrl).host, text, durationMs, usage, rating: null };
}

async function runModels() {
  if (!selectedModels.length) {
    setStatus("runStatus", "请至少选择一个模型。", "error");
    return;
  }
  const prompt = $("prompt").value.trim();
  if (!prompt) {
    setStatus("runStatus", "请先输入评测问题。", "error");
    $("prompt").focus();
    return;
  }
  let config;
  try {
    config = providerConfig();
  } catch (error) {
    setStatus("runStatus", error.message, "error");
    return;
  }
  saveConnection();
  $("runModels").disabled = true;
  $("shareResults").disabled = true;
  $("results").replaceChildren();
  latestResults = [];
  const cards = new Map();
  for (const model of selectedModels) {
    const ui = makeResultCard(model);
    cards.set(model, ui);
    $("results").append(ui.card);
  }
  setStatus("runStatus", "正在并行运行 " + selectedModels.length + " 个模型……");
  const systemPrompt = $("systemPrompt").value.trim();
  const settled = await Promise.all(selectedModels.map(async (model) => {
    const ui = cards.get(model);
    try {
      const result = await runOne(model, ui, prompt, systemPrompt, config);
      ui.select.addEventListener("change", () => { result.rating = ui.select.value ? Number(ui.select.value) : null; });
      latestResults.push(result);
      return { ok: true, model };
    } catch (error) {
      ui.state.textContent = "失败";
      ui.state.className = "result-state error";
      ui.pre.className = "";
      ui.pre.textContent = error.message;
      ui.meta.textContent = "请求失败";
      return { ok: false, model, error: error.message };
    }
  }));
  $("runModels").disabled = false;
  const successes = settled.filter((item) => item.ok).length;
  setStatus("runStatus", successes + " / " + selectedModels.length + " 个模型完成。", successes ? "success" : "error");
  if (latestResults.length) {
    $("shareResults").disabled = false;
    saveHistory({ prompt, systemPrompt, results: latestResults, createdAt: Date.now() });
  }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(item) {
  const history = [item, ...getHistory()].slice(0, 15);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const host = $("historyList");
  host.replaceChildren();
  const history = getHistory();
  if (!history.length) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = "评测记录仅保存在你的浏览器中。";
    host.append(p);
    return;
  }
  for (const item of history) {
    const row = document.createElement("div");
    row.className = "history-item";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.prompt.slice(0, 100);
    const meta = document.createElement("small");
    meta.textContent = new Date(item.createdAt).toLocaleString() + " · " + item.results.length + " 个模型";
    info.append(title, meta);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "恢复";
    button.addEventListener("click", () => {
      $("prompt").value = item.prompt;
      $("systemPrompt").value = item.systemPrompt || "";
      latestResults = item.results || [];
      renderSavedResults(latestResults);
      $("shareResults").disabled = !latestResults.length;
      setStatus("runStatus", "已恢复本机历史记录。", "success");
    });
    row.append(info, button);
    host.append(row);
  }
}

function renderSavedResults(results) {
  $("results").replaceChildren();
  for (const result of results) {
    const ui = makeResultCard(result.model);
    ui.state.textContent = "历史记录";
    ui.meta.textContent = result.durationMs + " ms";
    ui.pre.textContent = result.text;
    if (result.rating) ui.select.value = String(result.rating);
    ui.select.addEventListener("change", () => { result.rating = ui.select.value ? Number(ui.select.value) : null; });
    $("results").append(ui.card);
  }
}

async function shareResults() {
  if (!latestResults.length) return;
  const payload = {
    title: $("prompt").value.trim().slice(0, 100) || "文本模型对比",
    prompt: $("prompt").value.trim(),
    systemPrompt: $("systemPrompt").value.trim(),
    outputs: latestResults.map((result) => ({
      provider: result.provider,
      model: result.model,
      text: result.text,
      durationMs: result.durationMs,
      rating: result.rating,
    })),
  };
  const preview = payload.outputs.map((item) => item.model + ": " + item.text.slice(0, 90)).join("\n\n");
  if (!confirm("即将公开分享以下评测内容：\n\n问题：" + payload.prompt.slice(0, 220) + "\n\n" + preview + "\n\n公开内容任何人都能查看。API Key 不会被发送。确认分享？")) return;
  $("shareResults").disabled = true;
  try {
    const response = await fetch("../api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "分享失败：" + response.status);
    const url = new URL(data.url, location.origin).href;
    setStatus("runStatus", "分享成功：" + url, "success");
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "text-link";
    link.textContent = "打开公开分享页 →";
    $("runStatus").after(link);
  } catch (error) {
    setStatus("runStatus", error.message + "（请确认站点已配置 D1 数据库）", "error");
  } finally {
    $("shareResults").disabled = false;
  }
}

$("fetchModels").addEventListener("click", fetchModels);
$("saveConnection").addEventListener("click", () => {
  try { saveConnection(); }
  catch (error) { setStatus("connectionStatus", error.message, "error"); }
});
$("runModels").addEventListener("click", runModels);
$("shareResults").addEventListener("click", shareResults);
$("clearHistory").addEventListener("click", () => {
  if (!confirm("确定清空本机保存的评测历史？")) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});
$("modelIds").addEventListener("change", () => {
  availableModels = [...new Set(parseModelIds($("modelIds").value))];
  selectedModels = availableModels.slice(0, MAX_MODELS);
  renderModelChoices();
});

loadConnection();
renderHistory();
