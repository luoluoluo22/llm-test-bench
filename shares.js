const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function renderShareCard(share) {
  const card = el("article", "result-card");
  const head = el("div", "result-head");
  const identity = el("div");
  identity.append(el("div", "result-model", share.title));
  identity.append(el("div", "result-meta", formatDate(share.createdAt)));
  head.append(identity, el("span", "result-state", share.outputs.length + " 个模型"));
  const body = el("div", "result-body");
  body.append(el("div", "eyebrow", "PROMPT"));
  const prompt = el("pre", "", share.prompt);
  prompt.style.maxHeight = "130px";
  body.append(prompt);
  const models = el("div", "result-meta", share.outputs.map((item) => item.model).join(" · "));
  body.append(models);
  const footer = el("div", "rating-row");
  const link = el("a", "text-link", "查看完整结果 →");
  link.href = "./shares.html?id=" + encodeURIComponent(share.id);
  footer.append(link);
  card.append(head, body, footer);
  return card;
}

function renderDetail(share) {
  $("detail").hidden = false;
  $("detailTitle").textContent = share.title;
  $("detailContent").replaceChildren();
  const promptCard = el("article", "result-card");
  const promptBody = el("div", "result-body");
  promptBody.append(el("div", "eyebrow", "PROMPT"));
  promptBody.append(el("pre", "", share.prompt));
  if (share.systemPrompt) {
    promptBody.append(el("div", "eyebrow", "SYSTEM PROMPT"));
    promptBody.append(el("pre", "", share.systemPrompt));
  }
  promptCard.append(promptBody);
  $("detailContent").append(promptCard);
  for (const item of share.outputs) {
    const card = el("article", "result-card");
    const head = el("div", "result-head");
    const identity = el("div");
    identity.append(el("div", "result-model", item.model));
    identity.append(el("div", "result-meta", (item.provider || "API") + (item.durationMs ? " · " + item.durationMs + " ms" : "")));
    head.append(identity, el("span", "result-state", item.rating ? item.rating + " / 10" : "社区结果"));
    const body = el("div", "result-body");
    body.append(el("pre", "", item.text));
    card.append(head, body);
    $("detailContent").append(card);
  }
}

async function load() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) {
    try {
      const response = await fetch("./api/shares/" + encodeURIComponent(id));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法加载该分享");
      renderDetail(data.share);
      $("galleryStatus").textContent = "分享详情";
    } catch (error) {
      $("galleryStatus").textContent = error.message;
      $("galleryStatus").className = "status error";
    }
    return;
  }
  try {
    const response = await fetch("./api/shares?limit=40");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "公开结果服务暂不可用");
    $("shareGallery").replaceChildren();
    if (!data.shares.length) {
      $("shareGallery").append(el("div", "empty-state", "暂时还没有公开评测。你可以运行第一次实验并主动分享结果。"));
    } else {
      for (const share of data.shares) $("shareGallery").append(renderShareCard(share));
    }
    $("galleryStatus").textContent = data.shares.length + " 条公开结果";
    $("galleryStatus").className = "status success";
  } catch (error) {
    $("galleryStatus").textContent = error.message + "（需要部署 Pages Functions 并配置 D1）";
    $("galleryStatus").className = "status error";
  }
}
load();
