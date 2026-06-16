const state = { stories: [], selected: null, facebookPosts: [], competitors: [] };

const fields = [
  "storyId",
  "title",
  "category",
  "image",
  "facebook_text",
  "website_text",
  "ai_assistant_notes"
].reduce((acc, id) => ({ ...acc, [id]: document.getElementById(id) }), {});

const shortUrl = document.getElementById("shortUrl");
const fbCopy = document.getElementById("fbCopy");
const commentCopy = document.getElementById("commentCopy");
const table = document.getElementById("storiesTable");
const websiteOptimizer = {
  seoTitle: document.getElementById("seoTitle"),
  seoDescription: document.getElementById("seoDescription"),
  relatedRecommendations: document.getElementById("relatedRecommendations"),
  lengthScore: document.getElementById("lengthScore"),
  lengthHint: document.getElementById("lengthHint")
};
const facebookStatus = document.getElementById("facebookStatus");
const facebookLiveStatus = document.getElementById("facebookLiveStatus");
const facebookPostsTable = document.getElementById("facebookPostsTable");
const facebookSort = document.getElementById("facebookSort");
const competitorFields = {
  name: document.getElementById("competitorName"),
  url: document.getElementById("competitorUrl"),
  category: document.getElementById("competitorCategory"),
  followers: document.getElementById("competitorFollowers"),
  notes: document.getElementById("competitorNotes")
};
const competitorOutputs = {
  list: document.getElementById("competitorsList"),
  stats: document.getElementById("competitorStats"),
  topics: document.getElementById("competitorTopics"),
  emotions: document.getElementById("competitorEmotions"),
  images: document.getElementById("competitorImages"),
  headlines: document.getElementById("competitorHeadlines"),
  recommendations: document.getElementById("competitorRecommendations")
};

async function loadStories() {
  const response = await fetch("/api/stories");
  state.stories = await response.json();
  renderTable();
  if (!state.selected && state.stories[0]) selectStory(state.stories[0].id);
}

async function loadCompetitorAnalysis() {
  const response = await fetch("/api/competitor-analysis");
  const analysis = await response.json();
  state.competitors = analysis.competitors || [];
  renderCompetitorAnalysis(analysis);
}

function emptyForm() {
  state.selected = null;
  fields.storyId.value = "";
  fields.title.value = "";
  fields.category.value = "Семья";
  fields.image.value = "/assets/default-story-cover.png";
  fields.facebook_text.value = "";
  fields.website_text.value = "";
  fields.ai_assistant_notes.value = "";
  shortUrl.value = "";
  fbCopy.value = "";
  commentCopy.value = "";
  Object.values(websiteOptimizer).forEach((field) => {
    field.value = "";
  });
  renderTable();
}

function fillEditor(story) {
  fields.storyId.value = story.id || "";
  fields.title.value = story.title || "";
  fields.category.value = story.category || "Семья";
  fields.image.value = story.image || "/assets/default-story-cover.png";
  fields.facebook_text.value = story.facebook_text || "";
  fields.website_text.value = story.website_text || "";
  fields.ai_assistant_notes.value = story.ai_assistant_notes || "";
  shortUrl.value = story.short_url || "";
  fbCopy.value = story.facebook_text || "";
  commentCopy.value = story.comment_text || "";
  websiteOptimizer.seoTitle.value = story.seo_title || "";
  websiteOptimizer.seoDescription.value = story.seo_description || "";
  websiteOptimizer.relatedRecommendations.value = "";
  websiteOptimizer.lengthScore.value = "";
  websiteOptimizer.lengthHint.value = "";
}

function selectStory(id) {
  const story = state.stories.find((item) => item.id === id);
  if (!story) return;
  state.selected = story;
  fillEditor(story);
  renderTable();
}

function renderTable() {
  if (!state.stories.length) {
    table.innerHTML = "<p class='empty-table'>Пока нет историй.</p>";
    return;
  }
  table.innerHTML = state.stories.map((story) => `
    <button class="story-row ${state.selected?.id === story.id ? "active" : ""}" type="button" data-id="${story.id}">
      <span>
        <strong>${escapeHtml(story.title)}</strong>
        <small>${escapeHtml(story.category)} · ${story.status === "published" ? "опубликована" : "черновик"}</small>
      </span>
      <span class="metrics">${Number(story.views || 0)} просмотров · ${Number(story.clicks || 0)} кликов</span>
    </button>
  `).join("");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function saveStory(status) {
  const payload = {
    id: fields.storyId.value,
    title: fields.title.value,
    category: fields.category.value,
    image: fields.image.value,
    facebook_text: fields.facebook_text.value,
    website_text: fields.website_text.value,
    ai_assistant_notes: fields.ai_assistant_notes.value,
    status
  };
  const response = await fetch("/api/stories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    alert(result.error || "Не удалось сохранить историю.");
    return;
  }
  await loadStories();
  selectStory(result.id);
}

async function generateStory(event) {
  event.preventDefault();
  const button = document.getElementById("generateStoryBtn");
  button.disabled = true;
  button.textContent = "Создаю...";
  const response = await fetch("/api/ai/story-writer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topic: document.getElementById("writerTopic").value,
      category: document.getElementById("writerCategory").value,
      emotion: document.getElementById("writerEmotion").value,
      length: document.getElementById("writerLength").value
    })
  });
  const result = await response.json();
  fillEditor(result);
  state.selected = null;
  renderTable();
  button.disabled = false;
  button.textContent = "Создать историю";
}

async function rewriteHuman(event) {
  event.preventDefault();
  const input = document.getElementById("rewriteInput");
  const output = document.getElementById("rewriteOutput");
  const button = document.getElementById("rewriteBtn");
  if (!input.value.trim()) {
    alert("Вставьте текст или идею для улучшения.");
    return;
  }
  button.disabled = true;
  button.textContent = "Переписываю...";
  const response = await fetch("/api/ai/human-rewriter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: input.value })
  });
  const result = await response.json();
  output.value = result.rewritten_text || "";
  button.disabled = false;
  button.textContent = "Переписать по-человечески";
}

async function createImagePrompt(event) {
  event.preventDefault();
  const button = document.getElementById("createImagePromptBtn");
  const output = document.getElementById("imagePrompt");
  button.disabled = true;
  button.textContent = "Создаю промпт...";
  const response = await fetch("/api/ai/image-creator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: fields.title.value,
      facebook_text: fields.facebook_text.value,
      website_text: fields.website_text.value,
      emotion: document.getElementById("imageEmotion").value,
      age: document.getElementById("imageAge").value,
      place: document.getElementById("imagePlace").value,
      conflict: document.getElementById("imageConflict").value
    })
  });
  const result = await response.json();
  output.value = result.prompt || "";
  fields.ai_assistant_notes.value = [
    fields.ai_assistant_notes.value,
    result.analysis ? `Image Creator: эмоция "${result.analysis.emotion}", место "${result.analysis.place}", конфликт "${result.analysis.conflict}".` : ""
  ].filter(Boolean).join("\n");
  button.disabled = false;
  button.textContent = "Создать промпт для изображения";
}

function saveGeneratedImageUrl() {
  const url = document.getElementById("generatedImageUrl").value.trim();
  if (!url) {
    alert("Вставьте ссылку на готовую картинку.");
    return;
  }
  fields.image.value = url;
  fields.ai_assistant_notes.value = [
    fields.ai_assistant_notes.value,
    `Image Creator: изображение для истории сохранено как ${url}.`
  ].filter(Boolean).join("\n");
}

async function optimizeWebsiteStory() {
  const button = document.getElementById("optimizeWebsiteBtn");
  button.disabled = true;
  button.textContent = "Оптимизирую...";
  const response = await fetch("/api/ai/website-story-optimizer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: fields.storyId.value,
      title: fields.title.value,
      category: fields.category.value,
      website_text: fields.website_text.value
    })
  });
  const result = await response.json();
  if (result.title) fields.title.value = result.title;
  if (result.website_text) fields.website_text.value = result.website_text;
  websiteOptimizer.seoTitle.value = result.seo_title || "";
  websiteOptimizer.seoDescription.value = result.seo_description || "";
  websiteOptimizer.relatedRecommendations.value = Array.isArray(result.related_recommendations)
    ? result.related_recommendations.join("\n")
    : "";
  websiteOptimizer.lengthScore.value = result.length_score || "";
  websiteOptimizer.lengthHint.value = result.length_hint || "";
  fields.ai_assistant_notes.value = [
    fields.ai_assistant_notes.value,
    result.notes || "Website Story Optimizer: текст сайта оптимизирован."
  ].filter(Boolean).join("\n");
  button.disabled = false;
  button.textContent = "Оптимизировать текст для сайта";
}

async function optimizeFacebookPost() {
  const button = document.getElementById("optimizeFbPostBtn");
  button.disabled = true;
  button.textContent = "Оптимизирую...";
  const response = await fetch("/api/ai/facebook-post-optimizer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: fields.title.value,
      facebook_text: fields.facebook_text.value,
      website_text: fields.website_text.value
    })
  });
  const result = await response.json();
  if (result.facebook_text) {
    fields.facebook_text.value = result.facebook_text;
    fbCopy.value = result.facebook_text;
  }
  fields.ai_assistant_notes.value = [
    fields.ai_assistant_notes.value,
    result.notes || "Facebook Post Optimizer: пост подготовлен без ссылки."
  ].filter(Boolean).join("\n");
  button.disabled = false;
  button.textContent = "Оптимизировать пост";
}

async function createCommentLink() {
  const button = document.getElementById("createCommentBtn");
  button.disabled = true;
  button.textContent = "Создаю...";
  const response = await fetch("/api/ai/comment-link-creator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ short_url: shortUrl.value })
  });
  const result = await response.json();
  commentCopy.value = result.comment_text || "";
  button.disabled = false;
  button.textContent = "Создать комментарий";
}

async function copyFrom(id) {
  const value = document.getElementById(id).value;
  await navigator.clipboard.writeText(value);
}

function setFacebookStatus(message, ok = false) {
  facebookStatus.textContent = message;
  facebookStatus.classList.toggle("status-ok", ok);
}

function setFacebookLiveStatus(configured, storedPosts = 0) {
  if (!facebookLiveStatus) return;
  facebookLiveStatus.textContent = configured
    ? `🟢 Подключено · постов в базе: ${storedPosts}`
    : `🔴 Не подключено · постов в базе: ${storedPosts}`;
  facebookLiveStatus.classList.toggle("status-ok", Boolean(configured));
}

async function loadFacebookStatus() {
  try {
    const response = await fetch("/api/facebook/status");
    const result = await response.json();
    setFacebookLiveStatus(Boolean(result.configured), Number(result.stored_posts || 0));
  } catch {
    setFacebookLiveStatus(false, state.facebookPosts.length);
  }
}

function sortedFacebookPosts() {
  const key = facebookSort.value || "total_score";
  return [...state.facebookPosts].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0));
}

function renderFacebookPosts() {
  const posts = sortedFacebookPosts();
  if (!posts.length) {
    facebookPostsTable.innerHTML = `<tr><td colspan="9">Посты не загружены или данных пока нет.</td></tr>`;
    return;
  }
  facebookPostsTable.innerHTML = posts.map((post) => `
    <tr>
      <td>${escapeHtml(post.published_at ? new Date(post.published_at).toLocaleDateString("ru-RU") : "")}</td>
      <td>${escapeHtml((post.message || "").slice(0, 180))}${post.message && post.message.length > 180 ? "..." : ""}</td>
      <td>${Number(post.likes_count || 0)}</td>
      <td>${Number(post.comments_count || 0)}</td>
      <td>${Number(post.shares_count || 0)}</td>
      <td>${Number(post.reach_count || 0)}</td>
      <td>${Number(post.link_clicks_count || 0)}</td>
      <td><strong>${Number(post.total_score || 0)}</strong></td>
      <td>${post.permalink_url ? `<a href="${escapeHtml(post.permalink_url)}" target="_blank" rel="noreferrer">Открыть</a>` : ""}</td>
    </tr>
  `).join("");
}

async function checkFacebookConnection() {
  const button = document.getElementById("checkFacebookBtn");
  button.disabled = true;
  button.textContent = "Проверяю...";
  try {
    const response = await fetch("/api/facebook/check");
    const result = await response.json();
    setFacebookStatus(result.message || "Проверка завершена.", Boolean(result.ok));
    await loadFacebookStatus();
  } catch (error) {
    setFacebookStatus(`Ошибка проверки: ${error.message}`);
  }
  button.disabled = false;
  button.textContent = "Проверить подключение Facebook";
}

async function loadFacebookPosts() {
  return runFacebookLoad("loadFacebookPostsBtn", "/api/facebook/posts", "Загружаю...", "Загрузить последние посты");
}

async function refreshFacebookPosts() {
  return runFacebookLoad("refreshFacebookBtn", "/api/facebook/refresh", "Обновляю...", "Обновить данные");
}

async function syncFacebookPosts() {
  return runFacebookLoad("syncFacebookBtn", "/api/facebook/sync", "Синхронизирую...", "Синхронизировать");
}

async function runFacebookLoad(buttonId, endpoint, loadingText, doneText) {
  const button = document.getElementById("loadFacebookPostsBtn");
  const activeButton = document.getElementById(buttonId) || button;
  activeButton.disabled = true;
  activeButton.textContent = loadingText;
  try {
    const response = await fetch(endpoint);
    const result = await response.json();
    setFacebookStatus(result.message || "Загрузка завершена.", Boolean(result.ok));
    state.facebookPosts = result.posts || [];
    renderFacebookPosts();
    await loadFacebookStatus();
  } catch (error) {
    setFacebookStatus(`Ошибка загрузки: ${error.message}`);
    state.facebookPosts = [];
    renderFacebookPosts();
  }
  activeButton.disabled = false;
  activeButton.textContent = doneText;
}

function formatRank(items = []) {
  return items.length
    ? items.map((item, index) => `${index + 1}. ${item.name} — ${item.count}`).join("\n")
    : "Пока нет данных.";
}

function renderCompetitorAnalysis(analysis) {
  competitorOutputs.list.innerHTML = state.competitors.length
    ? state.competitors.map((item) => `
      <div class="competitor-row">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.category)} · ${Number(item.followers_count || 0)} подписчиков</span>
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
      </div>
    `).join("")
    : "<p class='empty-table'>Конкуренты ещё не добавлены.</p>";
  competitorOutputs.stats.value = [
    `Конкурентов: ${analysis.stats?.competitors_count || 0}`,
    `Facebook-страниц: ${analysis.stats?.facebook_pages || 0}`,
    `Сайтов/медиа: ${analysis.stats?.websites || 0}`,
    `Всего подписчиков: ${analysis.stats?.total_followers || 0}`,
    `Среднее подписчиков: ${analysis.stats?.average_followers || 0}`
  ].join("\n");
  competitorOutputs.topics.value = formatRank(analysis.popular_topics);
  competitorOutputs.emotions.value = formatRank(analysis.popular_emotions);
  competitorOutputs.images.value = formatRank(analysis.best_images);
  competitorOutputs.headlines.value = [
    formatRank(analysis.best_headlines),
    "",
    "Структура:",
    ...(analysis.story_structure || [])
  ].join("\n");
  competitorOutputs.recommendations.value = (analysis.recommendations || []).join("\n");
}

async function addCompetitor(event) {
  event.preventDefault();
  const payload = {
    name: competitorFields.name.value,
    url: competitorFields.url.value,
    category: competitorFields.category.value,
    followers_count: competitorFields.followers.value,
    notes: competitorFields.notes.value
  };
  const response = await fetch("/api/competitors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    alert(result.error || "Не удалось добавить конкурента.");
    return;
  }
  competitorFields.name.value = "";
  competitorFields.url.value = "";
  competitorFields.followers.value = "";
  competitorFields.notes.value = "";
  await loadCompetitorAnalysis();
}

document.getElementById("newStoryBtn").addEventListener("click", emptyForm);
fields.facebook_text.addEventListener("input", () => {
  fbCopy.value = fields.facebook_text.value;
});
document.getElementById("writerForm").addEventListener("submit", generateStory);
document.getElementById("rewriterForm").addEventListener("submit", rewriteHuman);
document.getElementById("imageCreatorForm").addEventListener("submit", createImagePrompt);
document.getElementById("saveImageUrlBtn").addEventListener("click", saveGeneratedImageUrl);
document.getElementById("optimizeWebsiteBtn").addEventListener("click", optimizeWebsiteStory);
document.getElementById("optimizeFbPostBtn").addEventListener("click", optimizeFacebookPost);
document.getElementById("createCommentBtn").addEventListener("click", createCommentLink);
document.getElementById("checkFacebookBtn").addEventListener("click", checkFacebookConnection);
document.getElementById("loadFacebookPostsBtn").addEventListener("click", loadFacebookPosts);
document.getElementById("refreshFacebookBtn").addEventListener("click", refreshFacebookPosts);
document.getElementById("syncFacebookBtn").addEventListener("click", syncFacebookPosts);
facebookSort.addEventListener("change", renderFacebookPosts);
document.getElementById("competitorForm").addEventListener("submit", addCompetitor);
document.getElementById("refreshCompetitorAnalysisBtn").addEventListener("click", loadCompetitorAnalysis);
document.querySelectorAll("[data-status]").forEach((button) => {
  button.addEventListener("click", () => saveStory(button.dataset.status));
});
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    await copyFrom(button.dataset.copy);
    const original = button.textContent;
    button.textContent = "Скопировано";
    setTimeout(() => {
      button.textContent = original;
    }, 1200);
  });
});
table.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (row) selectStory(row.dataset.id);
});

loadStories();
loadFacebookStatus();
loadCompetitorAnalysis();
