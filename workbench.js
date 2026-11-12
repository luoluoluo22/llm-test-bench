(() => {
  const $ = (id) => document.getElementById(id);
  const MODELS_KEY = "personal-ai-workbench:model-ids:v1";
  const CONNECTION_KEY = "llm-test-bench:text-bench:connection";
  const API_KEY_SESSION = "llm-test-bench:text-bench:api-key";
  let models = [];

  function readModels() {
    try {
      const stored = JSON.parse(localStorage.getItem(MODELS_KEY) || "null");
      if (Array.isArray(stored)) return [...new Set(stored.map(x => String(x).trim()).filter(Boolean))];
    } catch {}
    // Import model IDs already saved by the previous text bench, if present.
    try {
      const old = JSON.parse(localStorage.getItem(CONNECTION_KEY) || "null");
      if (Array.isArray(old?.modelIds)) return [...new Set(old.modelIds.map(x => String(x).trim()).filter(Boolean))];
    } catch {}
    return [];
  }
  function saveModels() { localStorage.setItem(MODELS_KEY, JSON.stringify(models)); }
  function renderModels() {
    const select = $("modelSelect");
    const previous = select.value;
    select.replaceChildren();
    if (!models.length) {
      const option = document.createElement("option"); option.value = ""; option.textContent = "请先添加模型 ID"; select.append(option);
    } else {
      for (const id of models) { const option = document.createElement("option"); option.value = id; option.textContent = id; select.append(option); }
      select.value = models.includes(previous) ? previous : models[0];
    }
    const list = $("modelList"); list.replaceChildren();
    if (!models.length) { const empty = document.createElement("li"); empty.textContent = "还没有模型，先添加一个模型 ID。"; list.append(empty); }
    models.forEach((id, index) => {
      const li = document.createElement("li"); const name = document.createElement("span"); name.textContent = id;
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button secondary"; edit.textContent = "编辑";
      edit.addEventListener("click", () => {
        const value = prompt("修改模型 ID", id);
        if (value === null) return;
        const next = value.trim(); if (!next) return alert("模型 ID 不能为空。");
        if (models.some((item, i) => i !== index && item === next)) return alert("这个模型 ID 已经存在。");
        models[index] = next; saveModels(); renderModels(); $("modelSelect").value = next;
      });
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button secondary delete-model"; remove.textContent = "删除";
      remove.addEventListener("click", () => { if (!confirm(`删除模型 ID「${id}」？`)) return; models = models.filter((_, i) => i !== index); saveModels(); renderModels(); });
      li.append(name, edit, remove); list.append(li);
    });
  }
  function loadConnection() {
    try {
      const old = JSON.parse(localStorage.getItem(CONNECTION_KEY) || "null");
      if (old?.baseUrl) $("baseUrl").value = old.baseUrl;
    } catch {}
    $("apiKey").value = sessionStorage.getItem(API_KEY_SESSION) || "";
  }
  function saveConnection() {
    const base = $("baseUrl").value.trim().replace(/\/+$/, "");
    if (!base) throw new Error("请填写 API Base URL");
    const url = new URL(base);
    if (!/^https?:$/.test(url.protocol)) throw new Error("API 地址必须使用 HTTP 或 HTTPS");
    const normalized = /\/v1$/i.test(base) ? base : `${base}/v1`;
    let old = {}; try { old = JSON.parse(localStorage.getItem(CONNECTION_KEY) || "{}"); } catch {}
    localStorage.setItem(CONNECTION_KEY, JSON.stringify({ ...old, baseUrl: normalized, modelIds: models }));
    const key = $("apiKey").value.trim();
    if (key) sessionStorage.setItem(API_KEY_SESSION, key); else sessionStorage.removeItem(API_KEY_SESSION);
    $("settingsStatus").textContent = "接口设置已保存。API Key 仅保存在当前会话。";
    return { baseUrl: normalized, apiKey: key };
  }
  function extractHtml(raw) {
    const value = String(raw || "").trim();
    const fenced = value.match(/^```(?:html|htm)?\s*\n([\s\S]*?)\n```$/i);
    const candidate = fenced ? fenced[1].trim() : value;
    const isHtml = /<!doctype\s+html|<(?:html|head|body|main|div|section|article|header|footer|nav|aside|h[1-6]|p|ul|ol|li|button|form|input|table|svg|canvas|style|script)\b/i.test(candidate);
    return isHtml ? candidate : null;
  }
  function addResult(model, content, duration, failed = false) {
    const card = document.createElement("article"); card.className = "result-card";
    const header = document.createElement("header"); const name = document.createElement("span"); name.className = "result-model"; name.textContent = model;
    const meta = document.createElement("span"); meta.className = "result-meta"; meta.textContent = failed ? "请求失败" : `${duration} ms`;
    header.append(name, meta); card.append(header);
    if (failed) { const body = document.createElement("div"); body.className = "result-content error-text"; body.textContent = content; card.append(body); }
    else {
      const html = extractHtml(content);
      if (html !== null) {
        const label = document.createElement("div"); label.className = "preview-label"; label.textContent = "网页预览 · 在隔离环境中运行";
        const frame = document.createElement("iframe"); frame.className = "html-preview"; frame.title = `${model} 生成的网页预览`; frame.setAttribute("sandbox", "allow-scripts"); frame.referrerPolicy = "no-referrer"; frame.srcdoc = html;
        card.append(label, frame);
        const rawToggle = document.createElement("details"); rawToggle.className = "raw-output"; const summary = document.createElement("summary"); summary.textContent = "查看原始代码"; const pre = document.createElement("pre"); pre.className = "result-content"; pre.textContent = content; rawToggle.append(summary, pre); card.append(rawToggle);
      } else { const body = document.createElement("div"); body.className = "result-content"; const pre = document.createElement("pre"); pre.textContent = content; body.append(pre); card.append(body); }
    }
    const empty = $("results").querySelector(".empty-state"); if (empty) empty.remove();
    $("results").prepend(card); $("resultCount").textContent = `${$("results").querySelectorAll(".result-card").length} 条结果`;
  }
  async function generate() {
    const model = $("modelSelect").value;
    const promptText = $("prompt").value.trim();
    if (!model) return setStatus("请先添加并选择模型 ID。", true);
    if (!promptText) return setStatus("请先输入提示词。", true);
    let config; try { config = saveConnection(); } catch (error) { return setStatus(error.message, true); }
    const button = $("generate"); button.disabled = true; button.querySelector("span").textContent = "生成中…"; setStatus("正在请求模型……");
    const started = performance.now();
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ model, messages: [{ role: "user", content: promptText }], stream: false })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
      const content = data?.choices?.[0]?.message?.content;
      const output = Array.isArray(content) ? content.map(part => part.text || "").join("\n") : String(content ?? "");
      if (!output) throw new Error("模型没有返回文本内容");
      const duration = Math.round(performance.now() - started); addResult(model, output, duration); setStatus("生成完成。");
    } catch (error) { addResult(model, error.message || String(error), 0, true); setStatus(`${error.message || error}（请检查接口地址、Key、模型 ID 和 CORS）`, true); }
    finally { button.disabled = false; button.querySelector("span").textContent = "生成"; }
  }
  function setStatus(message, error = false) { $("runStatus").textContent = message; $("runStatus").style.color = error ? "var(--danger)" : "var(--muted)"; }

  $("manageModels").addEventListener("click", () => { const panel = $("modelManager"); panel.hidden = !panel.hidden; if (!panel.hidden) $("newModelId").focus(); });
  $("modelForm").addEventListener("submit", event => { event.preventDefault(); const id = $("newModelId").value.trim(); if (!id) return; if (models.includes(id)) return alert("这个模型 ID 已经存在。"); models.push(id); saveModels(); renderModels(); $("modelSelect").value = id; $("newModelId").value = ""; });
  $("saveSettings").addEventListener("click", () => { try { saveConnection(); } catch (error) { $("settingsStatus").textContent = error.message; } });
  $("generate").addEventListener("click", generate);
  $("prompt").addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generate(); });
  models = readModels(); renderModels(); loadConnection();
})();
