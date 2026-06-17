const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "stories.json");
const FACEBOOK_POSTS_FILE = path.join(ROOT, "data", "facebook_posts.json");
const COMPETITORS_FILE = path.join(ROOT, "data", "competitors.json");
const PROJECT_BRAIN_FILE = path.join(ROOT, "data", "project_brain.json");
const FACEBOOK_CONNECTION_FILE = path.join(ROOT, "data", "facebook_connection.local.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const ENV_FILE = path.join(ROOT, ".env");
const FACEBOOK_CONNECTION_COOKIE = "astp_fb_conn";
const FACEBOOK_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const FACEBOOK_GRAPH_VERSION = "v20.0";
const facebookReadPermissions = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights"
];
const facebookFeedFields = [
  "id",
  "message",
  "created_time",
  "permalink_url",
  "reactions.summary(true)",
  "comments.summary(true)",
  "attachments{media_type,url}"
].join(",");
const facebookPostFieldProfiles = [
  {
    name: "content_basic",
    fields: ["id", "message", "created_time", "permalink_url"].join(",")
  },
  {
    name: "basic",
    fields: ["id", "created_time", "permalink_url"].join(",")
  },
  {
    name: "minimal",
    fields: ["id", "created_time"].join(",")
  },
  {
    name: "default",
    fields: ""
  }
];
const facebookLegacyPostsFields = [
  "id",
  "message",
  "created_time",
  "permalink_url",
  "full_picture",
  "shares",
  "likes.summary(true).limit(0)",
  "comments.summary(true).limit(0)"
].join(",");
const facebookPostEndpointOrder = ["published_posts", "posts"];

function loadLocalEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) continue;
    const [key, ...valueParts] = clean.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadLocalEnv();

const categories = [
  "Семья",
  "Любовь",
  "Измена",
  "Дети",
  "Свекровь",
  "Наследство",
  "Судьба",
  "Жизненные истории"
];

const storyStatuses = new Set(["draft", "review", "approved", "scheduled", "published", "rejected"]);

function normalizeStoryStatus(status, fallback = "draft") {
  return storyStatuses.has(status) ? status : fallback;
}

const writerThemes = [
  "семья",
  "любовь",
  "измена",
  "дети",
  "свекровь",
  "наследство",
  "бедность",
  "богатство",
  "судьба",
  "одиночество",
  "отношения родителей и детей"
];

function readStories() {
  return storageCache.stories;
}

function writeStories(stories) {
  storageCache.stories = stories;
  writeJsonBackup(DATA_FILE, stories);
  persistStories(stories);
}

function readFacebookPosts() {
  return storageCache.facebookPosts;
}

function writeFacebookPosts(posts) {
  storageCache.facebookPosts = posts;
  writeJsonBackup(FACEBOOK_POSTS_FILE, posts);
  persistFacebookPosts(posts);
}

function readCompetitors() {
  return storageCache.competitors;
}

function writeCompetitors(competitors) {
  storageCache.competitors = competitors;
  writeJsonBackup(COMPETITORS_FILE, competitors);
  persistCompetitors(competitors);
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonObject(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonBackup(filePath, data) {
  if (process.env.VERCEL) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn(`Local JSON backup write skipped: ${error.message}`);
  }
}

const storageCache = {
  stories: readJsonArray(DATA_FILE),
  facebookPosts: readJsonArray(FACEBOOK_POSTS_FILE),
  competitors: readJsonArray(COMPETITORS_FILE),
  projectBrain: fs.existsSync(PROJECT_BRAIN_FILE)
    ? JSON.parse(fs.readFileSync(PROJECT_BRAIN_FILE, "utf8"))
    : {
        best_topics: [],
        best_images: [],
        best_times: [],
        best_titles: [],
        best_emotions: [],
        best_publications: [],
        best_ctr: [],
        best_lengths: [],
        best_story_formats: [],
        successful_stories: [],
        unsuccessful_stories: [],
        audience_analytics: {},
        competitor_analytics: {},
        internet_research: {},
        publication_statistics: {},
        data_quality: {},
        work_history: [],
        autopilot_runs: [],
        recommendations: [],
        updated_at: null
      },
  facebookConnection: readJsonObject(FACEBOOK_CONNECTION_FILE, {})
};

let pgPool = null;
let storageMode = "json";

function pgColumnDate(value, fallback = new Date().toISOString()) {
  return value || fallback;
}

async function initializeStorage() {
  if (!process.env.DATABASE_URL) {
    console.log("Storage: JSON backup mode. Set DATABASE_URL to use PostgreSQL.");
    return;
  }
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
    await pgPool.query("select 1");
    storageMode = "postgres";
    storageCache.stories = (await pgPool.query("select * from stories order by created_at desc")).rows;
    storageCache.facebookPosts = (await pgPool.query("select * from facebook_posts order by total_score desc, published_at desc")).rows;
    storageCache.competitors = (await pgPool.query("select * from competitors order by created_at desc")).rows.map((row) => ({
      ...row,
      followers_count: row.followers_count || 0,
      category: row.category || "Facebook-страница"
    }));
    const brain = (await pgPool.query("select * from project_brain where id = 'main'")).rows[0];
    if (brain) {
      storageCache.projectBrain = {
        best_topics: brain.best_topics || [],
        best_images: brain.best_images || [],
        best_times: brain.best_times || [],
        best_titles: brain.best_titles || [],
        best_emotions: brain.best_emotions || [],
        best_publications: brain.best_publications || [],
        best_ctr: brain.best_ctr || [],
        best_lengths: brain.best_lengths || [],
        best_story_formats: brain.best_story_formats || [],
        successful_stories: brain.successful_stories || [],
        unsuccessful_stories: brain.unsuccessful_stories || [],
        audience_analytics: brain.audience_analytics || {},
        competitor_analytics: brain.competitor_analytics || {},
        internet_research: brain.internet_research || {},
        publication_statistics: brain.publication_statistics || {},
        data_quality: brain.data_quality || {},
        work_history: brain.work_history || [],
        autopilot_runs: brain.autopilot_runs || [],
        recommendations: brain.recommendations || [],
        updated_at: brain.updated_at
      };
    }
    const facebookConnection = (await pgPool.query("select connection from facebook_connection where id = 'main'")).rows[0];
    if (facebookConnection?.connection) {
      storageCache.facebookConnection = facebookConnection.connection;
    }
    console.log("Storage: PostgreSQL mode.");
  } catch (error) {
    pgPool = null;
    storageMode = "json";
    console.warn(`Storage: PostgreSQL unavailable, using JSON backup mode. ${error.message}`);
  }
}

async function persistStories(stories) {
  if (!pgPool) return;
  try {
    for (const story of stories) {
      await pgPool.query(
        `insert into stories (
          id, title, slug, short_code, category, image, facebook_text, website_text, comment_text,
          status, views, clicks, ai_assistant_notes, seo_title, seo_description, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        on conflict (id) do update set
          title = excluded.title,
          slug = excluded.slug,
          short_code = excluded.short_code,
          category = excluded.category,
          image = excluded.image,
          facebook_text = excluded.facebook_text,
          website_text = excluded.website_text,
          comment_text = excluded.comment_text,
          status = excluded.status,
          views = excluded.views,
          clicks = excluded.clicks,
          ai_assistant_notes = excluded.ai_assistant_notes,
          seo_title = excluded.seo_title,
          seo_description = excluded.seo_description,
          updated_at = excluded.updated_at`,
        [
          story.id,
          story.title,
          story.slug,
          story.short_code || null,
          story.category,
          story.image,
          story.facebook_text,
          story.website_text,
          story.comment_text,
          story.status,
          Number(story.views || 0),
          Number(story.clicks || 0),
          story.ai_assistant_notes || "",
          story.seo_title || "",
          story.seo_description || "",
          pgColumnDate(story.created_at),
          pgColumnDate(story.updated_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL story persist failed: ${error.message}`);
  }
}

async function persistFacebookPosts(posts) {
  if (!pgPool) return;
  try {
    for (const post of posts) {
      await pgPool.query(
        `insert into facebook_posts (
          id, facebook_post_id, message, permalink_url, published_at, likes_count, comments_count,
          shares_count, reach_count, link_clicks_count, total_score, image_url, detected_topic,
          detected_emotion, image_analysis, text_length, paragraphs_count, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        on conflict (facebook_post_id) do update set
          message = excluded.message,
          permalink_url = excluded.permalink_url,
          published_at = excluded.published_at,
          likes_count = excluded.likes_count,
          comments_count = excluded.comments_count,
          shares_count = excluded.shares_count,
          reach_count = excluded.reach_count,
          link_clicks_count = excluded.link_clicks_count,
          total_score = excluded.total_score,
          image_url = excluded.image_url,
          detected_topic = excluded.detected_topic,
          detected_emotion = excluded.detected_emotion,
          image_analysis = excluded.image_analysis,
          text_length = excluded.text_length,
          paragraphs_count = excluded.paragraphs_count,
          updated_at = excluded.updated_at`,
        [
          post.id,
          post.facebook_post_id,
          post.message || "",
          post.permalink_url || "",
          post.published_at || post.created_time || null,
          Number(post.likes_count || 0),
          Number(post.comments_count || 0),
          Number(post.shares_count || 0),
          Number(post.reach_count || 0),
          Number(post.link_clicks_count || 0),
          Number(post.total_score || 0),
          post.image_url || "",
          post.detected_topic || "",
          post.detected_emotion || "",
          JSON.stringify(post.image_analysis || {}),
          Number(post.text_length || 0),
          Number(post.paragraphs_count || 0),
          pgColumnDate(post.created_at),
          pgColumnDate(post.updated_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL facebook_posts persist failed: ${error.message}`);
  }
}

async function persistCompetitors(competitors) {
  if (!pgPool) return;
  try {
    for (const competitor of competitors) {
      const analysis = competitorSignals(competitor);
      await pgPool.query(
        `insert into competitors (
          id, name, url, category, followers_count, average_likes, average_comments, average_shares,
          popular_topics, popular_image_types, posting_frequency, notes, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (id) do update set
          name = excluded.name,
          url = excluded.url,
          category = excluded.category,
          followers_count = excluded.followers_count,
          popular_topics = excluded.popular_topics,
          popular_image_types = excluded.popular_image_types,
          posting_frequency = excluded.posting_frequency,
          notes = excluded.notes,
          updated_at = excluded.updated_at`,
        [
          competitor.id,
          competitor.name,
          competitor.url,
          competitor.category || "Facebook-страница",
          Number(competitor.followers_count || 0),
          Number(competitor.average_likes || 0),
          Number(competitor.average_comments || 0),
          Number(competitor.average_shares || 0),
          JSON.stringify([analysis.topic]),
          JSON.stringify([analysis.imageStyle]),
          analysis.frequencyHint,
          competitor.notes || "",
          pgColumnDate(competitor.added_at || competitor.created_at),
          pgColumnDate(competitor.updated_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL competitors persist failed: ${error.message}`);
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(text) {
  const translit = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };
  return String(text || "story")
    .toLowerCase()
    .split("")
    .map((char) => translit[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "story";
}

function uniqueSlug(title, stories, currentId) {
  const base = slugify(title);
  let slug = base;
  let counter = 2;
  while (stories.some((story) => story.slug === slug && story.id !== currentId)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

function shortCode() {
  return crypto.randomBytes(4).toString("base64url").slice(0, 6);
}

function absoluteUrl(req, pathname) {
  const host = req.headers.host || `localhost:${PORT}`;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}${pathname}`;
}

function parseCookies(req) {
  return Object.fromEntries(String(req?.headers?.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

function facebookCookieKey() {
  return crypto.createHash("sha256").update(String(process.env.META_APP_SECRET || "local-facebook-cookie-key")).digest();
}

function encryptFacebookConnection(connection) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", facebookCookieKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(connection || {}), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptFacebookConnection(value) {
  try {
    const buffer = Buffer.from(String(value || ""), "base64url");
    if (buffer.length < 29) return {};
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", facebookCookieKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  } catch {
    return {};
  }
}

function setFacebookConnectionCookie(res, connection, req) {
  const host = req?.headers?.host || "";
  const secure = !host.includes("localhost") && !host.startsWith("127.0.0.1");
  const value = encryptFacebookConnection(connection);
  res.setHeader("Set-Cookie", `${FACEBOOK_CONNECTION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${FACEBOOK_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
}

function safeMetaError(error) {
  return String(error?.message || error || "Meta API error")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/EA[A-Za-z0-9_-]{20,}/g, "[redacted_token]");
}

function facebookLog(endpoint, details = {}) {
  const safeDetails = Object.fromEntries(Object.entries(details).map(([key, value]) => {
    if (/token/i.test(key)) return [key, Boolean(value)];
    if (typeof value === "string") return [key, safeMetaError(value)];
    return [key, value];
  }));
  console.log(`[facebook] ${endpoint} ${JSON.stringify(safeDetails)}`);
}

function metaEndpoint(pathname, params = {}) {
  const safeParams = new URLSearchParams(params);
  safeParams.delete("access_token");
  const query = safeParams.toString();
  return `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}${pathname}${query ? `?${query}` : ""}`;
}

function safeMetaErrorObject(error) {
  if (!error || typeof error !== "object") return null;
  return JSON.parse(JSON.stringify(error, (key, value) => {
    if (/token/i.test(key)) return "[redacted]";
    return typeof value === "string" ? safeMetaError(value) : value;
  }));
}

function storySummary(story, req) {
  const shortPath = `/s/${story.short_code}`;
  return {
    ...story,
    short_url: absoluteUrl(req, shortPath),
    story_url: absoluteUrl(req, `/story/${story.slug}`),
    comment_text: `Продолжение истории читайте здесь: ${absoluteUrl(req, shortPath)}`
  };
}

function adBlock(label) {
  return `<aside class="ad-slot" aria-label="Рекламный блок"><span>${label}</span><strong>Место для рекламы</strong></aside>`;
}

function layout(title, body, options = {}) {
  const adminClass = options.admin ? " admin-shell" : "";
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="${adminClass}">
  ${body}
  ${options.script ? `<script src="${options.script}"></script>` : ""}
</body>
</html>`;
}

function renderHeader() {
  return `<header class="site-header">
    <a class="brand" href="/">Жизненные истории</a>
    <nav>
      <a href="/">Главная</a>
      <a href="/admin">Админка</a>
      <a href="/facebook-setup-wizard">Facebook Setup</a>
      <a href="/facebook-connect">Facebook Connect</a>
      <a href="/audience-insights">Audience Insights</a>
      <a href="/telegram-center">Telegram Center</a>
      <a href="/ai-autopilot">AI Autopilot</a>
      <a href="/production-status">Production Status</a>
    </nav>
  </header>`;
}

function renderProductionStatus() {
  const audit = securityAudit();
  const data = buildRealDataLayer();
  const fb = facebookConfigStatus();
  const tg = telegramConfigStatus();
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  const checkRow = (name, ok, detail) => `<tr><td>${escapeHtml(name)}</td><td>${ok ? "✅" : "⏳"}</td><td>${escapeHtml(detail)}</td></tr>`;
  return layout("Production Status", `${renderHeader()}
    <main class="insights-page">
      <section class="insights-hero">
        <p class="kicker">Launch Readiness</p>
        <h1>Production Status</h1>
        <p>Честная проверка готовности: секреты не показываются, публикация в Facebook отключена, реальные интеграции отмечены отдельно от демо-данных.</p>
      </section>

      <section class="insight-card">
        <h2>System Status</h2>
        <div class="autopilot-status-grid">
          <article><span>Database</span><strong>${pgPool ? "PostgreSQL" : "JSON backup mode"}</strong><p>${pgPool ? "DATABASE_URL активен." : "Для продакшена нужен DATABASE_URL."}</p></article>
          <article><span>Facebook OAuth</span><strong>${fb.configured ? "ready" : "not ready"}</strong><p>${fb.configured ? "Meta OAuth и Page Token доступны." : `Missing: ${fb.missing.join(", ") || "OAuth connection"}`}</p></article>
          <article><span>Telegram Bot</span><strong>${tg.configured ? "ready" : "not ready"}</strong><p>${tg.configured ? "BOT_TOKEN и CHAT_ID заданы." : "Нужны BOT_TOKEN и CHAT_ID в environment variables."}</p></article>
          <article><span>Project Brain</span><strong>${brain.updated_at ? "active" : "needs refresh"}</strong><p>${brain.updated_at || "Нажмите Refresh Brain в AI Autopilot."}</p></article>
        </div>
      </section>

      <section class="insight-card">
        <h2>Security Audit</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>
              ${checkRow(".env protected", audit.checks.env_is_gitignored, ".env and .env.* are ignored; .env.example is allowed.")}
              ${checkRow("No secret output", true, "This page never prints token values.")}
              ${checkRow("Facebook local token file ignored", audit.checks.facebook_connection_file_gitignored, "data/facebook_connection.local.json must not be committed.")}
              ${checkRow("Autopublish disabled", !audit.checks.autopublish_enabled, "Facebook publishing requires explicit future approval flow.")}
              ${checkRow("Read-only Facebook mode", !audit.checks.facebook_write_permissions_requested, "No delete/admin/billing/write actions are implemented.")}
            </tbody>
          </table>
        </div>
        ${audit.warnings.length ? `<p class="connect-alert">${escapeHtml(audit.warnings.join(" "))}</p>` : `<p class="connect-ok">No critical local security warnings.</p>`}
      </section>

      <section class="insight-card">
        <h2>Real Data Layer</h2>
        <p><strong>${escapeHtml(data.notice)}</strong></p>
        <div class="autopilot-status-grid">
          ${Object.values(data.sources).map((source) => `<article><span>${escapeHtml(source.label)}</span><strong>${escapeHtml(source.status)}</strong><p>${escapeHtml(source.message)}</p></article>`).join("")}
        </div>
      </section>
    </main>`);
}

function renderFacebookConnect(url, req) {
  const config = facebookConfigStatus(req);
  const connection = readFacebookConnection(req);
  const selectedPage = config.page_name || config.page_id || "not selected";
  const error = url.searchParams.get("error");
  const connected = url.searchParams.get("connected");
  const pendingPages = connection.pending_pages || [];
  const posts = readFacebookPosts().slice(0, 10);
  return layout("Facebook Connect", `${renderHeader()}
    <main class="connect-page">
      <section class="connect-hero">
        <p class="kicker">Official Meta OAuth</p>
        <h1>Facebook Connect</h1>
        <p>Подключение страницы через официальный Facebook Login. Пароль, реальные токены и ключи не вводятся в чат и не добавляются в код.</p>
      </section>

      <section class="connect-panel">
        <div class="connect-status ${config.configured ? "is-connected" : ""}">
          <strong>${config.configured ? "🟢 Подключено" : "🔴 Не подключено"}</strong>
          <span>Page: ${escapeHtml(selectedPage)}</span>
          <span>OAuth: ${config.oauth_connected ? "active" : "not connected"}</span>
          <span>Posts stored: ${readFacebookPosts().length}</span>
        </div>
        ${error ? `<p class="connect-alert">Ошибка подключения: ${escapeHtml(error)}</p>` : ""}
        ${connected ? `<p class="connect-ok">Facebook Page подключена. Теперь можно загрузить публикации и запустить анализ.</p>` : ""}
        <div class="button-row">
          <a class="primary-btn" href="/auth/facebook/start">Connect Facebook</a>
          <button id="fbConnectCheckBtn" class="secondary-btn" type="button">Check Connection</button>
          <button id="fbConnectLoadBtn" class="primary-btn" type="button">Load Page Posts</button>
          <button id="fbConnectDebugBtn" class="secondary-btn" type="button">Debug Load Posts</button>
          <button id="fbConnectAnalyzeBtn" class="secondary-btn" type="button">Analyze Page</button>
        </div>
        <p id="fbConnectMessage" class="helper-text">Read-only mode: система только читает и анализирует данные, публикация отключена.</p>
      </section>

      ${pendingPages.length > 1 ? `<section class="connect-panel">
        <h2>Выберите Facebook Page</h2>
        <div class="page-choice-list">
          ${pendingPages.map((page) => `<button class="secondary-btn" data-page-id="${escapeHtml(page.id)}" type="button">${escapeHtml(page.name)}${page.id === config.page_id ? " · selected" : ""}</button>`).join("")}
        </div>
      </section>` : ""}

      <section class="connect-panel">
        <h2>Последние загруженные публикации</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Дата</th><th>Текст</th><th>Тема</th><th>Эмоция</th><th>Лайки</th><th>Комментарии</th><th>Репосты</th><th>Клики</th><th>Рейтинг</th></tr></thead>
            <tbody id="fbConnectPosts">
              ${posts.length ? posts.map((post) => `<tr>
                <td>${escapeHtml(post.published_at ? new Date(post.published_at).toLocaleDateString("ru-RU") : "")}</td>
                <td>${escapeHtml(shortText(post.message, 140))}</td>
                <td>${escapeHtml(post.detected_topic || detectTopic(post.message || ""))}</td>
                <td>${escapeHtml(post.detected_emotion || detectEmotion(post.message || ""))}</td>
                <td>${Number(post.likes_count || 0)}</td>
                <td>${Number(post.comments_count || 0)}</td>
                <td>${Number(post.shares_count || 0)}</td>
                <td>${Number(post.link_clicks_count || 0)}</td>
                <td><strong>${Number(post.total_score || 0)}</strong></td>
              </tr>`).join("") : `<tr><td colspan="9">Публикации ещё не загружены.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    <script>
      const message = document.getElementById("fbConnectMessage");
      async function runConnectAction(endpoint, label) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        message.textContent = label;
        message.className = "helper-text";
        try {
          const response = await fetch(endpoint, { signal: controller.signal });
          const result = await response.json();
          message.textContent = result.message || result.error || "Done.";
          message.className = result.ok ? "connect-ok" : "connect-alert";
          if (result.ok) setTimeout(() => location.reload(), 700);
        } catch (error) {
          message.textContent = error.name === "AbortError"
            ? "Request timeout. Meta API did not respond in time."
            : "Request failed. Check server logs and reconnect Facebook.";
          message.className = "connect-alert";
        } finally {
          clearTimeout(timeout);
        }
      }
      document.getElementById("fbConnectCheckBtn").addEventListener("click", () => runConnectAction("/api/facebook/check", "Checking connection..."));
      document.getElementById("fbConnectLoadBtn").addEventListener("click", () => runConnectAction("/api/facebook/posts", "Loading Page posts..."));
      document.getElementById("fbConnectDebugBtn").addEventListener("click", () => runConnectAction("/api/facebook/posts-debug-all", "Debugging all Page post endpoints..."));
      document.getElementById("fbConnectAnalyzeBtn").addEventListener("click", () => runConnectAction("/api/facebook/analyze", "Analyzing Page..."));
      document.querySelectorAll("[data-page-id]").forEach((button) => {
        button.addEventListener("click", async () => {
          message.textContent = "Selecting Page...";
          try {
            const response = await fetch("/api/facebook/select-page", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ page_id: button.dataset.pageId })
            });
            const result = await response.json();
            message.textContent = result.message || "Page selected.";
            message.className = result.ok ? "connect-ok" : "connect-alert";
            if (result.ok) setTimeout(() => location.reload(), 500);
          } catch {
            message.textContent = "Could not select Page. Reconnect Facebook and try again.";
            message.className = "connect-alert";
          }
        });
      });
    </script>`);
}

function configuredRedirectUri(req) {
  return process.env.FACEBOOK_REDIRECT_URI || absoluteUrl(req, "/auth/facebook/callback");
}

function metaConfigSummary(req) {
  const config = facebookConfigStatus(req);
  const redirectUri = configuredRedirectUri(req);
  const hasAppConfig = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  return {
    ok: hasAppConfig,
    configured: hasAppConfig,
    redirect_uri: redirectUri,
    message: hasAppConfig
      ? "Meta OAuth config найден. Можно запускать официальный Facebook Login."
      : "Facebook OAuth ещё не настроен. Заполните META_APP_ID и META_APP_SECRET.",
    fields: {
      META_APP_ID: Boolean(process.env.META_APP_ID),
      META_APP_SECRET: Boolean(process.env.META_APP_SECRET),
      FACEBOOK_REDIRECT_URI: Boolean(process.env.FACEBOOK_REDIRECT_URI),
      FACEBOOK_LOGIN_CONFIG_ID: Boolean(process.env.FACEBOOK_LOGIN_CONFIG_ID),
      FACEBOOK_PAGE_ID: config.has_page_id,
      FACEBOOK_PAGE_ACCESS_TOKEN: config.has_page_access_token
    },
    page: {
      connected: config.configured,
      oauth_connected: config.oauth_connected,
      page_id: config.page_id,
      page_name: config.page_name
    }
  };
}

function renderFacebookSetupWizard(req) {
  const meta = metaConfigSummary(req);
  const fieldRow = (name, ready, note) => `<tr><td><code>${name}</code></td><td>${ready ? "✅" : "⏳"}</td><td>${escapeHtml(note)}</td></tr>`;
  return layout("Facebook Setup Wizard", `${renderHeader()}
    <main class="connect-page">
      <section class="connect-hero">
        <p class="kicker">Safe Meta OAuth</p>
        <h1>Facebook Setup Wizard</h1>
        <p>Пошаговое подключение Facebook Page через официальный Meta OAuth. Пароль Facebook не нужен, токены не вводятся в чат, автопубликация отключена.</p>
      </section>

      <section class="connect-panel">
        <h2>1. Что уже готово в проекте</h2>
        <div class="autopilot-status-grid">
          <article><span>Facebook Connect</span><strong>готов</strong><p>Есть официальный OAuth flow и callback.</p></article>
          <article><span>Read-only режим</span><strong>готов</strong><p>Система только читает посты и insights.</p></article>
          <article><span>Real Data Layer</span><strong>готов</strong><p>Данные передаются в Audience Insights, Project Brain и AI Autopilot.</p></article>
          <article><span>Autopublishing</span><strong>off</strong><p>Автоматическая публикация не включена.</p></article>
        </div>
      </section>

      <section class="connect-panel">
        <h2>2. Какие данные нужны</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Переменная</th><th>Статус</th><th>Зачем нужна</th></tr></thead>
            <tbody>
              ${fieldRow("META_APP_ID", meta.fields.META_APP_ID, "ID приложения в Meta Developers.")}
              ${fieldRow("META_APP_SECRET", meta.fields.META_APP_SECRET, "Секрет приложения. Хранить только локально.")}
              ${fieldRow("FACEBOOK_REDIRECT_URI", meta.fields.FACEBOOK_REDIRECT_URI, "Callback URL для OAuth. Можно не указывать, тогда используется локальный адрес.")}
              ${fieldRow("FACEBOOK_LOGIN_CONFIG_ID", meta.fields.FACEBOOK_LOGIN_CONFIG_ID, "Configuration ID из Facebook Login for Business. Нужен для Page permissions.")}
              ${fieldRow("FACEBOOK_PAGE_ID", meta.fields.FACEBOOK_PAGE_ID, "Page ID появится после OAuth или может быть указан вручную.")}
              ${fieldRow("FACEBOOK_PAGE_ACCESS_TOKEN", meta.fields.FACEBOOK_PAGE_ACCESS_TOKEN, "Page Access Token появится после OAuth или может быть указан вручную.")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="connect-panel">
        <h2>3. Где взять данные в Meta Developers</h2>
        <ol class="setup-steps">
          <li>Откройте <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Meta Developers Apps</a>.</li>
          <li>Создайте приложение или откройте существующее.</li>
          <li>Скопируйте <code>App ID</code> в <code>META_APP_ID</code>.</li>
          <li>Скопируйте <code>App Secret</code> в <code>META_APP_SECRET</code>. Не отправляйте его в чат.</li>
          <li>Добавьте сценарий <strong>Manage everything on your Page</strong>. Это Pages API use case для доступа к Facebook Page.</li>
          <li>Внутри этого сценария настройте <strong>Facebook Login for Business</strong> и создайте configuration с <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>read_insights</code>.</li>
          <li>Скопируйте <code>Configuration ID</code> в <code>FACEBOOK_LOGIN_CONFIG_ID</code>. Это нужно, чтобы Page permissions не падали с <code>Invalid Scopes</code>.</li>
          <li>В Facebook Login / OAuth settings добавьте Valid OAuth Redirect URI.</li>
          <li>После этого вернитесь сюда и нажмите <strong>Connect Facebook</strong>.</li>
        </ol>
      </section>

      <section class="connect-panel">
        <h2>4. Redirect URI для локального проекта</h2>
        <p>Используйте этот адрес в Meta App settings:</p>
        <input class="readonly-line" value="${escapeHtml(meta.redirect_uri)}" readonly>
        <p class="helper-text">Для локального проекта обычно нужен: <code>http://127.0.0.1:4173/auth/facebook/callback</code></p>
      </section>

      <section class="connect-panel">
        <h2>5. Что добавить в .env</h2>
        <pre class="env-example"><code>META_APP_ID=ваш_app_id
META_APP_SECRET=ваш_app_secret
FACEBOOK_REDIRECT_URI=http://127.0.0.1:4173/auth/facebook/callback

# Эти поля система может получить после OAuth:
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=</code></pre>
        <p class="connect-alert">Никогда не отправляйте настоящий <code>.env</code> в чат. В нём могут быть секреты и токены доступа.</p>
      </section>

      <section class="connect-panel">
        <h2>6. Проверка и подключение</h2>
        <div class="connect-status ${meta.ok ? "is-connected" : ""}">
          <strong>${meta.ok ? "✅ Meta config ready" : "🔴 Meta config missing"}</strong>
          <span>Redirect URI: ${escapeHtml(meta.redirect_uri)}</span>
          <span>Page: ${escapeHtml(meta.page.page_name || meta.page.page_id || "not connected")}</span>
          <span>Mode: read-only</span>
        </div>
        <div class="button-row">
          <button id="checkMetaConfigBtn" class="secondary-btn" type="button">Check Meta Config</button>
          <button id="testOAuthRedirectBtn" class="secondary-btn" type="button">Test OAuth Redirect</button>
          <a class="primary-btn" href="/auth/facebook/start">Connect Facebook</a>
          <button id="wizardLoadPostsBtn" class="primary-btn" type="button">Load Page Posts</button>
        </div>
        <p id="wizardMessage" class="helper-text">${escapeHtml(meta.message)}</p>
      </section>
    </main>
    <script>
      const wizardMessage = document.getElementById("wizardMessage");
      async function wizardAction(endpoint, label) {
        wizardMessage.textContent = label;
        const response = await fetch(endpoint);
        const result = await response.json();
        wizardMessage.textContent = result.message || "Done.";
      }
      document.getElementById("checkMetaConfigBtn").addEventListener("click", () => wizardAction("/api/facebook/meta-config", "Checking Meta config..."));
      document.getElementById("testOAuthRedirectBtn").addEventListener("click", () => wizardAction("/api/facebook/test-redirect", "Testing OAuth redirect..."));
      document.getElementById("wizardLoadPostsBtn").addEventListener("click", () => wizardAction("/api/facebook/posts", "Loading Page posts..."));
    </script>`);
}

function renderTelegramCenter() {
  const status = telegramConfigStatus();
  return layout("Telegram Center", `${renderHeader()}
    <main class="connect-page">
      <section class="connect-hero">
        <p class="kicker">Telegram Control Center</p>
        <h1>Telegram Center</h1>
        <p>Личный центр управления ИИ-помощниками с телефона. Сейчас он работает только после добавления <code>BOT_TOKEN</code> и <code>CHAT_ID</code> в локальный <code>.env</code> или переменные окружения хостинга.</p>
      </section>
      <section class="connect-panel">
        <div class="connect-status ${status.configured ? "is-connected" : ""}">
          <strong>${status.configured ? "🟢 Подключено" : "🔴 Не подключено"}</strong>
          <span>BOT_TOKEN: ${status.has_bot_token ? "есть" : "не указан"}</span>
          <span>CHAT_ID: ${status.has_chat_id ? "есть" : "не указан"}</span>
          <span>Публикация: отключена</span>
        </div>
        <h2>Команды</h2>
        <div class="category-list">
          <a>/start</a>
          <a>/status</a>
          <a>/stats</a>
          <a>/drafts</a>
          <a>/approve</a>
          <a>/reject</a>
          <a>/help</a>
          <a>/stories</a>
          <a>/images</a>
          <a>/audience</a>
          <a>/competitors</a>
          <a>/autopilot</a>
          <a>/settings</a>
        </div>
        <p class="helper-text">Реальные Telegram-токены нельзя отправлять в чат. Храните их только локально в <code>.env</code>.</p>
      </section>
    </main>`);
}

function renderHome() {
  const stories = readStories().filter((story) => story.status === "published");
  const newest = [...stories].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const popular = [...stories].sort((a, b) => (b.views + b.clicks) - (a.views + a.clicks));
  const cards = (items) => items.map((story) => `<article class="story-card">
    <a href="/story/${story.slug}">
      <img src="${escapeHtml(story.image || "/assets/default-story-cover.png")}" alt="">
      <span>${escapeHtml(story.category)}</span>
      <h3>${escapeHtml(story.title)}</h3>
      <p>${escapeHtml(story.facebook_text.slice(0, 150))}...</p>
    </a>
  </article>`).join("");

  return layout("Жизненные истории", `${renderHeader()}
    <main>
      <section class="hero">
        <div>
          <p class="kicker">Истории, которые хочется дочитать</p>
          <h1>Продолжения жизненных историй</h1>
          <p>Семья, любовь, выбор, ошибки и неожиданные повороты судьбы. Крупный текст, спокойный дизайн и удобное чтение с телефона.</p>
        </div>
      </section>

      <section class="content-band">
        <div class="section-title">
          <h2>Новые истории</h2>
          <a href="/admin">Добавить историю</a>
        </div>
        <div class="story-grid">${cards(newest)}</div>
      </section>

      <section class="content-band muted">
        <div class="section-title">
          <h2>Популярные истории</h2>
        </div>
        <div class="story-grid">${cards(popular)}</div>
      </section>

      <section class="content-band">
        <h2>Категории</h2>
        <div class="category-list">${categories.map((cat) => `<a href="/?category=${encodeURIComponent(cat)}">${escapeHtml(cat)}</a>`).join("")}</div>
      </section>
    </main>
    <footer class="footer">AI Story Traffic Platform MVP</footer>`);
}

function renderStory(req, story) {
  const stories = readStories();
  const published = stories.filter((item) => item.status === "published" && item.id !== story.id);
  const related = published
    .filter((item) => item.category === story.category)
    .concat(published.filter((item) => item.category !== story.category))
    .slice(0, 3);
  const next = published[0] || story;
  const paragraphs = story.website_text.split(/\n+/).filter(Boolean);
  const midpoint = Math.max(1, Math.floor(paragraphs.length / 2));
  const body = paragraphs.map((paragraph, index) => {
    const html = `<p>${escapeHtml(paragraph)}</p>`;
    return index === midpoint ? `${adBlock("Внутри текста")}${html}` : html;
  }).join("");

  story.views = Number(story.views || 0) + 1;
  story.updated_at = new Date().toISOString();
  writeStories(stories.map((item) => item.id === story.id ? story : item));

  return layout(story.title, `${renderHeader()}
    <main class="reader">
      ${adBlock("Верх страницы")}
      <article class="story-page">
        <p class="kicker">${escapeHtml(story.category)}</p>
        <h1>${escapeHtml(story.title)}</h1>
        <img class="story-hero" src="${escapeHtml(story.image || "/assets/default-story-cover.png")}" alt="">
        <div class="story-text">${body}</div>
      </article>
      ${adBlock("После текста")}
      <section class="related">
        <div class="section-title">
          <h2>Похожие истории</h2>
          <a href="/">Все истории</a>
        </div>
        <div class="story-grid">${related.map((item) => `<article class="story-card">
          <a href="/story/${item.slug}">
            <img src="${escapeHtml(item.image || "/assets/default-story-cover.png")}" alt="">
            <span>${escapeHtml(item.category)}</span>
            <h3>${escapeHtml(item.title)}</h3>
          </a>
        </article>`).join("")}</div>
      </section>
      <a class="read-more-button" href="/story/${next.slug}">Читать ещё</a>
      <a class="next-button" href="/story/${next.slug}">Следующая история</a>
    </main>`);
}

function renderAdmin() {
  return layout("Админка историй", `${renderHeader()}
    <main class="admin-main">
      <section class="admin-top">
        <div>
          <p class="kicker">AI Story Traffic Platform</p>
          <h1>Админ-панель историй</h1>
        </div>
        <button id="newStoryBtn" class="primary-btn" type="button">Новая история</button>
      </section>

      <section class="ai-panel">
        <div class="ai-panel-head">
          <div>
            <p class="kicker">Story Writer + Human Rewriter</p>
            <h2>ИИ-помощники</h2>
          </div>
          <p>Локальный MVP-режим: помощники создают оригинальные заготовки и переписывают текст без копирования чужих историй. Позже сюда подключается настоящий AI API.</p>
        </div>
        <div class="ai-grid">
          <form id="writerForm" class="ai-card">
            <h3>Генерация истории</h3>
            <label>Тема истории<input id="writerTopic" placeholder="Например: наследство, свекровь, одиночество"></label>
            <label>Категория<select id="writerCategory">${categories.map((cat) => `<option>${escapeHtml(cat)}</option>`).join("")}</select></label>
            <label>Желаемая эмоция<input id="writerEmotion" placeholder="Например: тревога, тепло, обида, надежда"></label>
            <label>Примерный объём<select id="writerLength">
              <option value="short">Короткая</option>
              <option value="medium" selected>Средняя</option>
              <option value="long">Длинная</option>
            </select></label>
            <button id="generateStoryBtn" class="primary-btn" type="submit">Создать историю</button>
          </form>

          <form id="rewriterForm" class="ai-card">
            <h3>Режим переписывания</h3>
            <label>Вставить текст для улучшения<textarea id="rewriteInput" rows="8" placeholder="Вставьте идею или черновик. Если это чужой текст, помощник использует его только как идею и создаст новую оригинальную версию."></textarea></label>
            <button id="rewriteBtn" class="secondary-btn" type="submit">Переписать по-человечески</button>
            <label>Результат<textarea id="rewriteOutput" rows="8" readonly></textarea></label>
            <button class="copy-btn" type="button" data-copy="rewriteOutput">Скопировать результат</button>
          </form>

          <form id="imageCreatorForm" class="ai-card">
            <h3>Создать изображение</h3>
            <label>Главная эмоция<input id="imageEmotion" placeholder="Например: тревога, обида, надежда"></label>
            <label>Возраст персонажей<input id="imageAge" placeholder="Например: женщина 55 лет, сын 32 года"></label>
            <label>Место действия<input id="imagePlace" placeholder="Например: кухня, больничный коридор, старый дом"></label>
            <label>Конфликт<input id="imageConflict" placeholder="Например: семейная тайна, наследство, разговор с сыном"></label>
            <button id="createImagePromptBtn" class="primary-btn" type="submit">Создать промпт для изображения</button>
            <label>Готовый промпт<textarea id="imagePrompt" rows="9" readonly></textarea></label>
            <button class="copy-btn" type="button" data-copy="imagePrompt">Скопировать промпт</button>
            <label>Ссылка на готовую картинку<input id="generatedImageUrl" placeholder="https://... или /assets/your-image.jpg"></label>
            <button id="saveImageUrlBtn" class="secondary-btn" type="button">Сохранить картинку к истории</button>
            <p class="helper-text">Место для будущей интеграции Nano Banana или другого API генерации изображений.</p>
          </form>
        </div>
      </section>

      <section class="admin-layout">
        <form id="storyForm" class="editor-panel">
          <input type="hidden" id="storyId">
          <label>Заголовок<input id="title" required placeholder="Например: Она вернулась домой и услышала чужой голос"></label>
          <label>Категория<select id="category">${categories.map((cat) => `<option>${escapeHtml(cat)}</option>`).join("")}</select></label>
          <label>Изображение<input id="image" placeholder="/assets/default-story-cover.png или URL картинки"></label>
          <label>Первая часть для Facebook<textarea id="facebook_text" rows="7" required></textarea></label>
          <label>Продолжение для сайта<textarea id="website_text" rows="12" required></textarea></label>
          <label>Место для будущих ИИ-помощников<textarea id="ai_assistant_notes" rows="3" placeholder="Идеи для генерации, анализ крючка, тональность, промпты..."></textarea></label>
          <div class="button-row">
            <button class="secondary-btn" type="button" data-status="draft">Сохранить черновик</button>
            <button class="secondary-btn" type="button" data-status="review">На проверку</button>
            <button class="secondary-btn" type="button" data-status="approved">Одобрено</button>
            <button class="secondary-btn" type="button" data-status="scheduled">Запланировать</button>
            <button class="primary-btn" type="button" data-status="published">Опубликовать вручную</button>
          </div>
        </form>

        <aside class="copy-panel">
          <h2>Facebook-публикация</h2>
          <p class="helper-text">Ссылка не добавляется в пост. Она должна быть только в первом комментарии.</p>
          <label>Готовый текст Facebook-поста<textarea id="fbCopy" rows="9" readonly></textarea></label>
          <button id="optimizeFbPostBtn" class="primary-btn" type="button">Оптимизировать пост</button>
          <label>Короткая ссылка<input id="shortUrl" readonly></label>
          <button class="copy-btn" type="button" data-copy="shortUrl">Скопировать ссылку</button>
          <label>Готовый текст первого комментария<textarea id="commentCopy" rows="3" readonly></textarea></label>
          <button id="createCommentBtn" class="secondary-btn" type="button">Создать комментарий</button>
          <div class="button-row">
            <button class="copy-btn" type="button" data-copy="fbCopy">Скопировать пост</button>
            <button class="copy-btn" type="button" data-copy="commentCopy">Скопировать комментарий</button>
          </div>
        </aside>
      </section>

      <section class="site-optimizer-panel">
        <div class="section-title">
          <div>
            <p class="kicker">Website Story Optimizer</p>
            <h2>Оптимизация сайта</h2>
          </div>
          <button id="optimizeWebsiteBtn" class="primary-btn" type="button">Оптимизировать текст для сайта</button>
        </div>
        <div class="site-optimizer-grid">
          <label>SEO title<input id="seoTitle" readonly></label>
          <label>SEO description<textarea id="seoDescription" rows="3" readonly></textarea></label>
          <label>Рекомендуемые похожие истории<textarea id="relatedRecommendations" rows="4" readonly></textarea></label>
          <label>Оценка длины текста<input id="lengthScore" readonly></label>
          <label>Подсказка<textarea id="lengthHint" rows="3" readonly></textarea></label>
        </div>
      </section>

      <section class="facebook-integration-panel">
        <div class="section-title">
          <div>
            <p class="kicker">Meta Graph API</p>
            <h2>Facebook Live</h2>
          </div>
          <div class="button-row">
            <button id="checkFacebookBtn" class="secondary-btn" type="button">Проверить подключение Facebook</button>
            <button id="loadFacebookPostsBtn" class="primary-btn" type="button">Загрузить последние посты</button>
            <button id="refreshFacebookBtn" class="secondary-btn" type="button">Обновить данные</button>
            <button id="syncFacebookBtn" class="primary-btn" type="button">Синхронизировать</button>
          </div>
        </div>
        <p id="facebookLiveStatus" class="helper-text">🔴 Не подключено</p>
        <p id="facebookStatus" class="helper-text">Подготовлено для чтения данных страницы. Реальные ключи храните только в локальном .env.</p>
        <label class="facebook-sort-label">Сортировка<select id="facebookSort">
          <option value="total_score" selected>По общему рейтингу</option>
          <option value="likes_count">По лайкам</option>
          <option value="comments_count">По комментариям</option>
          <option value="shares_count">По репостам</option>
          <option value="link_clicks_count">По кликам</option>
        </select></label>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Текст поста</th>
                <th>Лайки</th>
                <th>Комментарии</th>
                <th>Репосты</th>
                <th>Охват</th>
                <th>Клики</th>
                <th>Рейтинг</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody id="facebookPostsTable">
              <tr><td colspan="9">Посты ещё не загружены.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="competitor-analysis-panel">
        <div class="section-title">
          <div>
            <p class="kicker">Market Research</p>
            <h2>Competitor Analysis</h2>
          </div>
          <button id="refreshCompetitorAnalysisBtn" class="primary-btn" type="button">Обновить анализ</button>
        </div>
        <p class="helper-text">Анализирует закономерности рынка без копирования чужих текстов, изображений и сюжетов.</p>
        <form id="competitorForm" class="competitor-form">
          <label>Название<input id="competitorName" required placeholder="Например: Жизненные истории"></label>
          <label>Ссылка<input id="competitorUrl" required placeholder="https://facebook.com/... или сайт"></label>
          <label>Категория<select id="competitorCategory">
            <option>Facebook-страница</option>
            <option>Сайт</option>
            <option>Медиа</option>
            <option>Группа</option>
          </select></label>
          <label>Подписчики<input id="competitorFollowers" type="number" min="0" placeholder="Если известно"></label>
          <label>Заметки для анализа<textarea id="competitorNotes" rows="3" placeholder="Темы, частота, стиль картинок, наблюдения по постам..."></textarea></label>
          <button class="secondary-btn" type="submit">Добавить конкурента</button>
        </form>
        <div class="competitor-grid">
          <article class="competitor-card">
            <h3>Список конкурентов</h3>
            <div id="competitorsList" class="competitors-list"></div>
          </article>
          <article class="competitor-card">
            <h3>Статистика</h3>
            <textarea id="competitorStats" rows="7" readonly></textarea>
          </article>
          <article class="competitor-card">
            <h3>Популярные темы</h3>
            <textarea id="competitorTopics" rows="7" readonly></textarea>
          </article>
          <article class="competitor-card">
            <h3>Популярные эмоции</h3>
            <textarea id="competitorEmotions" rows="7" readonly></textarea>
          </article>
          <article class="competitor-card">
            <h3>Лучшие изображения</h3>
            <textarea id="competitorImages" rows="7" readonly></textarea>
          </article>
          <article class="competitor-card">
            <h3>Лучшие заголовки</h3>
            <textarea id="competitorHeadlines" rows="7" readonly></textarea>
          </article>
          <article class="competitor-card wide">
            <h3>Рекомендации для Story Writer</h3>
            <textarea id="competitorRecommendations" rows="7" readonly></textarea>
          </article>
        </div>
      </section>

      <section class="stories-table-wrap">
        <h2>Все истории</h2>
        <div id="storiesTable" class="stories-table"></div>
      </section>
    </main>`, { admin: true, script: "/admin.js" });
}

function metricAverage(items, key) {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length);
}

function countBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function detectTopic(text = "") {
  const lower = text.toLowerCase();
  const rules = [
    ["Измена", ["измен", "любовниц", "предал", "предательство"]],
    ["Свекровь", ["свекров", "невестк"]],
    ["Наследство", ["наслед", "завещ", "квартир", "дом", "доля"]],
    ["Дети", ["сын", "дочь", "дет", "ребен", "внук"]],
    ["Одиночество", ["одинок", "одна", "никого", "тишин"]],
    ["Бедность", ["бедн", "денег", "долг", "нищ", "зарплат"]],
    ["Богатство", ["богат", "миллион", "деньги", "бизнес"]],
    ["Любовь", ["любов", "любила", "сердц", "муж", "жена"]],
    ["Судьба", ["судьб", "случай", "встреч", "поезд"]],
    ["Семья", ["семь", "мать", "отец", "родн", "брат", "сестр"]]
  ];
  return rules.find(([, words]) => words.some((word) => lower.includes(word)))?.[0] || "Жизненные истории";
}

function detectEmotion(text = "") {
  const lower = text.toLowerCase();
  const rules = [
    ["удивление", ["не ожидал", "вдруг", "оказалось", "тайна", "правда"]],
    ["грусть", ["плак", "слез", "боль", "потер", "одна"]],
    ["надежда", ["надеж", "прост", "вернул", "шанс", "снова"]],
    ["злость", ["зл", "крич", "обид", "предал", "ненавид"]],
    ["тревога", ["страх", "тревог", "дрож", "молчал", "боял"]],
    ["сострадание", ["жалко", "помог", "тяжело", "устал", "бед"]],
    ["ностальгия", ["стар", "детств", "прошл", "фото", "письмо"]],
    ["семейное тепло", ["обня", "кухн", "чай", "родн", "дом"]],
    ["радость", ["рад", "счаст", "улыб", "легче"]]
  ];
  return rules.find(([, words]) => words.some((word) => lower.includes(word)))?.[0] || "тревога";
}

function lengthBucket(chars) {
  if (chars < 500) return "до 500 символов";
  if (chars <= 800) return "500-800 символов";
  if (chars <= 1200) return "800-1200 символов";
  return "1200+ символов";
}

function timeBucket(date) {
  const hour = new Date(date).getHours();
  if (hour < 6) return "00:00-06:00";
  if (hour < 12) return "06:00-12:00";
  if (hour < 18) return "12:00-18:00";
  if (hour < 21) return "18:00-21:00";
  return "21:00-00:00";
}

function groupStats(posts, keyFn) {
  const groups = new Map();
  for (const post of posts) {
    const key = keyFn(post);
    const list = groups.get(key) || [];
    list.push(post);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([name, items]) => ({
    name,
    posts_count: items.length,
    avg_likes: metricAverage(items, "likes_count"),
    avg_comments: metricAverage(items, "comments_count"),
    avg_shares: metricAverage(items, "shares_count"),
    avg_reach: metricAverage(items, "reach_count"),
    avg_clicks: metricAverage(items, "link_clicks_count"),
    avg_score: metricAverage(items, "total_score")
  })).sort((a, b) => b.avg_score - a.avg_score);
}

function realDataSources() {
  const stories = readStories();
  const facebookPosts = readFacebookPosts();
  const competitors = readCompetitors();
  const facebook = facebookConfigStatus();
  const telegram = telegramConfigStatus();
  const brain = readProjectBrain();
  const hasFacebookPosts = facebookPosts.length > 0;
  const hasCompetitors = competitors.length > 0;
  const hasStories = stories.length > 0;
  const sources = {
    facebook: {
      label: "Facebook Data",
      status: facebook.configured ? (hasFacebookPosts ? "real" : "connected_empty") : "not_connected",
      is_real: facebook.configured && hasFacebookPosts,
      message: facebook.configured
        ? (hasFacebookPosts ? "Facebook подключён, посты загружены." : "Facebook подключён, но посты ещё не загружены.")
        : "Нет реальных Facebook-данных. Используются демо-гипотезы.",
      posts_count: facebookPosts.length,
      page_name: facebook.page_name || facebook.page_id || "",
      oauth_connected: facebook.oauth_connected
    },
    website: {
      label: "Website Analytics",
      status: hasStories ? "local_only" : "empty",
      is_real: hasStories,
      message: hasStories ? "Есть локальные истории и счётчики сайта." : "Истории ещё не созданы.",
      stories_count: stories.length,
      views: stories.reduce((sum, story) => sum + Number(story.views || 0), 0),
      clicks: stories.reduce((sum, story) => sum + Number(story.clicks || 0), 0)
    },
    competitors: {
      label: "Competitor Data",
      status: hasCompetitors ? "manual_sample" : "empty",
      is_real: false,
      message: hasCompetitors ? "Есть ручные/демо данные конкурентов. Live-анализ ещё не подключён." : "Конкуренты ещё не добавлены.",
      competitors_count: competitors.length
    },
    project_brain: {
      label: "Project Brain",
      status: brain.updated_at ? "active" : "needs_refresh",
      is_real: Boolean(brain.updated_at),
      message: brain.updated_at ? "Project Brain активен и обновляется из доступных источников." : "Project Brain ещё нужно обновить.",
      updated_at: brain.updated_at || null
    },
    telegram: {
      label: "Telegram Center",
      status: telegram.configured ? "connected" : "not_connected",
      is_real: telegram.configured,
      message: telegram.configured ? "Telegram готов отправлять отчёты." : "Telegram не подключён: нет BOT_TOKEN или CHAT_ID."
    },
    storage: {
      label: "Storage",
      status: storageMode,
      is_real: storageMode === "postgres",
      message: storageMode === "postgres" ? "Основная база PostgreSQL активна." : "Локальный JSON backup mode."
    }
  };
  const warnings = [];
  if (!sources.facebook.is_real) warnings.push("Нет реальных Facebook-постов: подключите Facebook Connect и загрузите Page Posts.");
  if (!sources.competitors.competitors_count) warnings.push("Нет данных конкурентов: добавьте конкурентов или подключите live-анализ позже.");
  if (!sources.telegram.is_real) warnings.push("Telegram Center не подключён: ежедневные отчёты не отправляются.");
  if (storageMode !== "postgres") warnings.push("PostgreSQL не подключён: сейчас используется локальный JSON backup mode.");
  return {
    mode: sources.facebook.is_real ? "real" : (hasStories || hasCompetitors ? "mixed_local_demo" : "demo"),
    notice: sources.facebook.is_real
      ? "Используются реальные Facebook-данные."
      : "Нет реальных Facebook-данных. Используются демо-данные и локальные данные проекта.",
    sources,
    warnings
  };
}

function bestStoryFormatsFromData(posts, stories) {
  const formats = [];
  if (posts.length) {
    const best = [...posts].sort((a, b) => Number(b.total_score || 0) - Number(a.total_score || 0))[0];
    formats.push({
      name: "Facebook hook + cliffhanger + first comment link",
      evidence: "real_facebook_posts",
      topic: best.detected_topic || detectTopic(best.message || ""),
      emotion: best.detected_emotion || detectEmotion(best.message || ""),
      score: Number(best.total_score || 0)
    });
  }
  if (stories.length) {
    formats.push({
      name: "Local story continuation page",
      evidence: "local_site_data",
      topic: stories[0]?.category || "Жизненные истории",
      score: stories.reduce((sum, story) => sum + Number(story.views || 0) + Number(story.clicks || 0), 0)
    });
  }
  if (!formats.length) {
    formats.push({
      name: "Demo format: family conflict, short hook, emotional continuation",
      evidence: "demo",
      topic: "Семья",
      score: 0
    });
  }
  return formats;
}

function buildRealDataLayer() {
  const sourceState = realDataSources();
  const stories = readStories();
  const facebookPosts = readFacebookPosts();
  const competitors = readCompetitors();
  const audience = buildAudienceInsights();
  const competitorAnalysis = buildCompetitorAnalysis();
  const recommendations = [
    sourceState.sources.facebook.is_real
      ? "Facebook Data подключены: используйте лучшие реальные темы, эмоции и время публикаций."
      : "Подключите Facebook Connect и загрузите Page Posts, чтобы заменить демо-гипотезы реальными выводами.",
    competitors.length
      ? "Competitor Analyst использует ручные данные; не копируйте тексты, берите только закономерности."
      : "Добавьте конкурентов, чтобы сравнивать свои результаты с рынком.",
    stories.length
      ? "Локальные истории доступны для Website Story Optimizer и похожих историй."
      : "Создайте первые истории, чтобы сайт начал давать собственные сигналы.",
    telegramConfigStatus().configured
      ? "Telegram Center готов отправлять статус и рекомендации."
      : "Добавьте BOT_TOKEN и CHAT_ID локально, чтобы получать отчёты в Telegram."
  ];
  return {
    generated_at: new Date().toISOString(),
    ...sourceState,
    counts: {
      stories: stories.length,
      facebook_posts: facebookPosts.length,
      competitors: competitors.length,
      recommendations: recommendations.length
    },
    entities: {
      stories: stories.slice(0, 20),
      facebook_posts: facebookPosts.slice(0, 50),
      competitors: competitors.slice(0, 20)
    },
    insights: {
      audience,
      competitor: competitorAnalysis,
      best_lengths: audience.length_analysis || [],
      best_story_formats: bestStoryFormatsFromData(facebookPosts, stories)
    },
    recommendations
  };
}

function imageInsightFromPost(post) {
  if (post.image_analysis?.tags?.length) {
    return `${post.image_analysis.tags.join(", ")}, ${post.image_analysis.people_hint || "семейная сцена"}, ${post.image_analysis.scene_hint || "бытовая сцена"}, ${post.image_analysis.emotion_hint || post.detected_emotion || "эмоциональный момент"}`;
  }
  const text = post.message || "";
  const topic = post.detected_topic;
  const scene = /кухн/i.test(text) ? "кухня" : /больниц/i.test(text) ? "больничный коридор" : /дом|квартир/i.test(text) ? "дом или квартира" : "семейная бытовая сцена";
  const people = /сын|дочь|мать|отец|свекров|невест/i.test(text) ? "2 человека или семейная сцена" : "1-2 человека";
  const conflict = /ссор|тайн|измен|наслед|молч|обид/i.test(text) ? "конфликтная сцена" : "спокойная эмоциональная сцена";
  return `${people}, ${scene}, ${topic.toLowerCase()}, ${conflict}, фотореалистичный бытовой стиль`;
}

function buildAudienceInsights() {
  const posts = readFacebookPosts().map((post) => {
    const message = post.message || "";
    const analysis = enrichFacebookPostAnalysis(post);
    const chars = Number(post.text_length || analysis.text_length || message.length);
    const paragraphs = Number(post.paragraphs_count || analysis.paragraphs_count || 1);
    return {
      ...post,
      detected_topic: analysis.detected_topic,
      detected_emotion: analysis.detected_emotion,
      image_analysis: analysis.image_analysis,
      text_length: chars,
      paragraphs_count: paragraphs,
      length_bucket: lengthBucket(chars),
      time_bucket: post.published_at ? timeBucket(post.published_at) : "нет даты",
      weekday: post.published_at ? new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(new Date(post.published_at)) : "нет даты"
    };
  });

  const topTopics = groupStats(posts, (post) => post.detected_topic);
  const topEmotions = groupStats(posts, (post) => post.detected_emotion);
  const topLength = groupStats(posts, (post) => post.length_bucket);
  const topTime = groupStats(posts, (post) => post.time_bucket);
  const topWeekday = groupStats(posts, (post) => post.weekday);
  const bestPosts = [...posts].sort((a, b) => Number(b.total_score || 0) - Number(a.total_score || 0)).slice(0, 10);
  const weakPosts = [...posts].sort((a, b) => Number(a.total_score || 0) - Number(b.total_score || 0)).slice(0, 10);
  const dataState = realDataSources();
  const bestImageType = bestPosts[0] ? imageInsightFromPost(bestPosts[0]) : "Нужны загруженные посты с изображениями. Базовая рекомендация: пожилая женщина + семейный конфликт + кухня.";
  const bestTopic = topTopics[0]?.name || "недостаточно данных";
  const bestEmotion = topEmotions[0]?.name || "недостаточно данных";
  const bestTime = topTime[0]?.name || "недостаточно данных";
  const bestLength = topLength[0]?.name || "недостаточно данных";
  const recommendations = posts.length
    ? [
        `Лучше всего сейчас работает тема "${bestTopic}" со средним рейтингом ${topTopics[0]?.avg_score || 0}.`,
        `Эмоция "${bestEmotion}" чаще даёт сильную реакцию аудитории.`,
        `Лучшее окно публикации по текущим данным: ${bestTime}.`,
        `Оптимальная длина Facebook-поста: ${bestLength}.`,
        `Рекомендуемый тип изображения: ${bestImageType}.`,
        "Для Story Writer используйте лучшие темы и эмоции как приоритетные идеи.",
        "Для Facebook Post Optimizer делайте обрыв перед самым сильным семейным конфликтом.",
        "Для Image Creator чаще тестируйте бытовые семейные сцены с живыми лицами и ясной эмоцией."
      ]
    : [
        "Загрузите последние посты Facebook, чтобы Audience Analyst начал учиться на вашей аудитории.",
        "Пока данных нет, используйте базовую гипотезу: семейный конфликт, кухня, письмо или разговор с взрослым ребёнком.",
        "После загрузки постов помощники Story Writer, Facebook Post Optimizer и Image Creator смогут ориентироваться на реальные темы и эмоции."
      ];

  return {
    data_mode: dataState.mode,
    data_notice: dataState.notice,
    data_sources: dataState.sources,
    data_warnings: dataState.warnings,
    posts_count: posts.length,
    best_topics: topTopics.slice(0, 5),
    best_emotions: topEmotions.slice(0, 5),
    best_time: bestTime,
    best_weekday: topWeekday[0]?.name || "недостаточно данных",
    best_length: bestLength,
    best_image_type: bestImageType,
    length_analysis: topLength,
    time_analysis: topTime,
    best_posts: bestPosts,
    weak_posts: weakPosts,
    recommendations
  };
}

function audienceGuidance() {
  const insights = buildAudienceInsights();
  const competitor = competitorGuidance();
  if (!insights.posts_count) {
    return `Audience Analyst: пока нет загруженных Facebook-постов, используйте базовую гипотезу: семейный конфликт, сильная эмоция, бытовая фотореалистичная сцена. ${competitor}`;
  }
  return `Audience Analyst: приоритетная тема "${insights.best_topics[0]?.name || "Жизненные истории"}", эмоция "${insights.best_emotions[0]?.name || "тревога"}", лучшее время "${insights.best_time}", длина "${insights.best_length}", изображение "${insights.best_image_type}". ${competitor}`;
}

function competitorSignals(competitor) {
  const text = `${competitor.name || ""} ${competitor.url || ""} ${competitor.category || ""} ${competitor.notes || ""}`;
  const topic = detectTopic(text);
  const emotion = detectEmotion(text);
  const isFacebook = /facebook|fb\.com/i.test(competitor.url || "") || /facebook/i.test(competitor.category || "");
  const imageStyle = /стар|пожил|мать|свекров|бабуш/i.test(text)
    ? "пожилые люди, кухня или старая квартира, напряженный разговор"
    : /наслед|дом|квартир/i.test(text)
      ? "старый дом, документы, письмо или семейный спор за столом"
      : "реалистичная бытовая семейная сцена с 1-2 людьми";
  const headlineStyle = /тайн|правд|письм|конверт|измен|наслед/i.test(text)
    ? "эмоциональная фраза + скрытая правда + обрыв перед поворотом"
    : "простая жизненная фраза + конфликт в первой строке";
  return {
    topic,
    emotion,
    isFacebook,
    imageStyle,
    headlineStyle,
    frequencyHint: isFacebook ? "1-4 поста в день, тестировать вечерние публикации" : "регулярные подборки и похожие истории на сайте",
    structure: "начало с эмоциональной бытовой сцены, конфликт в первом блоке, интрига перед ссылкой, поворот не раскрывать полностью"
  };
}

function tally(items, key) {
  const map = new Map();
  for (const item of items) map.set(item[key], (map.get(item[key]) || 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function buildCompetitorAnalysis() {
  const competitors = readCompetitors();
  const enriched = competitors.map((competitor) => ({
    ...competitor,
    analysis: competitorSignals(competitor)
  }));
  const topics = tally(enriched.map((item) => item.analysis), "topic");
  const emotions = tally(enriched.map((item) => item.analysis), "emotion");
  const images = tally(enriched.map((item) => item.analysis), "imageStyle");
  const headlines = tally(enriched.map((item) => item.analysis), "headlineStyle");
  const totalFollowers = enriched.reduce((sum, item) => sum + Number(item.followers_count || 0), 0);
  const recommendations = competitors.length
    ? [
        `Не копировать сюжеты конкурентов: использовать только закономерности тем, эмоций и формата.`,
        `Story Writer: чаще тестировать тему "${topics[0]?.name || "Семья"}" и эмоцию "${emotions[0]?.name || "тревога"}".`,
        `Facebook Post Optimizer: начинать с эмоциональной фразы и обрывать историю до раскрытия главного поворота.`,
        `Image Creator: пробовать стиль "${images[0]?.name || "реалистичная бытовая семейная сцена"}".`,
        `Website Story Optimizer: после текста вести читателя в похожие истории той же темы.`,
        `Audience Analyst: сравнивать собственные клики и реакции с рыночными гипотезами из Competitor Analyst.`
      ]
    : [
        "Добавьте 3-5 Facebook-страниц или сайтов конкурентов, чтобы увидеть рыночные закономерности.",
        "Не вставляйте чужие тексты целиком. Достаточно названия, ссылки и коротких наблюдений по формату.",
        "Для старта тестируйте семейный конфликт, наследство, свекровь, письмо, кухню и пожилых персонажей."
      ];
  return {
    competitors: enriched,
    stats: {
      competitors_count: competitors.length,
      facebook_pages: enriched.filter((item) => item.analysis.isFacebook).length,
      websites: enriched.filter((item) => !item.analysis.isFacebook).length,
      total_followers: totalFollowers,
      average_followers: competitors.length ? Math.round(totalFollowers / competitors.length) : 0
    },
    popular_topics: topics,
    popular_emotions: emotions,
    best_images: images,
    best_headlines: headlines,
    story_structure: [
      "Начало: бытовая эмоциональная сцена или фраза, которую легко понять аудитории 40-65+.",
      "Конфликт: появляется в первом или втором абзаце.",
      "Интрига: создается через письмо, наследство, молчание, измену или семейную тайну.",
      "Поворот: не раскрывается в Facebook-посте, уводит на сайт.",
      "Обрыв: перед главным признанием или неожиданным поступком."
    ],
    recommendations
  };
}

function competitorGuidance() {
  const analysis = buildCompetitorAnalysis();
  if (!analysis.competitors.length) {
    return "Competitor Analyst: конкуренты пока не добавлены; избегайте копирования, используйте оригинальные сюжеты.";
  }
  return `Competitor Analyst: рыночная гипотеза — тема "${analysis.popular_topics[0]?.name || "Семья"}", эмоция "${analysis.popular_emotions[0]?.name || "тревога"}", изображение "${analysis.best_images[0]?.name || "бытовая семейная сцена"}"; не копировать тексты и изображения.`;
}

function readProjectBrain() {
  return storageCache.projectBrain;
}

async function writeProjectBrain(brain) {
  storageCache.projectBrain = brain;
  writeJsonBackup(PROJECT_BRAIN_FILE, brain);
  if (!pgPool) return;
  try {
    await pgPool.query(
      `insert into project_brain (
        id, best_topics, best_images, best_times, best_titles, best_emotions, best_publications, best_ctr,
        best_lengths, best_story_formats, successful_stories, unsuccessful_stories, audience_analytics,
        competitor_analytics, internet_research, publication_statistics, data_quality, work_history,
        autopilot_runs, recommendations, updated_at
      ) values ('main', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
      on conflict (id) do update set
        best_topics = excluded.best_topics,
        best_images = excluded.best_images,
        best_times = excluded.best_times,
        best_titles = excluded.best_titles,
        best_emotions = excluded.best_emotions,
        best_publications = excluded.best_publications,
        best_ctr = excluded.best_ctr,
        best_lengths = excluded.best_lengths,
        best_story_formats = excluded.best_story_formats,
        successful_stories = excluded.successful_stories,
        unsuccessful_stories = excluded.unsuccessful_stories,
        audience_analytics = excluded.audience_analytics,
        competitor_analytics = excluded.competitor_analytics,
        internet_research = excluded.internet_research,
        publication_statistics = excluded.publication_statistics,
        data_quality = excluded.data_quality,
        work_history = excluded.work_history,
        autopilot_runs = excluded.autopilot_runs,
        recommendations = excluded.recommendations,
        updated_at = now()`,
      [
        JSON.stringify(brain.best_topics || []),
        JSON.stringify(brain.best_images || []),
        JSON.stringify(brain.best_times || []),
        JSON.stringify(brain.best_titles || []),
        JSON.stringify(brain.best_emotions || []),
        JSON.stringify(brain.best_publications || []),
        JSON.stringify(brain.best_ctr || []),
        JSON.stringify(brain.best_lengths || []),
        JSON.stringify(brain.best_story_formats || []),
        JSON.stringify(brain.successful_stories || []),
        JSON.stringify(brain.unsuccessful_stories || []),
        JSON.stringify(brain.audience_analytics || {}),
        JSON.stringify(brain.competitor_analytics || {}),
        JSON.stringify(brain.internet_research || {}),
        JSON.stringify(brain.publication_statistics || {}),
        JSON.stringify(brain.data_quality || {}),
        JSON.stringify(brain.work_history || []),
        JSON.stringify(brain.autopilot_runs || []),
        JSON.stringify(brain.recommendations || [])
      ]
    );
  } catch (error) {
    console.warn(`PostgreSQL project_brain persist failed: ${error.message}`);
  }
}

function scorePercent(value, max) {
  if (!max) return 0;
  return Math.round((Number(value || 0) / max) * 100);
}

function buildInternetResearchSnapshot(audience, competitor, stories) {
  const localThemes = countBy(stories, (story) => story.category)
    .slice(0, 8)
    .map((item) => item.name);
  const competitorThemes = (competitor.popular_topics || []).slice(0, 8).map((item) => item.name);
  const audienceThemes = (audience.best_topics || []).slice(0, 8).map((item) => item.name);
  return {
    status: "scaffolded",
    data_source: "local_patterns_plus_manual_competitor_inputs",
    notice: "Internet Story Researcher is prepared, but live web research is not connected yet.",
    trends: [...new Set([...audienceThemes, ...competitorThemes, ...localThemes])].slice(0, 12),
    originality_rule: "Use public trends only as pattern signals. Never copy text, images, characters, or endings.",
    future_connectors: ["search_api", "rss_feeds", "trend_sources", "manual_research_notes"],
    updated_at: new Date().toISOString()
  };
}

function rebuildProjectBrain() {
  const audience = buildAudienceInsights();
  const competitor = buildCompetitorAnalysis();
  const posts = readFacebookPosts();
  const stories = readStories();
  const dataState = realDataSources();
  const maxTopicScore = Math.max(1, ...(audience.best_topics || []).map((item) => item.avg_score || 0));
  const bestTopics = (audience.best_topics.length ? audience.best_topics : competitor.popular_topics).slice(0, 8).map((item) => ({
    topic: item.name,
    publications_count: item.posts_count || item.count || 0,
    average_likes: item.avg_likes || 0,
    average_comments: item.avg_comments || 0,
    average_ctr: item.avg_clicks ? `${item.avg_clicks} кликов в среднем` : "нет данных",
    average_reading_time: "нет данных",
    total_score: item.avg_score || scorePercent(item.count || 0, maxTopicScore)
  }));
  const bestImages = [
    ...(audience.best_image_type ? [audience.best_image_type] : []),
    ...(competitor.best_images || []).map((item) => item.name)
  ].filter(Boolean).slice(0, 8).map((type, index) => ({
    image_type: type,
    character_age: /пожил|стар|мать|свекров/i.test(type) ? "55-70" : "40-65",
    emotions: /конфликт|напряж/i.test(type) ? "тревога, удивление" : "семейное тепло, надежда",
    is_family_scene: /сем|мать|свекров|кухн|дом/i.test(type),
    clicks_count: posts[index]?.link_clicks_count || 0,
    success_score: posts[index]?.total_score || Math.max(10, 80 - index * 8)
  }));
  const bestTimes = (audience.time_analysis || []).slice(0, 6).map((item) => ({
    weekday: audience.best_weekday || "недостаточно данных",
    time: item.name,
    average_reach: item.avg_reach || 0,
    average_ctr: item.avg_clicks || 0,
    efficiency_score: item.avg_score || 0
  }));
  const bestEmotions = (audience.best_emotions || []).slice(0, 8).map((item) => ({
    emotion: item.name,
    publications_count: item.posts_count || 0,
    average_likes: item.avg_likes || 0,
    average_comments: item.avg_comments || 0,
    average_clicks: item.avg_clicks || 0,
    total_score: item.avg_score || 0
  }));
  const bestPublications = [...posts]
    .sort((a, b) => Number(b.total_score || 0) - Number(a.total_score || 0))
    .slice(0, 20)
    .map((post) => ({
      facebook_post_id: post.facebook_post_id,
      published_at: post.published_at,
      message: post.message,
      permalink_url: post.permalink_url,
      image_url: post.image_url,
      topic: post.detected_topic || detectTopic(post.message || ""),
      emotion: post.detected_emotion || detectEmotion(post.message || ""),
      likes: Number(post.likes_count || 0),
      comments: Number(post.comments_count || 0),
      shares: Number(post.shares_count || 0),
      reach: Number(post.reach_count || 0),
      link_clicks: Number(post.link_clicks_count || 0),
      ctr: Number(post.reach_count || 0) ? `${((Number(post.link_clicks_count || 0) / Number(post.reach_count || 1)) * 100).toFixed(2)}%` : "нет данных",
      total_score: Number(post.total_score || 0),
      conclusions: "Use as a signal for topic, emotion, length and posting time. Do not copy text or image."
    }));
  const bestCtr = [...posts]
    .filter((post) => Number(post.reach_count || 0) > 0)
    .map((post) => ({
      facebook_post_id: post.facebook_post_id,
      topic: post.detected_topic || detectTopic(post.message || ""),
      reach: Number(post.reach_count || 0),
      link_clicks: Number(post.link_clicks_count || 0),
      ctr_value: Number(post.link_clicks_count || 0) / Number(post.reach_count || 1),
      ctr: `${((Number(post.link_clicks_count || 0) / Number(post.reach_count || 1)) * 100).toFixed(2)}%`
    }))
    .sort((a, b) => b.ctr_value - a.ctr_value)
    .slice(0, 10);
  const bestLengths = (audience.length_analysis || []).slice(0, 8).map((item) => ({
    length: item.name,
    publications_count: item.posts_count || 0,
    average_likes: item.avg_likes || 0,
    average_comments: item.avg_comments || 0,
    average_clicks: item.avg_clicks || 0,
    total_score: item.avg_score || 0,
    evidence: dataState.sources.facebook.is_real ? "real_facebook_posts" : "demo_or_local"
  }));
  const bestStoryFormats = bestStoryFormatsFromData(posts, stories);
  const storyPerformance = stories.map((story) => {
    const views = Number(story.views || 0);
    const clicks = Number(story.clicks || 0);
    return {
      id: story.id,
      title: story.title,
      slug: story.slug,
      category: story.category,
      status: normalizeStoryStatus(story.status),
      views,
      clicks,
      ctr: views ? `${((clicks / views) * 100).toFixed(2)}%` : "нет данных",
      score: views + clicks * 5,
      image: story.image,
      created_at: story.created_at,
      conclusion: views || clicks
        ? "Use this story as a local performance signal."
        : "Needs traffic data before making a strong conclusion."
    };
  }).sort((a, b) => b.score - a.score);
  const successfulStories = storyPerformance
    .filter((story) => story.score > 0 || ["approved", "scheduled", "published"].includes(story.status))
    .slice(0, 20);
  const unsuccessfulStories = storyPerformance
    .filter((story) => story.score === 0 || ["draft", "review", "rejected"].includes(story.status))
    .slice(-20)
    .reverse();
  const bestTitles = [
    ...successfulStories.map((story) => ({
      title: story.title,
      topic: story.category,
      score: story.score,
      source: "website_story"
    })),
    ...bestPublications.slice(0, 10).map((post) => ({
      title: shortText(post.message || "", 110),
      topic: post.topic,
      score: post.total_score,
      source: "facebook_post"
    }))
  ].filter((item) => item.title).slice(0, 20);
  const audienceAnalytics = {
    best_topics: audience.best_topics || [],
    best_emotions: audience.best_emotions || [],
    best_time: audience.best_time || null,
    best_weekday: audience.best_weekday || null,
    best_length: audience.best_length || null,
    best_image_type: audience.best_image_type || null,
    weak_posts: (audience.weak_posts || []).slice(0, 10),
    recommendations: audience.recommendations || [],
    data_notice: audience.data_notice || ""
  };
  const competitorAnalytics = {
    competitors_count: competitor.stats?.competitors_count || (competitor.competitors || []).length || 0,
    popular_topics: competitor.popular_topics || [],
    popular_emotions: competitor.popular_emotions || [],
    best_images: competitor.best_images || [],
    best_headlines: competitor.best_headlines || [],
    recommendations: competitor.recommendations || []
  };
  const publicationStatistics = {
    stories_total: stories.length,
    draft: stories.filter((story) => normalizeStoryStatus(story.status) === "draft").length,
    review: stories.filter((story) => normalizeStoryStatus(story.status) === "review").length,
    approved: stories.filter((story) => normalizeStoryStatus(story.status) === "approved").length,
    scheduled: stories.filter((story) => normalizeStoryStatus(story.status) === "scheduled").length,
    published: stories.filter((story) => normalizeStoryStatus(story.status) === "published").length,
    rejected: stories.filter((story) => normalizeStoryStatus(story.status) === "rejected").length,
    facebook_posts_total: posts.length,
    total_views: stories.reduce((sum, story) => sum + Number(story.views || 0), 0),
    total_clicks: stories.reduce((sum, story) => sum + Number(story.clicks || 0), 0),
    total_likes: posts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0),
    total_comments: posts.reduce((sum, post) => sum + Number(post.comments_count || 0), 0),
    total_shares: posts.reduce((sum, post) => sum + Number(post.shares_count || 0), 0),
    total_reach: posts.reduce((sum, post) => sum + Number(post.reach_count || 0), 0),
    total_link_clicks: posts.reduce((sum, post) => sum + Number(post.link_clicks_count || 0), 0)
  };
  const internetResearch = buildInternetResearchSnapshot(audience, competitor, stories);
  const workHistory = stories.slice(0, 20).map((story, index) => ({
    story_number: index + 1,
    topic: story.category,
    image: story.image,
    facebook_post: story.facebook_text,
    website_continuation: story.website_text,
    likes: 0,
    comments: 0,
    clicks: Number(story.clicks || 0),
    ctr: story.views ? `${Math.round((Number(story.clicks || 0) / Number(story.views || 1)) * 100)}%` : "нет данных",
    conclusions: "Нужно связать историю с Facebook-постом и аналитикой переходов для точного вывода."
  }));
  const recommendations = [
    `Сегодня рекомендую: история про ${bestTopics[0]?.topic || "семью"}.`,
    `Эмоция: ${audience.best_emotions?.[0]?.name || "тревога + надежда"}.`,
    `Изображение: ${bestImages[0]?.image_type || "пожилая женщина + семейный конфликт + кухня"}.`,
    `Публикация: ${bestTimes[0]?.time || "19:00"}.`,
    `Длина Facebook-поста: ${audience.best_length || "800-1200 символов"}.`,
    "Не копировать чужие истории: использовать только закономерности и создавать оригинальные сюжеты."
  ];
  return {
    best_topics: bestTopics,
    best_images: bestImages,
    best_times: bestTimes,
    best_titles: bestTitles,
    best_emotions: bestEmotions,
    best_publications: bestPublications,
    best_ctr: bestCtr,
    best_lengths: bestLengths,
    best_story_formats: bestStoryFormats,
    successful_stories: successfulStories,
    unsuccessful_stories: unsuccessfulStories,
    audience_analytics: audienceAnalytics,
    competitor_analytics: competitorAnalytics,
    internet_research: internetResearch,
    publication_statistics: publicationStatistics,
    data_quality: dataState,
    work_history: workHistory,
    autopilot_runs: [
      {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        mode: "analysis_only",
        plan: [
          "Project Brain обновлен из Facebook, сайта, Audience Analyst и Competitor Analyst.",
          "Story Writer получает тему и эмоцию из Project Brain.",
          "Human Rewriter должен сделать текст живым и не похожим на ИИ.",
          "Image Creator получает лучший тип изображения.",
          "Facebook Post Optimizer и Website Story Optimizer получают рекомендации по длине и структуре."
        ]
      },
      ...(readProjectBrain().autopilot_runs || []).slice(0, 19)
    ],
    recommendations,
    updated_at: new Date().toISOString()
  };
}

async function updateProjectBrain() {
  const brain = rebuildProjectBrain();
  await writeProjectBrain(brain);
  return brain;
}

function autopilotStatus() {
  const facebookReady = facebookConfigStatus().configured;
  const telegramReady = telegramConfigStatus().configured;
  return [
    ["Story Writer", "✅"],
    ["Human Rewriter", "✅"],
    ["Image Creator", "✅"],
    ["Audience Analyst", "✅"],
    ["Competitor Analyst", "✅"],
    ["Facebook API", facebookReady ? "✅" : "⏳"],
    ["Telegram Bot", telegramReady ? "✅" : "⏳"],
    ["Website Analytics", "⏳"],
    ["Competitor Live Analysis", "⏳"]
  ];
}

function renderAutopilotDashboard() {
  const brain = readProjectBrain();
  const safeBrain = brain.updated_at ? brain : rebuildProjectBrain();
  const realData = buildRealDataLayer();
  const list = (items, label, mapper) => items?.length
    ? `<ol class="insight-list">${items.slice(0, 6).map((item) => `<li><strong>${escapeHtml(mapper(item))}</strong></li>`).join("")}</ol>`
    : `<p class="empty-table">${escapeHtml(label)}</p>`;
  return layout("AI Autopilot Dashboard", `${renderHeader()}
    <main class="insights-page">
      <section class="insights-hero">
        <p class="kicker">Project Brain + AI Autopilot</p>
        <h1>AI Autopilot Dashboard</h1>
        <p>Цифровой главный редактор: анализирует результаты, обновляет память и координирует всех ИИ-помощников.</p>
      </section>

      <section class="insight-card">
        <div class="section-title">
          <div>
            <h2>Состояние системы</h2>
            <p class="helper-text">Последнее обновление Project Brain: ${escapeHtml(safeBrain.updated_at || "ещё не сохранялся")}</p>
          </div>
          <button id="refreshBrainBtn" class="primary-btn" type="button">Обновить Project Brain</button>
        </div>
        <div class="autopilot-status-grid">${autopilotStatus().map(([name, status]) => `<article><span>${escapeHtml(name)}</span><strong>${status}</strong></article>`).join("")}</div>
      </section>

      <section class="insight-card">
        <h2>Real Data Status</h2>
        <p><strong>${escapeHtml(realData.notice)}</strong></p>
        <div class="autopilot-status-grid">
          ${Object.values(realData.sources).map((source) => `<article><span>${escapeHtml(source.label)}</span><strong>${escapeHtml(source.status)}</strong><p>${escapeHtml(source.message)}</p></article>`).join("")}
        </div>
        ${realData.warnings.length ? `<ul class="recommendation-list">${realData.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Лучшие темы</h2>${list(safeBrain.best_topics, "Пока нет тем.", (item) => item.topic)}</article>
        <article class="insight-card"><h2>Лучшие изображения</h2>${list(safeBrain.best_images, "Пока нет изображений.", (item) => item.image_type)}</article>
        <article class="insight-card"><h2>Лучшее время</h2>${list(safeBrain.best_times, "Пока нет времени.", (item) => `${item.weekday}: ${item.time}`)}</article>
        <article class="insight-card"><h2>Лучшие длины</h2>${list(safeBrain.best_lengths, "Пока нет реальных длин.", (item) => `${item.length} · ${item.evidence}`)}</article>
        <article class="insight-card"><h2>Форматы историй</h2>${list(safeBrain.best_story_formats, "Пока нет форматов.", (item) => `${item.name} · ${item.evidence}`)}</article>
        <article class="insight-card"><h2>Рекомендации</h2><ul class="recommendation-list">${(safeBrain.recommendations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
      </section>

      <section class="insight-card">
        <h2>История работы</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>#</th><th>Тема</th><th>Клики</th><th>CTR</th><th>Выводы</th></tr></thead>
            <tbody>${safeBrain.work_history?.length ? safeBrain.work_history.slice(0, 10).map((item) => `<tr><td>${item.story_number}</td><td>${escapeHtml(item.topic)}</td><td>${item.clicks}</td><td>${escapeHtml(item.ctr)}</td><td>${escapeHtml(item.conclusions)}</td></tr>`).join("") : `<tr><td colspan="5">История работы пока пуста.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </main>
    <script>
      document.getElementById("refreshBrainBtn").addEventListener("click", async () => {
        const button = document.getElementById("refreshBrainBtn");
        button.disabled = true;
        button.textContent = "Обновляю...";
        await fetch("/api/autopilot/refresh-brain", { method: "POST" });
        location.reload();
      });
    </script>`);
}

function telegramConfigStatus() {
  return {
    configured: Boolean(process.env.BOT_TOKEN && process.env.CHAT_ID),
    has_bot_token: Boolean(process.env.BOT_TOKEN),
    has_chat_id: Boolean(process.env.CHAT_ID)
  };
}

async function telegramApi(method, payload = {}) {
  if (!process.env.BOT_TOKEN) return null;
  const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function mainTelegramKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📖 Истории", callback_data: "menu:stories" }, { text: "🖼 Изображения", callback_data: "menu:images" }],
      [{ text: "📊 Аналитика", callback_data: "menu:analytics" }, { text: "🧠 AI Autopilot", callback_data: "menu:autopilot" }],
      [{ text: "👥 Конкуренты", callback_data: "menu:competitors" }, { text: "👨‍👩‍👧 Аудитория", callback_data: "menu:audience" }],
      [{ text: "⚙ Настройки", callback_data: "menu:settings" }]
    ]
  };
}

function storyTelegramStatus(story) {
  const labels = {
    draft: "Черновик",
    review: "Ждёт проверки",
    approved: "Одобрено",
    scheduled: "Запланировано",
    published: "Опубликовано",
    rejected: "Отклонено"
  };
  return labels[normalizeStoryStatus(story.status)] || "Черновик";
}

function shortText(text = "", limit = 900) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

async function sendTelegramMessage(chatId, text, replyMarkup) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup
  });
}

async function sendTelegramPhoto(chatId, photo, caption, replyMarkup) {
  if (!photo || photo.startsWith("/")) {
    return sendTelegramMessage(chatId, `${caption}\n\nИзображение: ${photo || "нет"}`, replyMarkup);
  }
  return telegramApi("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup
  });
}

async function telegramStart(chatId) {
  return sendTelegramMessage(chatId, "🤖 <b>AI Story Traffic Platform</b>\n\nЛичный центр управления ИИ-помощниками.", mainTelegramKeyboard());
}

async function telegramStories(chatId) {
  const stories = readStories().slice(0, 8);
  if (!stories.length) return sendTelegramMessage(chatId, "Историй пока нет.", mainTelegramKeyboard());
  const text = stories.map((story, index) => `${index + 1}. <b>${escapeHtml(story.title)}</b>\nСтатус: ${storyTelegramStatus(story)}\nТема: ${escapeHtml(story.category)}\nИзображение: ${story.image ? "есть" : "нет"}\nДата: ${escapeHtml((story.created_at || "").slice(0, 10))}`).join("\n\n");
  return sendTelegramMessage(chatId, `📖 <b>Последние истории</b>\n\n${text}`, {
    inline_keyboard: stories.map((story) => [{ text: shortText(story.title, 42), callback_data: `story:${story.id}` }]).concat([[{ text: "⬅ Меню", callback_data: "menu:start" }]])
  });
}

async function telegramStoryDetails(chatId, id) {
  const story = readStories().find((item) => item.id === id);
  if (!story) return sendTelegramMessage(chatId, "История не найдена.", mainTelegramKeyboard());
  const text = `📖 <b>${escapeHtml(story.title)}</b>\n\nСтатус: ${storyTelegramStatus(story)}\n\n📝 <b>Facebook-пост</b>\n${escapeHtml(shortText(story.facebook_text, 900))}\n\n🌐 <b>Продолжение сайта</b>\n${escapeHtml(shortText(story.website_text, 900))}\n\n🖼 <b>Изображение</b>\n${escapeHtml(story.image || "нет")}`;
  return sendTelegramMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "✅ Approve", callback_data: `approve:${story.id}` }, { text: "✏ Edit", callback_data: `rewrite:${story.id}` }],
      [{ text: "❌ Reject", callback_data: `reject:${story.id}` }],
      [{ text: "⬅ Истории", callback_data: "menu:stories" }]
    ]
  });
}

async function telegramImages(chatId) {
  const stories = readStories().filter((story) => story.image).slice(0, 8);
  if (!stories.length) return sendTelegramMessage(chatId, "Изображений пока нет.", mainTelegramKeyboard());
  const text = stories.map((story, index) => `${index + 1}. ${escapeHtml(story.category)} — ${escapeHtml(shortText(story.title, 80))}\nДата: ${escapeHtml((story.created_at || "").slice(0, 10))}`).join("\n\n");
  return sendTelegramMessage(chatId, `🖼 <b>Последние изображения</b>\n\n${text}`, {
    inline_keyboard: stories.map((story) => [{ text: shortText(story.title, 42), callback_data: `image:${story.id}` }]).concat([[{ text: "⬅ Меню", callback_data: "menu:start" }]])
  });
}

async function telegramImageDetails(chatId, id) {
  const story = readStories().find((item) => item.id === id);
  if (!story) return sendTelegramMessage(chatId, "Изображение не найдено.", mainTelegramKeyboard());
  const caption = `🖼 <b>${escapeHtml(story.title)}</b>\n\nПромпт:\n${escapeHtml(shortText(story.ai_assistant_notes || "Промпт пока не сохранён.", 900))}`;
  return sendTelegramPhoto(chatId, story.image, caption, {
    inline_keyboard: [
      [{ text: "🔄 Edit", callback_data: `rewrite:${story.id}` }, { text: "✅ Approve", callback_data: `approve:${story.id}` }],
      [{ text: "❌ Reject", callback_data: `reject:${story.id}` }],
      [{ text: "⬅ Изображения", callback_data: "menu:images" }]
    ]
  });
}

async function telegramAudience(chatId) {
  const insights = buildAudienceInsights();
  const topics = insights.best_topics.slice(0, 3).map((item, index) => `${index + 1}. ${item.name}`).join("\n") || "Недостаточно данных";
  const emotions = insights.best_emotions.slice(0, 3).map((item) => `• ${item.name}`).join("\n") || "Недостаточно данных";
  const warnings = (insights.data_warnings || []).slice(0, 3).map((item) => `• ${item}`).join("\n") || "Предупреждений нет.";
  return sendTelegramMessage(chatId, `👨‍👩‍👧 <b>Audience Analyst</b>\n\n${escapeHtml(insights.data_notice)}\n\nЛучшие темы:\n${topics}\n\nЛучшие эмоции:\n${emotions}\n\nЛучшее время:\n${escapeHtml(insights.best_time || "недостаточно данных")}\n\nЧто не хватает:\n${escapeHtml(warnings)}`, mainTelegramKeyboard());
}

async function telegramCompetitors(chatId) {
  const analysis = buildCompetitorAnalysis();
  const competitors = analysis.competitors.slice(0, 5).map((item) => `• ${escapeHtml(item.name)} — ${Number(item.followers_count || 0)} подписчиков`).join("\n") || "Конкуренты ещё не добавлены.";
  const topics = analysis.popular_topics.slice(0, 4).map((item) => `• ${item.name}`).join("\n") || "Нет данных";
  const images = analysis.best_images.slice(0, 3).map((item) => `• ${item.name}`).join("\n") || "Нет данных";
  return sendTelegramMessage(chatId, `👥 <b>Competitor Analyst</b>\n\n${competitors}\n\nПопулярные темы:\n${topics}\n\nПопулярные изображения:\n${images}`, mainTelegramKeyboard());
}

async function telegramAutopilot(chatId) {
  const status = autopilotStatus().map(([name, mark]) => `${name}\n${mark}`).join("\n\n");
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  const realData = buildRealDataLayer();
  const warnings = realData.warnings.slice(0, 4).map((item) => `• ${item}`).join("\n") || "Критичных пробелов нет.";
  return sendTelegramMessage(chatId, `🤖 <b>AI Autopilot</b>\n\n${status}\n\nData Layer:\n${escapeHtml(realData.notice)}\n\nЧего не хватает:\n${escapeHtml(warnings)}\n\nРекомендации:\n${escapeHtml((brain.recommendations || []).slice(0, 4).join("\n"))}`, mainTelegramKeyboard());
}

async function telegramStatus(chatId) {
  const fb = facebookConfigStatus();
  const tg = telegramConfigStatus();
  const realData = buildRealDataLayer();
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  return sendTelegramMessage(chatId, `✅ <b>System Status</b>\n\nTelegram: ${tg.configured ? "connected" : "not connected"}\nFacebook: ${fb.configured ? "connected" : "not connected"}\nDatabase: ${pgPool ? "PostgreSQL" : "JSON backup mode"}\nProject Brain: ${brain.updated_at ? "active" : "needs refresh"}\n\n${escapeHtml(realData.notice)}`, mainTelegramKeyboard());
}

async function telegramStats(chatId) {
  const stories = readStories();
  const posts = readFacebookPosts();
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  const stats = brain.publication_statistics || {};
  return sendTelegramMessage(chatId, `📊 <b>Stats</b>\n\nStories: ${stories.length}\nDrafts: ${stats.draft || 0}\nReview: ${stats.review || 0}\nApproved: ${stats.approved || 0}\nScheduled: ${stats.scheduled || 0}\nPublished: ${stats.published || 0}\nRejected: ${stats.rejected || 0}\n\nFacebook posts loaded: ${posts.length}\nViews: ${stats.total_views || 0}\nClicks: ${stats.total_clicks || 0}`, mainTelegramKeyboard());
}

async function telegramDrafts(chatId) {
  const stories = readStories()
    .filter((story) => ["draft", "review", "approved"].includes(normalizeStoryStatus(story.status)))
    .slice(0, 8);
  if (!stories.length) return sendTelegramMessage(chatId, "Черновиков и историй на проверке сейчас нет.", mainTelegramKeyboard());
  const text = stories.map((story, index) => `${index + 1}. <b>${escapeHtml(story.title)}</b>\nID: <code>${escapeHtml(story.id)}</code>\nСтатус: ${storyTelegramStatus(story)}\nТема: ${escapeHtml(story.category)}`).join("\n\n");
  return sendTelegramMessage(chatId, `📝 <b>Drafts / Review</b>\n\n${text}`, {
    inline_keyboard: stories.map((story) => [
      { text: `✅ ${shortText(story.title, 24)}`, callback_data: `approve:${story.id}` },
      { text: "✏ Edit", callback_data: `rewrite:${story.id}` },
      { text: "❌ Reject", callback_data: `reject:${story.id}` }
    ]).concat([[{ text: "⬅ Меню", callback_data: "menu:start" }]])
  });
}

async function telegramApproveCommand(chatId, id) {
  if (!id) return telegramDrafts(chatId);
  const result = setStoryStatusFromTelegram(id, "approve");
  return sendTelegramMessage(chatId, result ? `✅ Approved: ${escapeHtml(result.title)}\nСтатус: ${escapeHtml(result.status)}\n\nNothing was published automatically.` : "История не найдена.", mainTelegramKeyboard());
}

async function telegramRejectCommand(chatId, id) {
  if (!id) return telegramDrafts(chatId);
  const result = setStoryStatusFromTelegram(id, "reject");
  return sendTelegramMessage(chatId, result ? `❌ Rejected: ${escapeHtml(result.title)}\nСтатус: ${escapeHtml(result.status)}\n\nNothing was deleted or published.` : "История не найдена.", mainTelegramKeyboard());
}

async function telegramSettings(chatId) {
  const fb = facebookConfigStatus();
  const tg = telegramConfigStatus();
  return sendTelegramMessage(chatId, `⚙ <b>Настройки</b>\n\nFacebook API: ${fb.configured ? "✅" : "⏳"}\nTelegram: ${tg.configured ? "✅" : "⏳"}\nPostgreSQL: ${pgPool ? "✅" : "JSON backup mode"}\n\nСекреты хранятся только локально в .env или environment variables.`, mainTelegramKeyboard());
}

async function telegramHelp(chatId) {
  return sendTelegramMessage(chatId, `<b>AI Story Traffic Platform Commands</b>\n\n/status — system connection status\n/stats — stories and traffic stats\n/drafts — drafts and stories waiting for review\n/approve — show approval list\n/approve STORY_ID — approve a story locally\n/reject — show rejection list\n/reject STORY_ID — reject a story locally\n/help — command list\n\nButtons:\n✅ Approve — marks story as approved\n✏ Edit — returns story to review\n❌ Reject — marks story as rejected\n\nPublishing is never automatic.`, mainTelegramKeyboard());
}

function setStoryStatusFromTelegram(id, action) {
  const stories = readStories();
  const story = stories.find((item) => item.id === id);
  if (!story) return null;
  if (action === "approve") {
    story.status = "approved";
    story.ai_assistant_notes = [story.ai_assistant_notes || "", "Telegram: approved. Nothing was published automatically."].filter(Boolean).join("\n");
  }
  if (action === "rewrite") {
    story.status = "review";
    story.ai_assistant_notes = [story.ai_assistant_notes || "", "Telegram: edit requested. Needs human review."].filter(Boolean).join("\n");
  }
  if (action === "reject" || action === "delete") {
    story.status = "rejected";
    story.ai_assistant_notes = [story.ai_assistant_notes || "", "Telegram: rejected. Story was kept for audit history and was not published."].filter(Boolean).join("\n");
  }
  story.updated_at = new Date().toISOString();
  writeStories(stories.map((item) => item.id === id ? story : item));
  return { title: story.title, status: storyTelegramStatus(story) };
}

async function handleTelegramCallback(callback) {
  const chatId = callback.message.chat.id;
  const data = callback.data || "";
  await telegramApi("answerCallbackQuery", { callback_query_id: callback.id });
  if (data === "menu:start") return telegramStart(chatId);
  if (data === "menu:stories") return telegramStories(chatId);
  if (data === "menu:images") return telegramImages(chatId);
  if (data === "menu:audience" || data === "menu:analytics") return telegramAudience(chatId);
  if (data === "menu:competitors") return telegramCompetitors(chatId);
  if (data === "menu:autopilot") return telegramAutopilot(chatId);
  if (data === "menu:settings") return telegramSettings(chatId);
  if (data.startsWith("story:")) return telegramStoryDetails(chatId, data.split(":")[1]);
  if (data.startsWith("image:")) return telegramImageDetails(chatId, data.split(":")[1]);
  if (data.startsWith("approve:") || data.startsWith("rewrite:") || data.startsWith("reject:") || data.startsWith("delete:")) {
    const [action, id] = data.split(":");
    const result = setStoryStatusFromTelegram(id, action);
    return sendTelegramMessage(chatId, result ? `Готово: ${escapeHtml(result.title)}\nСтатус: ${escapeHtml(result.status)}` : "История не найдена.", mainTelegramKeyboard());
  }
}

async function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  if (process.env.CHAT_ID && String(chatId) !== String(process.env.CHAT_ID)) {
    return sendTelegramMessage(chatId, "Этот бот привязан к другому CHAT_ID.");
  }
  if (text === "/start") return telegramStart(chatId);
  if (text === "/help") return telegramHelp(chatId);
  if (text === "/status") return telegramStatus(chatId);
  if (text === "/stats") return telegramStats(chatId);
  if (text === "/drafts") return telegramDrafts(chatId);
  if (text === "/approve" || text.startsWith("/approve ")) return telegramApproveCommand(chatId, text.split(/\s+/)[1]);
  if (text === "/reject" || text.startsWith("/reject ")) return telegramRejectCommand(chatId, text.split(/\s+/)[1]);
  if (text === "/stories") return telegramStories(chatId);
  if (text === "/images") return telegramImages(chatId);
  if (text === "/audience") return telegramAudience(chatId);
  if (text === "/competitors") return telegramCompetitors(chatId);
  if (text === "/autopilot") return telegramAutopilot(chatId);
  if (text === "/settings") return telegramSettings(chatId);
  return telegramStart(chatId);
}

let telegramOffset = 0;
let telegramPolling = false;
const telegramDailyState = { morning: "", evening: "" };

async function pollTelegram() {
  if (!telegramConfigStatus().configured || telegramPolling) return;
  telegramPolling = true;
  try {
    const result = await telegramApi("getUpdates", { offset: telegramOffset, timeout: 20, allowed_updates: ["message", "callback_query"] });
    for (const update of result?.result || []) {
      telegramOffset = update.update_id + 1;
      if (update.message) await handleTelegramMessage(update.message);
      if (update.callback_query) await handleTelegramCallback(update.callback_query);
    }
  } catch (error) {
    console.warn(`Telegram polling failed: ${error.message}`);
  } finally {
    telegramPolling = false;
  }
}

async function sendDailyTelegramReports() {
  if (!telegramConfigStatus().configured) return;
  const nowDate = new Date();
  const dateKey = nowDate.toISOString().slice(0, 10);
  const hour = nowDate.getHours();
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  const realData = buildRealDataLayer();
  if (hour >= 8 && hour < 10 && telegramDailyState.morning !== dateKey) {
    telegramDailyState.morning = dateKey;
    await sendTelegramMessage(process.env.CHAT_ID, `Доброе утро, Алексей.\n\nСегодня рекомендую:\n\n📖 История:\n${escapeHtml(brain.best_topics?.[0]?.topic || "Мать и взрослый сын")}\n\n🖼 Изображение:\n${escapeHtml(brain.best_images?.[0]?.image_type || "Пожилая женщина на кухне")}\n\n🕒 Время:\n${escapeHtml(brain.best_times?.[0]?.time || "19:00")}\n\n📈 Основано на:\n• Audience Analyst\n• Competitor Analyst\n• Project Brain`, mainTelegramKeyboard());
    if (realData.warnings.length) {
      await sendTelegramMessage(process.env.CHAT_ID, `⚠ <b>Данных не хватает</b>\n\n${escapeHtml(realData.warnings.slice(0, 4).map((item) => `• ${item}`).join("\n"))}`, mainTelegramKeyboard());
    }
  }
  if (hour >= 21 && hour < 23 && telegramDailyState.evening !== dateKey) {
    telegramDailyState.evening = dateKey;
    const storiesToday = readStories().filter((story) => (story.created_at || "").slice(0, 10) === dateKey);
    await sendTelegramMessage(process.env.CHAT_ID, `Отчёт за день:\n\nСоздано историй: ${storiesToday.length}\nСоздано изображений: ${storiesToday.filter((story) => story.image).length}\nЛучший пост: ${escapeHtml(readFacebookPosts()[0]?.message ? shortText(readFacebookPosts()[0].message, 120) : "недостаточно данных")}\nЛучшее изображение: ${escapeHtml(brain.best_images?.[0]?.image_type || "недостаточно данных")}\nЛучшее время: ${escapeHtml(brain.best_times?.[0]?.time || "недостаточно данных")}`, mainTelegramKeyboard());
    if (realData.warnings.length) {
      await sendTelegramMessage(process.env.CHAT_ID, `⚠ <b>Статус Real Data Layer</b>\n\n${escapeHtml(realData.notice)}\n\n${escapeHtml(realData.warnings.slice(0, 4).map((item) => `• ${item}`).join("\n"))}`, mainTelegramKeyboard());
    }
  }
}

function startTelegramControlCenter() {
  if (!telegramConfigStatus().configured) {
    console.log("Telegram Control Center: disabled. Set BOT_TOKEN and CHAT_ID to enable.");
    return;
  }
  console.log("Telegram Control Center: enabled.");
  setInterval(pollTelegram, 2500);
  setInterval(sendDailyTelegramReports, 60 * 1000);
  sendTelegramMessage(process.env.CHAT_ID, "🤖 Telegram Control Center запущен.\n\nПубликация отключена. Доступны уведомления, просмотр, одобрение и отклонение.", mainTelegramKeyboard());
}

function createCompetitor(payload) {
  const name = String(payload.name || "").trim();
  const url = String(payload.url || "").trim();
  const category = String(payload.category || "Facebook-страница").trim();
  if (!name || !url) return { error: "Заполните название и ссылку конкурента." };
  const now = new Date().toISOString();
  const competitors = readCompetitors();
  const existing = competitors.find((item) => item.url === url);
  const competitor = {
    id: existing?.id || crypto.randomUUID(),
    name,
    url,
    category,
    followers_count: Number(payload.followers_count || 0),
    notes: String(payload.notes || "").trim(),
    added_at: existing?.added_at || now,
    updated_at: now
  };
  const next = existing
    ? competitors.map((item) => item.id === existing.id ? competitor : item)
    : [competitor, ...competitors];
  writeCompetitors(next);
  return competitor;
}

function renderRankList(items, emptyText) {
  if (!items.length) return `<p class="empty-table">${escapeHtml(emptyText)}</p>`;
  return `<ol class="insight-list">${items.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.posts_count} постов · рейтинг ${item.avg_score} · клики ${item.avg_clicks}</span></li>`).join("")}</ol>`;
}

function renderAudienceInsights() {
  const insights = buildAudienceInsights();
  return layout("Audience Insights", `${renderHeader()}
    <main class="insights-page">
      <section class="insights-hero">
        <p class="kicker">Audience Analyst</p>
        <h1>Audience Insights</h1>
        <p>Анализ Facebook-постов, тем, эмоций, длины текста, времени публикации и переходов на сайт.</p>
      </section>

      <section class="insight-card">
        <h2>Real Data Layer</h2>
        <p><strong>${escapeHtml(insights.data_notice)}</strong></p>
        <div class="autopilot-status-grid">
          ${Object.values(insights.data_sources).map((source) => `<article><span>${escapeHtml(source.label)}</span><strong>${escapeHtml(source.status)}</strong><p>${escapeHtml(source.message)}</p></article>`).join("")}
        </div>
        ${insights.data_warnings.length ? `<ul class="recommendation-list">${insights.data_warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </section>

      <section class="insight-summary-grid">
        <article><span>Постов в базе</span><strong>${insights.posts_count}</strong></article>
        <article><span>Лучшее время</span><strong>${escapeHtml(insights.best_time)}</strong></article>
        <article><span>Лучший день</span><strong>${escapeHtml(insights.best_weekday)}</strong></article>
        <article><span>Лучшая длина</span><strong>${escapeHtml(insights.best_length)}</strong></article>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Лучшие темы</h2>${renderRankList(insights.best_topics, "Пока нет данных по темам.")}</article>
        <article class="insight-card"><h2>Лучшие эмоции</h2>${renderRankList(insights.best_emotions, "Пока нет данных по эмоциям.")}</article>
        <article class="insight-card"><h2>Лучшее время публикации</h2>${renderRankList(insights.time_analysis, "Пока нет данных по времени.")}</article>
        <article class="insight-card"><h2>Лучшая длина Facebook-поста</h2>${renderRankList(insights.length_analysis, "Пока нет данных по длине.")}</article>
      </section>

      <section class="insight-card">
        <h2>Лучший тип изображения</h2>
        <p>${escapeHtml(insights.best_image_type)}</p>
      </section>

      <section class="insight-card">
        <h2>Рекомендации</h2>
        <ul class="recommendation-list">${insights.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>

      <section class="insight-card">
        <h2>Лучшие посты</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Дата</th><th>Тема</th><th>Эмоция</th><th>Длина</th><th>Абзацы</th><th>Лайки</th><th>Комментарии</th><th>Репосты</th><th>Клики</th><th>Рейтинг</th></tr></thead>
            <tbody>${insights.best_posts.length ? insights.best_posts.map((post) => `<tr><td>${escapeHtml(post.published_at ? new Date(post.published_at).toLocaleDateString("ru-RU") : "")}</td><td>${escapeHtml(post.detected_topic)}</td><td>${escapeHtml(post.detected_emotion)}</td><td>${post.text_length}</td><td>${post.paragraphs_count}</td><td>${post.likes_count}</td><td>${post.comments_count}</td><td>${post.shares_count}</td><td>${post.link_clicks_count}</td><td><strong>${post.total_score}</strong></td></tr>`).join("") : `<tr><td colspan="10">Загрузите посты в Facebook Integration.</td></tr>`}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Слабые посты</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Дата</th><th>Тема</th><th>Эмоция</th><th>Длина</th><th>Абзацы</th><th>Лайки</th><th>Комментарии</th><th>Репосты</th><th>Клики</th><th>Рейтинг</th></tr></thead>
            <tbody>${insights.weak_posts.length ? insights.weak_posts.map((post) => `<tr><td>${escapeHtml(post.published_at ? new Date(post.published_at).toLocaleDateString("ru-RU") : "")}</td><td>${escapeHtml(post.detected_topic)}</td><td>${escapeHtml(post.detected_emotion)}</td><td>${post.text_length}</td><td>${post.paragraphs_count}</td><td>${post.likes_count}</td><td>${post.comments_count}</td><td>${post.shares_count}</td><td>${post.link_clicks_count}</td><td><strong>${post.total_score}</strong></td></tr>`).join("") : `<tr><td colspan="10">Нет реальных данных для сравнения слабых постов.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </main>
    <footer class="footer">Audience Analyst помогает всем ИИ-помощникам улучшать истории на основе вашей аудитории.</footer>`);
}

function pick(list, seed) {
  const hash = crypto.createHash("sha256").update(seed).digest();
  return list[hash[0] % list.length];
}

function buildStoryDraft(payload, req) {
  const guidance = audienceGuidance();
  const topic = String(payload.topic || "").trim() || pick(writerThemes, Date.now().toString());
  const category = categories.includes(payload.category) ? payload.category : "Жизненные истории";
  const emotion = String(payload.emotion || "").trim() || "тихая тревога и надежда";
  const length = ["short", "medium", "long"].includes(payload.length) ? payload.length : "medium";
  const seed = `${topic}|${category}|${emotion}|${Date.now()}`;
  const names = [
    ["Нина Петровна", "Марина", "Виктор"],
    ["Галина", "Ольга", "Сергей"],
    ["Раиса", "Тамара", "Андрей"],
    ["Елена", "Светлана", "Игорь"]
  ];
  const [main, relative, man] = pick(names, seed);
  const place = pick(["маленьком городе у вокзала", "старой квартире на пятом этаже", "дачном поселке", "доме на окраине"], seed + "place");
  const secret = pick([
    "старая расписка оказалась не долгом, а признанием",
    "ключ от кладовки вел к коробке с чужими письмами",
    "забытый номер телефона принадлежал человеку, которого все считали пропавшим",
    "семейная фотография была сделана совсем не в тот год, который называли родные"
  ], seed + "secret");
  const twist = pick([
    "самый резкий человек в семье все эти годы молча защищал ее",
    "наследство оказалось не деньгами, а правом узнать правду",
    "обида, которую она носила много лет, держалась на чужой лжи",
    "человек, которого она винила, на самом деле спас ее от беды"
  ], seed + "twist");
  const title = `${main} думала, что ${topic} разрушит семью, но правда оказалась совсем другой`;
  const facebookText = `${main} жила спокойно, пока в ${place} не нашла вещь, которую от нее прятали много лет. Сначала она решила, что это обычная семейная мелочь. Но чем дальше читала, тем сильнее дрожали руки. ${relative} всегда просила не поднимать эту тему, а ${man} при одном упоминании уходил из комнаты. И только теперь ${main} поняла: в их семье молчали не из гордости. Молчали из страха...`;
  const middle = length === "long"
    ? `\n\nНа следующий день она пошла к соседке, которая помнила их семью еще молодой. Та долго не хотела говорить, поправляла платок, смотрела в окно и повторяла: \"Не мне это рассказывать\". Но потом все же принесла старую тетрадь.\n\nВ тетради были даты, короткие записи и имя, которое в доме ${main} никогда не произносили вслух.`
    : "";
  const websiteText = `${main} сидела на кухне до поздней ночи. Чай остыл, часы на стене стучали слишком громко, а найденная вещь лежала перед ней, будто ждала, когда она наконец решится посмотреть правде в глаза.\n\nУтром она позвонила ${relative}. Та сначала молчала, потом сказала усталым голосом:\n\n- Значит, дошло и до этого. Я надеялась, что ты не узнаешь так поздно.\n\n${main} не стала кричать. В ее возрасте уже понимаешь: если человек молчал десятилетиями, значит, там не просто упрямство. Там боль, стыд или страх.\n\nОказалось, что ${secret}. Из-за этого в семье поссорились почти все. Одни хотели сохранить лицо перед соседями, другие боялись потерять последнее. А ${main} все эти годы видела только верхушку этой старой обиды.${middle}\n\n- Почему вы мне не сказали? - спросила она.\n\n${relative} вытерла глаза ладонью и ответила:\n\n- Потому что думали, ты нас не простишь.\n\nЭти слова ударили сильнее самой правды. ${main} вдруг поняла, сколько лет люди могут жить рядом и бояться одного честного разговора.\n\nВечером пришел ${man}. Он долго стоял у двери, будто не решался войти. Потом положил на стол конверт и сказал:\n\n- Здесь то, что должно было быть твоим с самого начала.\n\nВнутри были не только документы. Там лежала записка, написанная неровным почерком: \"Если она когда-нибудь спросит, скажите ей, что я любила ее больше, чем могла показать\".\n\n${main} перечитывала эти строки несколько раз. И тогда случился тот самый поворот: ${twist}.\n\nОна не простила всех сразу. Так в жизни редко бывает. Но впервые за много лет ей стало легче дышать. Не потому, что правда оказалась красивой. А потому, что правда наконец стала общей.\n\nИногда семья рушится не от скандала. Иногда ее медленно разрушает молчание. И если хоть один человек решится заговорить, у остальных появляется шанс вернуться друг к другу.`;

  const temporaryCode = shortCode();
  return {
    title,
    category,
    image: "/assets/default-story-cover.png",
    facebook_text: facebookText,
    website_text: websiteText,
    short_url: absoluteUrl(req, `/s/${temporaryCode}`),
    comment_text: `Продолжение истории читайте здесь: ${absoluteUrl(req, `/s/${temporaryCode}`)}`,
    ai_assistant_notes: `Story Writer: тема "${topic}", категория "${category}", эмоция "${emotion}", объем "${length}". Черновик оригинальный: другие персонажи, ситуация, финал и структура.\n${guidance}`
  };
}

function humanRewrite(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const idea = source
    .replace(/\s+/g, " ")
    .replace(/как искусственный интеллект|нейросеть|данный текст/gi, "")
    .slice(0, 900);
  return `Я взял этот текст только как идею и сделал новую, более живую версию: с другими персонажами, другой ситуацией, другим финалом и более простым человеческим языком.\n\nВалентина Сергеевна не любила жаловаться. В ее возрасте люди часто говорят: \"Да что уж теперь\", а потом тихо несут свое дальше. Но в тот вечер она сидела у окна и все никак не могла убрать со стола старую записку.\n\nВ записке было всего несколько строк. Ничего громкого, никаких красивых слов. Просто просьба приехать и поговорить, пока еще не поздно.\n\nСначала Валентина рассердилась. Столько лет молчали, делали вид, что ничего не случилось, а теперь вдруг \"поговорить\". Она даже хотела порвать бумагу, но рука не поднялась.\n\nНа следующий день она все-таки поехала. Дорога заняла меньше часа, а казалось, будто она возвращается на тридцать лет назад. У подъезда стояла женщина, которую Валентина сразу узнала, хотя та сильно постарела.\n\n- Я боялась, что ты не придешь, - сказала женщина.\n\n- Я и сама боялась, - честно ответила Валентина.\n\nОни долго сидели на кухне. Говорили не сразу. Сначала был чай, потом неловкие паузы, потом слезы. И только к вечеру выяснилось главное: та старая обида, из-за которой развалилась семья, выросла из чужих слов. Кто-то когда-то сказал неправду, кто-то промолчал, кто-то решил, что гордость важнее родных.\n\nВалентина слушала и чувствовала не радость, а усталость. Слишком много лет ушло на молчание.\n\n- Почему ты не пришла раньше? - спросила она.\n\n- Думала, ты меня ненавидишь.\n\nВалентина посмотрела на нее и вдруг поняла: они обе прожили полжизни рядом с одной и той же болью, только каждая в своей комнате.\n\nДомой она вернулась поздно. Записку не выбросила. Положила в коробку с фотографиями. Не потому, что все стало хорошо. А потому, что в тот день правда наконец перестала быть чужой.\n\nИсходная идея для ориентира: ${idea}`;
}

function findAny(text, variants, fallback) {
  const lower = String(text || "").toLowerCase();
  return variants.find((item) => lower.includes(item.toLowerCase())) || fallback;
}

function buildImagePrompt(payload) {
  const guidance = audienceGuidance();
  const title = String(payload.title || "").trim();
  const facebookText = String(payload.facebook_text || "").trim();
  const websiteText = String(payload.website_text || "").trim();
  const allText = `${title}\n${facebookText}\n${websiteText}`;
  const emotion = String(payload.emotion || "").trim()
    || findAny(allText, ["тревога", "обида", "надежда", "стыд", "растерянность", "молчание", "напряжение"], "тихая тревога и сдержанная надежда");
  const age = String(payload.age || "").trim()
    || findAny(allText, ["мать", "свекровь", "бабушка", "сын", "дочь"], "женщина 55-65 лет и взрослый родственник 30-45 лет");
  const place = String(payload.place || "").trim()
    || findAny(allText, ["кухня", "квартира", "дом", "больничный коридор", "деревенский двор", "дача"], "обычная кухня в старой квартире");
  const conflict = String(payload.conflict || "").trim()
    || findAny(allText, ["наследство", "измена", "письмо", "конверт", "тайна", "ссора", "сын", "свекровь"], "семейная тайна, которая всплыла после долгого молчания");
  const scene = findAny(`${place} ${conflict}`, [
    "пожилая женщина на кухне",
    "семейный конфликт в квартире",
    "мужчина и женщина за столом",
    "мать с взрослым сыном",
    "свекровь и невестка",
    "женщина с письмом в руках",
    "старый дом",
    "больничный коридор",
    "деревенский двор",
    "семейный ужин с напряжением"
  ], place);

  return {
    analysis: { title, emotion, age, place, conflict, scene },
    prompt: `Photorealistic editorial lifestyle photo for a Facebook story post. Scene: ${scene}. Main emotion: ${emotion}. Characters: ${age}. Setting: ${place}. Conflict shown visually: ${conflict}. The image should feel like a real everyday family photograph from Eastern Europe: natural faces, imperfect real skin texture, ordinary clothing, modest home details, lived-in interior, no glamour, no staged advertising look. Capture a tense emotional moment before or after an important conversation, with subtle body language and believable facial expressions. Use natural window light or warm kitchen light, documentary photography style, 35mm lens, shallow but realistic depth of field, horizontal 16:9 composition, strong visual hook for Facebook feed, clear central subject, no text, no logos, no watermark.\n\nAudience Analyst guidance: ${guidance}\n\nNegative prompt: cartoon, illustration, plastic faces, AI-looking skin, overly perfect people, glossy fashion photo, fantasy, melodrama poster, distorted hands, extra fingers, unreadable text, fake smiles, heavy filters, surreal lighting, stock photo style.`
  };
}

function stripLinks(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:www\.)\S+\.\S+/gi, "")
    .replace(/Продолжение истории читайте здесь:\s*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitSentences(text) {
  return stripLinks(text)
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function optimizeFacebookPost(payload) {
  const guidance = audienceGuidance();
  const title = stripLinks(payload.title);
  const source = stripLinks(payload.facebook_text || payload.website_text || title);
  const website = stripLinks(payload.website_text);
  const sentences = splitSentences(source);
  const continuation = splitSentences(website);
  const hook = sentences[0] || title || "Она думала, что обычный разговор ничего не изменит.";
  const second = sentences[1] || "Но одна фраза заставила ее замолчать и посмотреть на родных совсем иначе.";
  const conflict = continuation.find((line) => /молч|тайн|письм|конверт|наслед|сын|дочь|свекров|измен|обид|страх/i.test(line))
    || "В семье слишком долго делали вид, что ничего не произошло.";
  const breakLine = continuation.find((line) => /понял|узнал|открыл|сказал|нашла|увидел/i.test(line))
    || "И только вечером она поняла, почему все эти годы от нее прятали правду.";
  const post = [
    `${hook}`,
    `${second}`,
    `${conflict}`,
    `${breakLine}`,
    "А дальше случилось то, чего она совсем не ожидала..."
  ].join("\n\n");

  return {
    facebook_text: stripLinks(post),
    notes: `Facebook Post Optimizer: пост укорочен, разбит на абзацы, ссылка удалена, обрыв поставлен перед продолжением.\n${guidance}`
  };
}

function createCommentLink(payload) {
  const shortUrl = String(payload.short_url || "").trim();
  return {
    comment_text: shortUrl
      ? `Продолжение истории читайте здесь: ${shortUrl}`
      : "Продолжение истории читайте здесь: [сначала сохраните историю, чтобы получить короткую ссылку]"
  };
}

function paragraphize(text) {
  const sentences = splitSentences(text);
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  return paragraphs.filter(Boolean).join("\n\n");
}

function buildSeoDescription(text) {
  const clean = stripLinks(text).replace(/\s+/g, " ");
  return clean.length > 158 ? `${clean.slice(0, 155).trim()}...` : clean;
}

function optimizeWebsiteStory(payload) {
  const stories = readStories();
  const id = String(payload.id || "");
  const category = String(payload.category || "");
  const originalTitle = stripLinks(payload.title);
  const originalText = stripLinks(payload.website_text);
  const title = originalTitle.includes("правда") || originalTitle.includes("тайна")
    ? originalTitle
    : `${originalTitle}: правда, которую семья скрывала годами`;
  const sentences = splitSentences(originalText);
  const intrigue = sentences.some((line) => /только потом|не ожидала|правда|тайн|молч/i.test(line))
    ? ""
    : "Сначала ей показалось, что это обычная семейная ссора. Но уже через несколько минут стало ясно: за молчанием родных скрывалось куда больше.\n\n";
  const optimizedText = `${intrigue}${paragraphize(originalText)}`.trim();
  const words = optimizedText.split(/\s+/).filter(Boolean).length;
  const lengthStatus = words < 350 ? "текст короткий" : words > 1200 ? "слишком длинный" : "нормальный";
  const lengthHint = words < 350
    ? "Текст короткий: стоит добавить 2-3 сцены, живой диалог и более сильный поворот перед финалом."
    : words > 1200
      ? "Текст слишком длинный: сократите повторяющиеся объяснения, оставьте больше действия и коротких абзацев."
      : "Длина нормальная: текст подходит для удержания читателя, особенно если первые абзацы держат интригу.";
  const related = stories
    .filter((story) => story.id !== id && story.status === "published")
    .sort((a, b) => {
      const categoryScore = Number(b.category === category) - Number(a.category === category);
      return categoryScore || (Number(b.views || 0) + Number(b.clicks || 0)) - (Number(a.views || 0) + Number(a.clicks || 0));
    })
    .slice(0, 3)
    .map((story) => `${story.title} — /story/${story.slug}`);

  return {
    title,
    website_text: optimizedText,
    seo_title: `${title} | Жизненные истории`,
    seo_description: buildSeoDescription(optimizedText),
    related_recommendations: related.length ? related : ["Пока мало опубликованных историй. Добавьте 2-3 истории в той же категории для лучшего удержания."],
    word_count: words,
    length_score: `${words} слов — ${lengthStatus}`,
    length_hint: lengthHint,
    notes: "Website Story Optimizer: заголовок, абзацы, SEO и рекомендации похожих историй подготовлены."
  };
}

function facebookConfigStatus(req) {
  const connection = readFacebookConnection(req);
  const pageId = connection.page_id || process.env.FACEBOOK_PAGE_ID || "";
  const pageAccessToken = connection.page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
  const hasPageId = Boolean(pageId);
  const hasPageAccessToken = Boolean(pageAccessToken);
  const missing = [
    !process.env.META_APP_ID ? "META_APP_ID" : "",
    !process.env.META_APP_SECRET ? "META_APP_SECRET" : "",
    !hasPageId ? "FACEBOOK_PAGE_ID" : "",
    !hasPageAccessToken ? "FACEBOOK_PAGE_ACCESS_TOKEN" : ""
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    oauth_connected: Boolean(connection.page_id && connection.page_access_token),
    has_user_token: Boolean(connection.user_token),
    pending_pages_count: Array.isArray(connection.pending_pages) ? connection.pending_pages.length : 0,
    page_id: pageId,
    page_name: connection.page_name || "",
    page_source: connection.page_id ? "oauth" : (process.env.FACEBOOK_PAGE_ID ? "env" : ""),
    page_token_source: connection.page_access_token ? "oauth" : (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ? "env" : ""),
    connected_at: connection.connected_at || null,
    missing,
    has_app_id: Boolean(process.env.META_APP_ID),
    has_app_secret: Boolean(process.env.META_APP_SECRET),
    has_page_id: hasPageId,
    has_page_access_token: hasPageAccessToken
  };
}

function securityAudit() {
  const gitignore = fs.existsSync(path.join(ROOT, ".gitignore"))
    ? fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8")
    : "";
  const envExample = fs.existsSync(path.join(ROOT, ".env.example"))
    ? fs.readFileSync(path.join(ROOT, ".env.example"), "utf8")
    : "";
  const fb = facebookConfigStatus();
  const tg = telegramConfigStatus();
  const checks = {
    env_file_exists: fs.existsSync(ENV_FILE),
    env_is_gitignored: /^\.env$/m.test(gitignore) && /^\.env\.\*$/m.test(gitignore),
    env_example_exists: fs.existsSync(path.join(ROOT, ".env.example")),
    database_url_present: Boolean(process.env.DATABASE_URL),
    database_url_in_example: /DATABASE_URL=/.test(envExample),
    meta_app_id_present: Boolean(process.env.META_APP_ID),
    meta_app_secret_present: Boolean(process.env.META_APP_SECRET),
    facebook_redirect_uri_present: Boolean(process.env.FACEBOOK_REDIRECT_URI),
    facebook_login_config_id_present: Boolean(process.env.FACEBOOK_LOGIN_CONFIG_ID),
    facebook_page_id_present: fb.has_page_id,
    facebook_page_token_present: fb.has_page_access_token,
    facebook_connection_file_gitignored: /data\/facebook_connection\.local\.json/.test(gitignore),
    telegram_bot_token_present: tg.has_bot_token,
    telegram_chat_id_present: tg.has_chat_id,
    autopublish_enabled: false,
    facebook_write_permissions_requested: false
  };
  const warnings = [];
  if (!checks.env_is_gitignored) warnings.push(".env is not fully protected by .gitignore.");
  if (!checks.database_url_present) warnings.push("DATABASE_URL is missing. Production needs PostgreSQL.");
  if (!checks.meta_app_id_present || !checks.meta_app_secret_present) warnings.push("Meta OAuth is not fully configured.");
  if (!checks.facebook_page_id_present || !checks.facebook_page_token_present) warnings.push("Facebook Page is not connected yet.");
  if (!checks.telegram_bot_token_present || !checks.telegram_chat_id_present) warnings.push("Telegram Bot is not configured yet.");
  if (!checks.facebook_connection_file_gitignored) warnings.push("Local Facebook OAuth connection file should stay out of Git.");
  return {
    safe_to_commit: checks.env_is_gitignored && checks.env_example_exists && checks.facebook_connection_file_gitignored,
    checks,
    warnings,
    note: "Secret values are never returned by this audit."
  };
}

function readFacebookConnection(req) {
  const stored = storageCache.facebookConnection || {};
  if (!req) return stored;
  const cookieConnection = decryptFacebookConnection(parseCookies(req)[FACEBOOK_CONNECTION_COOKIE]);
  return Object.keys(cookieConnection).length ? { ...stored, ...cookieConnection } : stored;
}

function saveFacebookConnection(connection, res, req) {
  storageCache.facebookConnection = connection;
  writeJsonBackup(FACEBOOK_CONNECTION_FILE, connection);
  persistFacebookConnection(connection);
  if (res) setFacebookConnectionCookie(res, connection, req);
}

async function persistFacebookConnection(connection) {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `insert into facebook_connection (id, connection, updated_at)
       values ('main', $1, now())
       on conflict (id) do update set
         connection = excluded.connection,
         updated_at = now()`,
      [JSON.stringify(connection || {})]
    );
  } catch (error) {
    console.warn(`PostgreSQL facebook_connection persist failed: ${error.message}`);
  }
}

function facebookCredentials(req) {
  const stored = storageCache.facebookConnection || {};
  const cookie = decryptFacebookConnection(parseCookies(req)[FACEBOOK_CONNECTION_COOKIE]);
  const connection = Object.keys(cookie).length ? { ...stored, ...cookie } : stored;
  const pageTokenSource = cookie.page_access_token
    ? "cookie"
    : (stored.page_access_token
    ? "oauth"
    : (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ? "env" : ""));
  return {
    pageId: connection.page_id || process.env.FACEBOOK_PAGE_ID || "",
    pageAccessToken: connection.page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "",
    pageIdSource: cookie.page_id ? "cookie" : (stored.page_id ? "oauth" : (process.env.FACEBOOK_PAGE_ID ? "env" : "")),
    pageAccessTokenSource: pageTokenSource
  };
}

function facebookOAuthPageCredentials(req) {
  const stored = storageCache.facebookConnection || {};
  const cookie = decryptFacebookConnection(parseCookies(req)[FACEBOOK_CONNECTION_COOKIE]);
  const connection = Object.keys(cookie).length ? { ...stored, ...cookie } : stored;
  const pageAccessTokenSource = cookie.page_access_token
    ? "cookie"
    : (stored.page_access_token ? "oauth" : "");
  return {
    pageId: connection.page_id || "",
    pageAccessToken: connection.page_access_token || "",
    pageIdSource: cookie.page_id ? "cookie" : (stored.page_id ? "oauth" : ""),
    pageAccessTokenSource
  };
}

function safeFacebookAccounts(accounts = []) {
  return accounts.map((page) => ({
    id: page.id || "",
    name: page.name || "",
    category: page.category || "",
    tasks: Array.isArray(page.tasks) ? page.tasks : [],
    has_access_token: Boolean(page.access_token)
  }));
}

function pageTasksForConnection(connection, pageId) {
  const pages = [
    ...(Array.isArray(connection.pending_pages) ? connection.pending_pages : []),
    ...(Array.isArray(connection.accounts_summary) ? connection.accounts_summary : [])
  ];
  return pages.find((page) => page.id === pageId)?.tasks || [];
}

async function refreshOAuthPageConnection(req, res) {
  const connection = readFacebookConnection(req);
  const selectedPageId = connection.page_id || "";
  const userToken = connection.user_token || "";
  const result = {
    connection,
    refreshed: false,
    selected_page_id: selectedPageId,
    page_tasks: pageTasksForConnection(connection, selectedPageId),
    accounts: safeFacebookAccounts(connection.accounts_summary || connection.pending_pages || []),
    meta_status: null,
    meta_error: null
  };
  if (!selectedPageId || !userToken) return result;
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts?${new URLSearchParams({
    fields: "access_token,name,id,tasks,category",
    access_token: userToken
  }).toString()}`;
  const { response, data } = await graphFetchJson(url, "me-accounts-refresh", 15000);
  result.meta_status = response.status;
  result.meta_error = safeMetaErrorObject(data.error);
  if (!response.ok || data.error) return result;
  const pages = data.data || [];
  result.accounts = safeFacebookAccounts(pages);
  const selected = pages.find((page) => page.id === selectedPageId);
  result.page_tasks = selected?.tasks || result.page_tasks;
  if (!selected?.access_token) return result;
  const safePages = pages.map((page) => ({
    id: page.id,
    name: page.name,
    category: page.category || "",
    access_token: page.access_token,
    tasks: page.tasks || []
  }));
  const nextConnection = {
    ...connection,
    page_id: selected.id,
    page_name: selected.name,
    page_category: selected.category || "",
    page_access_token: selected.access_token,
    pending_pages: safePages,
    accounts_summary: safeFacebookAccounts(pages),
    updated_at: new Date().toISOString()
  };
  saveFacebookConnection(nextConnection, res, req);
  result.connection = nextConnection;
  result.refreshed = true;
  return result;
}

function facebookOAuthPageCredentialsFromConnection(connection) {
  return {
    pageId: connection.page_id || "",
    pageAccessToken: connection.page_access_token || "",
    pageIdSource: connection.page_id ? "oauth" : "",
    pageAccessTokenSource: connection.page_access_token ? "oauth" : ""
  };
}

function summarizeGrantedPermissions(permissionsResponse) {
  return (permissionsResponse?.data || [])
    .filter((item) => item.status === "granted")
    .map((item) => item.permission)
    .sort();
}

function missingFacebookPermissions(granted = []) {
  return facebookReadPermissions.filter((permission) => !granted.includes(permission));
}

async function loadFacebookPermissionDiagnostics(req) {
  const connection = readFacebookConnection(req);
  const userToken = connection.user_token || "";
  const { pageId, pageAccessToken, pageAccessTokenSource } = facebookCredentials(req);
  const diagnostics = {
    requested_scopes: facebookReadPermissions,
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    oauth_flow: process.env.FACEBOOK_LOGIN_CONFIG_ID ? "facebook_login_for_business_config" : "standard_scope",
    uses_facebook_login_for_business: Boolean(process.env.FACEBOOK_LOGIN_CONFIG_ID),
    selected_page_id: pageId,
    token_type: connection.user_token_type || (userToken ? "bearer" : ""),
    page_token_source: pageAccessTokenSource,
    has_user_token: Boolean(userToken),
    has_page_access_token: Boolean(pageAccessToken),
    granted_scopes: connection.granted_permissions || [],
    missing_scopes: missingFacebookPermissions(connection.granted_permissions || []),
    old_posts_endpoint: pageId ? metaEndpoint(`/${pageId}/posts`, { fields: facebookLegacyPostsFields, limit: "25" }) : "",
    posts_endpoint: pageId ? metaEndpoint(`/${pageId}/published_posts`, { fields: facebookFeedFields, limit: "25" }) : "",
    fallback_posts_endpoint: pageId ? metaEndpoint(`/${pageId}/posts`, { fields: facebookFeedFields, limit: "25" }) : "",
    fields: facebookFeedFields,
    accounts: connection.accounts_summary || []
  };
  if (!userToken) return diagnostics;
  const permissions = await graphGet(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/permissions?${new URLSearchParams({
    access_token: userToken
  }).toString()}`, "me-permissions");
  const accounts = await graphGet(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts?${new URLSearchParams({
    fields: "id,name,category,tasks",
    access_token: userToken
  }).toString()}`, "me-accounts-diagnostics");
  diagnostics.granted_scopes = summarizeGrantedPermissions(permissions);
  diagnostics.missing_scopes = missingFacebookPermissions(diagnostics.granted_scopes);
  diagnostics.accounts = (accounts.data || []).map((page) => ({
    id: page.id,
    name: page.name,
    category: page.category || "",
    tasks: page.tasks || []
  }));
  facebookLog("permissions", {
    requested_scopes: diagnostics.requested_scopes.join(","),
    oauth_flow: diagnostics.oauth_flow,
    selected_page_id: diagnostics.selected_page_id,
    token_type: diagnostics.token_type,
    page_token_source: diagnostics.page_token_source,
    user_token: diagnostics.has_user_token,
    page_access_token: diagnostics.has_page_access_token,
    granted_scopes: diagnostics.granted_scopes.join(","),
    missing_scopes: diagnostics.missing_scopes.join(","),
    accounts_count: diagnostics.accounts.length
  });
  return diagnostics;
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

async function graphFetchJson(url, endpoint, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    facebookLog(endpoint, {
      status: response.status,
      ok: response.ok,
      meta_error: data.error?.message || "",
      token_present: /access_token=/.test(url)
    });
    return { response, data };
  } catch (error) {
    const message = error.name === "AbortError" ? `Meta API request timeout after ${timeoutMs}ms.` : safeMetaError(error);
    facebookLog(endpoint, { status: "network_error", meta_error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

async function graphGet(url, endpoint = "graphGet") {
  const { response, data } = await graphFetchJson(url, endpoint);
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Meta Graph API request failed.");
  }
  return data;
}

function summarizeDebugToken(data) {
  const token = data?.data || {};
  return {
    app_id: token.app_id || "",
    type: token.type || "",
    application: token.application || "",
    data_access_expires_at: token.data_access_expires_at || 0,
    expires_at: token.expires_at || 0,
    is_valid: Boolean(token.is_valid),
    scopes: Array.isArray(token.scopes) ? token.scopes.sort() : [],
    profile_id: token.profile_id || "",
    user_id: token.user_id || "",
    error: safeMetaErrorObject(token.error)
  };
}

async function debugFacebookToken(inputToken, label) {
  if (!inputToken) {
    return {
      present: false,
      label,
      debug: null,
      meta_status: null,
      meta_error: null
    };
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return {
      present: true,
      label,
      debug: null,
      meta_status: null,
      meta_error: "META_APP_ID or META_APP_SECRET is missing."
    };
  }
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/debug_token?${new URLSearchParams({
    input_token: inputToken,
    access_token: appToken
  }).toString()}`;
  const { response, data } = await graphFetchJson(url, `debug-token-${label}`, 15000);
  return {
    present: true,
    label,
    debug: summarizeDebugToken(data),
    meta_status: response.status,
    meta_error: safeMetaErrorObject(data.error)
  };
}

async function loadFacebookTokenDebug(req) {
  const connection = readFacebookConnection(req);
  const { pageId, pageAccessToken, pageAccessTokenSource } = facebookOAuthPageCredentials(req);
  const userToken = connection.user_token || "";
  const result = {
    ok: true,
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    selected_page_id: pageId,
    page_token_source: pageAccessTokenSource,
    env_page_token_present: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
    env_page_token_used_for_load_posts: false,
    user_token_present: Boolean(userToken),
    page_token_present: Boolean(pageAccessToken),
    user_token: await debugFacebookToken(userToken, "user"),
    page_token: await debugFacebookToken(pageAccessToken, "page"),
    page_token_me: null,
    page_token_belongs_to_selected_page: false
  };
  if (pageAccessToken) {
    const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me?${new URLSearchParams({
      fields: "id,name",
      access_token: pageAccessToken
    }).toString()}`;
    const { response, data } = await graphFetchJson(url, "page-token-me", 15000);
    result.page_token_me = {
      meta_status: response.status,
      id: data.id || "",
      name: data.name || "",
      error: safeMetaErrorObject(data.error)
    };
    result.page_token_belongs_to_selected_page = Boolean(pageId && data.id === pageId);
  }
  facebookLog("token-debug", {
    graph_api_version: result.graph_api_version,
    selected_page_id: result.selected_page_id,
    page_token_source: result.page_token_source,
    user_token: result.user_token_present,
    page_token: result.page_token_present,
    page_token_profile_id: result.page_token?.debug?.profile_id || "",
    page_token_me_id: result.page_token_me?.id || "",
    page_token_belongs_to_selected_page: result.page_token_belongs_to_selected_page
  });
  return result;
}

function facebookOAuthRedirectUri(req) {
  return configuredRedirectUri(req);
}

function startFacebookOAuth(req, res) {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return redirect(res, "/facebook-setup-wizard?error=missing_app_config");
  }
  const state = crypto.randomBytes(24).toString("hex");
  const connection = readFacebookConnection(req);
  saveFacebookConnection({
    ...connection,
    oauth_state: state,
    oauth_started_at: new Date().toISOString()
  }, res, req);
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: facebookOAuthRedirectUri(req),
    state,
    response_type: "code",
    auth_type: "rerequest"
  });
  if (process.env.FACEBOOK_LOGIN_CONFIG_ID) {
    params.set("config_id", process.env.FACEBOOK_LOGIN_CONFIG_ID);
  } else {
    params.set("scope", facebookReadPermissions.join(","));
  }
  facebookLog("oauth-start", {
    uses_config_id: Boolean(process.env.FACEBOOK_LOGIN_CONFIG_ID),
    requested_scopes: process.env.FACEBOOK_LOGIN_CONFIG_ID ? "config_id" : facebookReadPermissions.join(",")
  });
  redirect(res, `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?${params.toString()}`);
}

async function exchangeFacebookCode(req, code) {
  const redirectUri = facebookOAuthRedirectUri(req);
  const shortToken = await graphGet(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: redirectUri,
    client_secret: process.env.META_APP_SECRET,
    code
  }).toString()}`);
  try {
    return await graphGet(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortToken.access_token
    }).toString()}`);
  } catch {
    return shortToken;
  }
}

async function handleFacebookOAuthCallback(req, res, url) {
  const error = url.searchParams.get("error") || url.searchParams.get("error_reason");
  if (error) return redirect(res, `/facebook-connect?error=${encodeURIComponent(error)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const connection = readFacebookConnection(req);
  if (!code || !state || state !== connection.oauth_state) {
    return redirect(res, "/facebook-connect?error=invalid_oauth_state");
  }
  try {
    const tokenData = await exchangeFacebookCode(req, code);
    const userToken = tokenData.access_token;
    const permissions = await graphGet(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/permissions?${new URLSearchParams({
      access_token: userToken
    }).toString()}`, "me-permissions");
    const grantedPermissions = summarizeGrantedPermissions(permissions);
    const pages = await graphGet(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts?${new URLSearchParams({
      fields: "id,name,category,access_token,tasks",
      access_token: userToken
    }).toString()}`);
    const pageList = pages.data || [];
    if (!pageList.length) {
    saveFacebookConnection({ ...connection, oauth_state: "", pending_pages: [], updated_at: new Date().toISOString() }, res, req);
      return redirect(res, "/facebook-connect?error=no_pages_found");
    }
    const safePages = pageList.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category || "",
      access_token: page.access_token,
      tasks: page.tasks || []
    }));
    const selected = safePages[0];
    saveFacebookConnection({
      app_id: process.env.META_APP_ID,
      user_token: userToken,
      user_token_type: tokenData.token_type || "bearer",
      user_token_expires_in: tokenData.expires_in || null,
      page_id: selected.id,
      page_name: selected.name,
      page_category: selected.category,
      page_access_token: selected.access_token,
      pending_pages: safePages,
      granted_permissions: grantedPermissions,
      missing_permissions: missingFacebookPermissions(grantedPermissions),
      accounts_summary: safePages.map((page) => ({
        id: page.id,
        name: page.name,
        category: page.category || "",
        tasks: page.tasks || []
      })),
      oauth_state: "",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, res, req);
    facebookLog("oauth-callback", {
      selected_page_id: selected.id,
      token_type: tokenData.token_type || "bearer",
      user_token: Boolean(userToken),
      page_access_token: Boolean(selected.access_token),
      granted_scopes: grantedPermissions.join(","),
      missing_scopes: missingFacebookPermissions(grantedPermissions).join(","),
      accounts_count: safePages.length
    });
    return redirect(res, `/facebook-connect?connected=1${safePages.length > 1 ? "&select=1" : ""}`);
  } catch (error) {
    return redirect(res, `/facebook-connect?error=${encodeURIComponent(error.message)}`);
  }
}

function selectFacebookPage(req, res, pageId) {
  const connection = readFacebookConnection(req);
  const page = (connection.pending_pages || []).find((item) => item.id === pageId);
  if (!page) {
    facebookLog("select-page", { selected_page_id: pageId, pending_pages_count: (connection.pending_pages || []).length, page_access_token: false });
    return { ok: false, code: "page_not_found", message: "Page not found in the last OAuth connection. Reconnect Facebook and select the Page again." };
  }
  saveFacebookConnection({
    ...connection,
    page_id: page.id,
    page_name: page.name,
    page_category: page.category || "",
    page_access_token: page.access_token,
    accounts_summary: (connection.pending_pages || []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category || "",
      tasks: item.tasks || []
    })),
    updated_at: new Date().toISOString()
  }, res, req);
  facebookLog("select-page", { selected_page_id: page.id, page_access_token: Boolean(page.access_token) });
  return { ok: true, page: { id: page.id, name: page.name }, message: `Selected Facebook Page: ${page.name}.` };
}

function insightValue(insights, names) {
  const items = insights?.data || [];
  for (const name of names) {
    const item = items.find((entry) => entry.name === name);
    const raw = item?.values?.[0]?.value;
    if (typeof raw === "number") return raw;
    if (raw && typeof raw === "object") {
      if (raw["link clicks"] !== undefined) return Number(raw["link clicks"] || 0);
      if (raw.link_clicks !== undefined) return Number(raw.link_clicks || 0);
      if (raw.other !== undefined) return Number(raw.other || 0);
      if (raw.total !== undefined) return Number(raw.total || 0);
      return Object.values(raw).reduce((sum, value) => sum + Number(value || 0), 0);
    }
  }
  return 0;
}

function analyzeFacebookImage(post, message) {
  const text = `${message || ""} ${post.story || ""} ${post.name || ""}`.toLowerCase();
  const tags = [];
  const push = (label, regex) => {
    if (regex.test(text)) tags.push(label);
  };
  push("мужчина", /муж|сын|отец|дед|зять|брат|мужчина/i);
  push("женщина", /жен|мать|дочь|свекров|невест|бабуш|сестра|жена/i);
  push("пожилой человек", /пожил|стар|пенси|бабуш|дед|мать|свекров/i);
  push("семейная сцена", /сем|мать|сын|дочь|свекров|невест|родител|дет/i);
  push("конфликт", /ссор|измен|обид|тайн|наслед|молч|скандал|развод/i);
  push("радость", /радост|улыб|счаст|тепл|простил/i);
  push("кухня", /кухн|стол|чай|ужин/i);
  push("улица", /улиц|двор|дорог|останов/i);
  push("больница", /больниц|врач|палат|коридор/i);
  push("дом", /дом|квартир|комнат|подъезд/i);
  if (post.full_picture || post.image_url) tags.push("есть изображение");
  return {
    has_image: Boolean(post.full_picture || post.image_url),
    tags: [...new Set(tags)],
    people_hint: tags.includes("семейная сцена") ? "1-3 человека, семейная сцена" : tags.includes("пожилой человек") ? "пожилой персонаж" : "люди не определены",
    age_hint: tags.includes("пожилой человек") ? "55-75" : "40-65",
    emotion_hint: tags.includes("конфликт") ? "напряжение, тревога" : tags.includes("радость") ? "радость, семейное тепло" : detectEmotion(message),
    scene_hint: tags.find((tag) => ["кухня", "улица", "больница", "дом"].includes(tag)) || "бытовая сцена",
    realism_hint: post.full_picture || post.image_url ? "нужна ручная проверка реалистичности изображения" : "изображение не найдено"
  };
}

function enrichFacebookPostAnalysis(post) {
  const message = post.message || "";
  return {
    detected_topic: post.detected_topic || detectTopic(message),
    detected_emotion: post.detected_emotion || detectEmotion(message),
    image_analysis: post.image_analysis && Object.keys(post.image_analysis).length
      ? post.image_analysis
      : analyzeFacebookImage(post, message),
    text_length: message.length,
    paragraphs_count: message.split(/\n+/).filter((part) => part.trim()).length || 1
  };
}

function normalizeFacebookPost(post, existing) {
  const attachmentUrl = post.attachments?.data?.find((item) => item?.url)?.url || "";
  const likes = Number(post.reactions?.summary?.total_count || post.likes?.summary?.total_count || 0);
  const comments = Number(post.comments?.summary?.total_count || 0);
  const shares = Number(post.shares?.count || 0);
  const reach = Number(insightValue(post.insights, ["post_impressions_unique", "post_impressions"]) || 0);
  const linkClicks = Number(insightValue(post.insights, ["post_clicks_by_type", "post_clicks"]) || 0);
  const score = likes + comments * 3 + shares * 5 + linkClicks * 5;
  const now = new Date().toISOString();
  const analysis = enrichFacebookPostAnalysis({ ...existing, ...post, image_url: post.full_picture || attachmentUrl || existing?.image_url || "" });
  return {
    id: existing?.id || crypto.randomUUID(),
    facebook_post_id: post.id,
    message: post.message || "",
    permalink_url: post.permalink_url || "",
    image_url: post.full_picture || attachmentUrl || existing?.image_url || "",
    detected_topic: analysis.detected_topic,
    detected_emotion: analysis.detected_emotion,
    image_analysis: analysis.image_analysis,
    text_length: analysis.text_length,
    paragraphs_count: analysis.paragraphs_count,
    published_at: post.created_time || "",
    likes_count: likes,
    comments_count: comments,
    shares_count: shares,
    reach_count: reach,
    link_clicks_count: linkClicks,
    total_score: score,
    created_at: existing?.created_at || now,
    updated_at: now,
    // Backward-compatible aliases for older admin code during refreshes.
    created_time: post.created_time || "",
    likes,
    comments,
    shares,
    reach,
    link_clicks: linkClicks,
    score
  };
}

async function fetchFacebookPostInsights(postId, token) {
  const metrics = "post_impressions_unique,post_clicks,post_clicks_by_type";
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${postId}/insights?metric=${encodeURIComponent(metrics)}&access_token=${token}`;
  try {
    const { response, data } = await graphFetchJson(url, "post-insights", 12000);
    if (!response.ok || data.error) return { data: [] };
    return data;
  } catch {
    return { data: [] };
  }
}

async function checkFacebookConnection(req) {
  const config = facebookConfigStatus(req);
  if (!config.configured) {
    facebookLog("check", { selected_page_id: config.page_id, page_access_token: config.has_page_access_token, missing: config.missing });
    return {
      ok: false,
      configured: false,
      missing: config.missing,
      code: "facebook_config_missing",
      message: `Facebook Integration не настроена: ${config.missing.join(", ")}. Reconnect Facebook or set Page ID/Page Access Token.`
    };
  }

  const { pageId, pageAccessToken, pageAccessTokenSource } = facebookCredentials(req);
  if (!pageId) return { ok: false, code: "page_id_missing", message: "Facebook Page ID is missing. Select a Page after OAuth." };
  if (!pageAccessToken) return { ok: false, code: "page_access_token_missing", message: "Facebook Page Access Token is missing. Reconnect Facebook and grant Page permissions." };
  const token = encodeURIComponent(pageAccessToken);
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}?fields=id,name&access_token=${token}`;
  const { response, data } = await graphFetchJson(url, "check");
  facebookLog("check-token-source", { selected_page_id: pageId, page_token_source: pageAccessTokenSource });
  if (!response.ok || data.error) {
    return {
      ok: false,
      configured: true,
      code: "meta_api_error",
      meta_status: response.status,
      message: data.error?.message || "Meta Graph API вернул ошибку подключения."
    };
  }
  return {
    ok: true,
    configured: true,
    page: { id: data.id, name: data.name },
    message: `Подключение работает. Страница: ${data.name || data.id}.`
  };
}

async function fetchFacebookPostsPage(url, token, existingPosts) {
  const { response, data } = await graphFetchJson(url, "posts-page", 20000);
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message || "Meta Graph API could not load posts.");
    error.metaStatus = response.status;
    error.metaError = safeMetaErrorObject(data.error);
    throw error;
  }
  const postsWithInsights = await Promise.all((data.data || []).map(async (post) => ({
    ...post,
    insights: await fetchFacebookPostInsights(post.id, token)
  })));
  return {
    posts: postsWithInsights.map((post) => normalizeFacebookPost(post, existingPosts.find((item) => item.facebook_post_id === post.id))),
    next: data.paging?.next || ""
  };
}

function facebookPostsEndpoint(pageId, edge, fields = facebookFeedFields, limit = "25") {
  return metaEndpoint(`/${pageId}/${edge}`, {
    ...(fields ? { fields } : {}),
    limit
  });
}

async function requestFacebookPostsEdge(pageId, pageAccessToken, edge, limit = "25", fieldProfile = facebookPostFieldProfiles[0]) {
  const fields = fieldProfile.fields;
  const endpoint = facebookPostsEndpoint(pageId, edge, fields, limit);
  const params = new URLSearchParams({
    ...(fields ? { fields } : {}),
    limit,
    access_token: pageAccessToken
  });
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${pageId}/${edge}?${params.toString()}`;
  const { response, data } = await graphFetchJson(url, `posts-${edge}`, 20000);
  return {
    edge,
    endpoint,
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    field_profile: fieldProfile.name,
    fields,
    status: response.status,
    ok: response.ok && !data.error,
    error: safeMetaErrorObject(data.error),
    posts_count: Array.isArray(data.data) ? data.data.length : 0,
    data,
    paging_next: data.paging?.next || ""
  };
}

function publicPostsAttempt(attempt, pageId, tokenSource, pageTasks) {
  return {
    endpoint_name: attempt.edge,
    endpoint: attempt.endpoint,
    graph_api_version: attempt.graph_api_version,
    field_profile: attempt.field_profile,
    fields: attempt.fields,
    page_id: pageId,
    token_source: tokenSource,
    token_type: "page_access_token",
    page_tasks: pageTasks,
    status: attempt.status,
    ok: attempt.ok,
    error: attempt.error,
    posts_count: attempt.posts_count
  };
}

function graphDataCount(data) {
  if (Array.isArray(data?.data)) return data.data.length;
  if (data && typeof data === "object" && !data.error) return 1;
  return 0;
}

async function graphProbe({ label, path: graphPath, params = {}, token, tokenType, tokenSource, grantedScopes, pageId, pageTasks }) {
  const endpoint = metaEndpoint(graphPath, params);
  const base = {
    label,
    endpoint,
    status: null,
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    token_source: tokenSource,
    token_type: tokenType,
    granted_scopes: grantedScopes || [],
    page_id: pageId || "",
    page_tasks: pageTasks || [],
    meta_error: null,
    data_count: 0
  };
  if (!token) {
    return {
      ...base,
      code: "token_missing",
      meta_error: { message: `${tokenType} is missing for this probe.` }
    };
  }
  const url = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}${graphPath}?${new URLSearchParams({
    ...params,
    access_token: token
  }).toString()}`;
  const { response, data } = await graphFetchJson(url, `graph-test-${label}`, 20000);
  return {
    ...base,
    status: response.status,
    ok: response.ok && !data.error,
    meta_error: safeMetaErrorObject(data.error),
    data_count: graphDataCount(data),
    sample_keys: data && typeof data === "object" ? Object.keys(data).filter((key) => key !== "paging").slice(0, 12) : []
  };
}

async function runFacebookGraphTestFull(req, res) {
  const refresh = await refreshOAuthPageConnection(req, res);
  const connection = refresh.connection;
  const { pageId, pageAccessToken, pageAccessTokenSource } = facebookOAuthPageCredentialsFromConnection(connection);
  const userToken = connection.user_token || "";
  const userTokenDebug = await debugFacebookToken(userToken, "user");
  const pageTokenDebug = await debugFacebookToken(pageAccessToken, "page");
  const userScopes = userTokenDebug.debug?.scopes || connection.granted_permissions || [];
  const pageScopes = pageTokenDebug.debug?.scopes || [];
  const pageTasks = refresh.page_tasks || pageTasksForConnection(connection, pageId);
  const probes = [
    await graphProbe({
      label: "me_page_token",
      path: "/me",
      token: pageAccessToken,
      tokenType: "page_access_token",
      tokenSource: pageAccessTokenSource,
      grantedScopes: pageScopes,
      pageId,
      pageTasks
    }),
    await graphProbe({
      label: "me_accounts_user_token",
      path: "/me/accounts",
      params: { fields: "id,name,tasks,category,access_token" },
      token: userToken,
      tokenType: "user_access_token",
      tokenSource: userToken ? "oauth" : "",
      grantedScopes: userScopes,
      pageId,
      pageTasks
    }),
    await graphProbe({
      label: "page_object",
      path: `/${pageId}`,
      params: { fields: "id,name,category,fan_count" },
      token: pageAccessToken,
      tokenType: "page_access_token",
      tokenSource: pageAccessTokenSource,
      grantedScopes: pageScopes,
      pageId,
      pageTasks
    }),
    await graphProbe({
      label: "page_posts",
      path: `/${pageId}/posts`,
      params: { limit: "1" },
      token: pageAccessToken,
      tokenType: "page_access_token",
      tokenSource: pageAccessTokenSource,
      grantedScopes: pageScopes,
      pageId,
      pageTasks
    }),
    await graphProbe({
      label: "page_published_posts",
      path: `/${pageId}/published_posts`,
      params: { limit: "1" },
      token: pageAccessToken,
      tokenType: "page_access_token",
      tokenSource: pageAccessTokenSource,
      grantedScopes: pageScopes,
      pageId,
      pageTasks
    })
  ];
  const successfulReadEdge = probes.find((probe) =>
    ["page_posts", "page_published_posts"].includes(probe.label) && probe.ok
  );
  return {
    ok: Boolean(successfulReadEdge),
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    page_id: pageId,
    token_source: pageAccessTokenSource,
    token_type: "page_access_token",
    user_token_present: Boolean(userToken),
    page_token_present: Boolean(pageAccessToken),
    page_token_valid: Boolean(pageTokenDebug.debug?.is_valid),
    page_token_belongs_to_selected_page: Boolean(pageId && (pageTokenDebug.debug?.profile_id === pageId || pageTokenDebug.debug?.user_id === pageId)),
    page_tasks: pageTasks,
    me_accounts_refresh: {
      status: refresh.meta_status,
      error: refresh.meta_error,
      refreshed: refresh.refreshed,
      accounts: refresh.accounts || []
    },
    user_token_debug: userTokenDebug,
    page_token_debug: pageTokenDebug,
    successful_endpoint: successfulReadEdge?.endpoint || "",
    probes,
    final_diagnosis: successfulReadEdge ? null : {
      code_ok: true,
      token_valid: Boolean(pageTokenDebug.debug?.is_valid),
      permissions_granted: pageScopes.includes("pages_read_engagement") || userScopes.includes("pages_read_engagement"),
      likely_reason: "Meta accepted OAuth but rejected all Page read edges. This usually means the app needs Advanced Access/App Review for pages_read_engagement/read_insights, Page Public Content Access for public content, Live mode for non-role users, or Business Verification.",
      manual_steps: [
        "Meta Developers -> App Review -> Permissions and Features: search pages_read_engagement and request Advanced Access.",
        "Meta Developers -> App Review -> Permissions and Features: search read_insights and request Advanced Access if analytics are needed.",
        "Meta Developers -> App Review -> Permissions and Features: search Page Public Content Access and request it if reading public Page content is required.",
        "Meta Developers -> App settings -> Basic: confirm the app is Live for users outside app roles.",
        "Meta Developers -> Roles: confirm the Facebook account is Developer/Admin/Tester and also has Page tasks on the selected Page.",
        "Meta Business Settings: complete Business Verification if Meta asks for it during permission review."
      ]
    }
  };
}

async function debugFacebookPostsRequest(req) {
  const debugAll = await debugAllFacebookPostEndpoints(req);
  const firstAttempt = debugAll.attempts?.[0] || null;
  const successfulAttempt = debugAll.attempts?.find((attempt) => attempt.ok) || null;
  return {
    ok: Boolean(successfulAttempt),
    endpoint: successfulAttempt?.endpoint || firstAttempt?.endpoint || "",
    old_endpoint: debugAll.legacy_endpoint || "",
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    fields: facebookFeedFields,
    page_id: debugAll.page_id,
    token_source: debugAll.token_source,
    token_type: "page_access_token",
    uses_env_token: false,
    page_token_valid: debugAll.page_token_valid,
    page_token_belongs_to_selected_page: debugAll.page_token_belongs_to_selected_page,
    meta_status: successfulAttempt?.status || firstAttempt?.status || null,
    meta_error: successfulAttempt ? null : (firstAttempt?.error || null),
    posts_count: successfulAttempt?.posts_count || 0,
    selected_endpoint: successfulAttempt?.endpoint_name || "",
    attempts: debugAll.attempts,
    final_diagnosis: debugAll.final_diagnosis,
    message: successfulAttempt
      ? `Facebook ${successfulAttempt.endpoint_name} request works. Posts returned: ${successfulAttempt.posts_count}.`
      : debugAll.message
  };
}

async function debugAllFacebookPostEndpoints(req, res) {
  const refresh = await refreshOAuthPageConnection(req, res);
  const { pageId, pageAccessToken, pageAccessTokenSource } = facebookOAuthPageCredentialsFromConnection(refresh.connection);
  const userToken = refresh.connection.user_token || "";
  const userTokenDebug = await debugFacebookToken(userToken, "user");
  const pageTokenDebug = await debugFacebookToken(pageAccessToken, "page");
  let pageTokenMe = null;
  let pageTokenBelongsToSelectedPage = false;
  if (pageAccessToken) {
    const meUrl = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me?${new URLSearchParams({
      fields: "id,name",
      access_token: pageAccessToken
    }).toString()}`;
    const { response, data } = await graphFetchJson(meUrl, "posts-debug-page-token-me", 15000);
    pageTokenMe = {
      meta_status: response.status,
      id: data.id || "",
      name: data.name || "",
      error: safeMetaErrorObject(data.error)
    };
    pageTokenBelongsToSelectedPage = Boolean(pageId && data.id === pageId);
  }
  const base = {
    ok: false,
    graph_api_version: FACEBOOK_GRAPH_VERSION,
    page_id: pageId,
    token_source: pageAccessTokenSource,
    token_type: "page_access_token",
    uses_env_token: false,
    page_tasks: refresh.page_tasks || [],
    me_accounts: {
      status: refresh.meta_status,
      error: refresh.meta_error,
      accounts: refresh.accounts || []
    },
    page_token_refreshed_from_me_accounts: refresh.refreshed,
    user_token_present: Boolean(userToken),
    page_token_present: Boolean(pageAccessToken),
    page_token_valid: Boolean(pageTokenDebug.debug?.is_valid),
    page_token_belongs_to_selected_page: pageTokenBelongsToSelectedPage,
    page_token_me: pageTokenMe,
    user_token_debug: userTokenDebug,
    page_token_debug: pageTokenDebug,
    legacy_endpoint: pageId ? facebookPostsEndpoint(pageId, "posts", facebookLegacyPostsFields, "25") : "",
    attempts: [],
    selected_endpoint: "",
    posts_count: 0,
    final_diagnosis: null,
    message: ""
  };
  if (!pageId || !pageAccessToken) {
    return {
      ...base,
      code: "facebook_oauth_page_token_missing",
      message: "OAuth Page ID or OAuth Page Access Token is missing. Reconnect Facebook and select the Page again.",
      final_diagnosis: {
        code_ok: true,
        token_valid: base.page_token_valid,
        permissions_granted: false,
        likely_reason: "OAuth Page token is missing in this browser session.",
        manual_steps: ["Reconnect Facebook", "Select the target Page", "Run Debug Load Posts again"]
      }
    };
  }
  for (const edge of facebookPostEndpointOrder) {
    for (const fieldProfile of facebookPostFieldProfiles) {
      const attempt = await requestFacebookPostsEdge(pageId, pageAccessToken, edge, "25", fieldProfile);
      const publicAttempt = publicPostsAttempt(attempt, pageId, pageAccessTokenSource, refresh.page_tasks || []);
      base.attempts.push(publicAttempt);
      if (attempt.ok) {
        return {
          ...base,
          ok: true,
          selected_endpoint: edge,
          selected_field_profile: fieldProfile.name,
          posts_count: attempt.posts_count,
          message: `Facebook ${edge} request works with ${fieldProfile.name} fields. Posts returned: ${attempt.posts_count}.`
        };
      }
    }
  }
  return {
    ...base,
    code: "all_facebook_post_edges_failed",
    message: "All Facebook post read endpoints failed. Code path is using OAuth Page Access Token, but Meta rejected published_posts and posts.",
    final_diagnosis: {
      code_ok: true,
      token_valid: base.page_token_valid,
      token_belongs_to_selected_page: base.page_token_belongs_to_selected_page,
      permissions_granted: base.page_token_debug?.debug?.scopes?.includes("pages_read_engagement") || false,
      likely_reason: "Meta requires App Review, Live mode, Business verification, or Page Public Content Access for this app/page combination.",
      manual_steps: [
        "Meta Developers -> App Review -> Permissions and Features: request Advanced Access for pages_read_engagement and read_insights.",
        "Meta Developers -> App settings -> Basic: verify app is in Live mode when testing outside app roles.",
        "Meta Business verification: complete verification if Meta requires it for Page permissions.",
        "Permissions and Features: request Page Public Content Access if the app must read pages it does not fully manage.",
        "Roles: confirm the Facebook account is Admin/Developer/Tester and has Page tasks CREATE_CONTENT, MANAGE, MODERATE, ANALYZE."
      ]
    }
  };
}

async function loadFacebookPosts(req, options = {}) {
  const refresh = await refreshOAuthPageConnection(req, options.res);
  const { pageId, pageAccessToken, pageAccessTokenSource } = facebookOAuthPageCredentialsFromConnection(refresh.connection);
  const missing = [
    !pageId ? "OAuth Page ID" : "",
    !pageAccessToken ? "OAuth Page Access Token" : ""
  ].filter(Boolean);
  if (missing.length) {
    facebookLog("posts", {
      graph_api_version: FACEBOOK_GRAPH_VERSION,
      selected_page_id: pageId,
      page_token_source: pageAccessTokenSource,
      missing
    });
    return {
      ok: false,
      configured: false,
      missing,
      posts: [],
      code: "facebook_oauth_page_token_missing",
      message: `Cannot load posts: ${missing.join(", ")}. Reconnect Facebook and select the Page again. Load Page Posts uses only OAuth Page Access Token, not env token.`,
      diagnostics: {
        graph_api_version: FACEBOOK_GRAPH_VERSION,
        old_endpoint: pageId ? metaEndpoint(`/${pageId}/posts`, { fields: facebookLegacyPostsFields, limit: "25" }) : "",
        new_endpoint: pageId ? metaEndpoint(`/${pageId}/published_posts`, { fields: facebookFeedFields, limit: "25" }) : "",
        fallback_endpoint: pageId ? metaEndpoint(`/${pageId}/posts`, { fields: facebookFeedFields, limit: "25" }) : "",
        fields: facebookFeedFields,
        selected_page_id: pageId,
        token_type: "page_access_token",
        page_token_source: pageAccessTokenSource || "",
        page_tasks: refresh.page_tasks || [],
        me_accounts: {
          status: refresh.meta_status,
          error: refresh.meta_error,
          accounts: refresh.accounts || []
        },
        uses_env_token: false
      }
    };
  }
  const token = encodeURIComponent(pageAccessToken);
  const allPages = Boolean(options.allPages);
  const fields = facebookFeedFields;
  const limit = "25";
  const oldPostsEndpoint = metaEndpoint(`/${pageId}/posts`, { fields: facebookLegacyPostsFields, limit });
  const attempts = [];
  let selectedAttempt = null;
  for (const edge of facebookPostEndpointOrder) {
    for (const fieldProfile of facebookPostFieldProfiles) {
      const attempt = await requestFacebookPostsEdge(pageId, pageAccessToken, edge, limit, fieldProfile);
      const publicAttempt = publicPostsAttempt(attempt, pageId, pageAccessTokenSource, refresh.page_tasks || []);
      attempts.push(publicAttempt);
      facebookLog("posts-fallback-attempt", {
        graph_api_version: FACEBOOK_GRAPH_VERSION,
        endpoint_url: attempt.endpoint,
        field_profile: attempt.field_profile,
        selected_page_id: pageId,
        page_token_source: pageAccessTokenSource,
        page_tasks: (refresh.page_tasks || []).join(","),
        status: attempt.status,
        ok: attempt.ok,
        posts_count: attempt.posts_count,
        meta_error: attempt.error?.message || ""
      });
      if (attempt.ok) {
        selectedAttempt = attempt;
        break;
      }
    }
    if (selectedAttempt) break;
  }

  if (!selectedAttempt) {
    const pageTokenDebug = await debugFacebookToken(pageAccessToken, "page");
    return {
      ok: false,
      configured: true,
      posts: [],
      code: "all_facebook_post_edges_failed",
    message: "All Facebook post read endpoints failed. OAuth Page token is valid/granted, but Meta rejected published_posts and posts.",
      meta_status: attempts[0]?.status || null,
      diagnostics: {
        requested_scopes: facebookReadPermissions,
        selected_page_id: pageId,
        token_type: "page_access_token",
        page_token_source: pageAccessTokenSource,
        page_tasks: refresh.page_tasks || [],
        me_accounts: {
          status: refresh.meta_status,
          error: refresh.meta_error,
          accounts: refresh.accounts || []
        },
        uses_env_token: false,
        graph_api_version: FACEBOOK_GRAPH_VERSION,
        fields,
        attempts,
        page_token_debug: pageTokenDebug,
        final_diagnosis: {
          code_ok: true,
          token_valid: Boolean(pageTokenDebug.debug?.is_valid),
          permissions_granted: pageTokenDebug.debug?.scopes?.includes("pages_read_engagement") || false,
          likely_reason: "Meta requires App Review, Live mode, Business verification, or Page Public Content Access for this app/page combination.",
          manual_steps: [
            "Meta Developers -> App Review -> Permissions and Features: request Advanced Access for pages_read_engagement and read_insights.",
            "Meta Developers -> App settings -> Basic: verify app is Live if testing outside app roles.",
            "Meta Business verification: complete verification if Meta requires it for Page permissions.",
            "Permissions and Features: request Page Public Content Access if the app must read pages it does not fully manage.",
            "Roles: confirm the Facebook account is Admin/Developer/Tester and has Page tasks CREATE_CONTENT, MANAGE, MODERATE, ANALYZE."
          ]
        }
      }
    };
  }

  if (allPages) {
    const existingPosts = readFacebookPosts();
    let loaded = [];
    try {
      const firstPostsWithInsights = await Promise.all((selectedAttempt.data.data || []).map(async (post) => ({
        ...post,
        insights: await fetchFacebookPostInsights(post.id, token)
      })));
      loaded = firstPostsWithInsights.map((post) => normalizeFacebookPost(post, existingPosts.find((item) => item.facebook_post_id === post.id)));
    } catch (error) {
      return {
        ok: false,
        configured: true,
        posts: [],
        code: "facebook_posts_normalize_failed",
        message: safeMetaError(error),
        diagnostics: { selected_endpoint: selectedAttempt.edge, attempts }
      };
    }
    let nextUrl = selectedAttempt.paging_next;
    let pages = 1;
    const maxPages = Number(process.env.FACEBOOK_SYNC_MAX_PAGES || 25);
    try {
      while (nextUrl && pages < maxPages) {
        const page = await fetchFacebookPostsPage(nextUrl, token, [...existingPosts, ...loaded]);
        loaded.push(...page.posts);
        nextUrl = page.next;
        pages += 1;
      }
    } catch (error) {
      return {
        ok: false,
        configured: true,
        posts: [],
        code: "meta_api_error",
        message: error.message || "Meta Graph API could not load historical posts.",
        meta_status: error.metaStatus || null,
        diagnostics: {
          graph_api_version: FACEBOOK_GRAPH_VERSION,
          selected_endpoint: selectedAttempt.edge,
          endpoint: selectedAttempt.endpoint,
          fields,
          selected_page_id: pageId,
          token_type: "page_access_token",
          page_token_source: pageAccessTokenSource,
          page_tasks: refresh.page_tasks || [],
          uses_env_token: false,
          meta_status: error.metaStatus || null,
          meta_error: error.metaError || null,
          attempts
        }
      };
    }
    const posts = loaded.sort((a, b) => b.total_score - a.total_score);
    const merged = [
      ...posts,
      ...existingPosts.filter((item) => !posts.some((post) => post.facebook_post_id === item.facebook_post_id))
    ].sort((a, b) => b.total_score - a.total_score);
    writeFacebookPosts(merged);
    await updateProjectBrain();
    return {
      ok: true,
      configured: true,
      posts: merged,
      summary: { count: merged.length, loaded: posts.length, pages, best_score: merged[0]?.total_score || 0, selected_endpoint: selectedAttempt.edge, selected_field_profile: selectedAttempt.field_profile },
      message: `Historical sync complete via ${selectedAttempt.edge} (${selectedAttempt.field_profile}). Loaded posts: ${posts.length}, API pages: ${pages}. Project Brain updated.`
    };
  }

  const data = selectedAttempt.data;

  const existingPosts = readFacebookPosts();
  const postsWithInsights = await Promise.all((data.data || []).map(async (post) => ({
    ...post,
    insights: await fetchFacebookPostInsights(post.id, token)
  })));
  const posts = postsWithInsights
    .map((post) => normalizeFacebookPost(post, existingPosts.find((item) => item.facebook_post_id === post.id)))
    .sort((a, b) => b.total_score - a.total_score);
  const merged = [
    ...posts,
    ...existingPosts.filter((item) => !posts.some((post) => post.facebook_post_id === item.facebook_post_id))
  ].sort((a, b) => b.total_score - a.total_score);
  writeFacebookPosts(merged);
  await updateProjectBrain();
  return {
    ok: true,
    configured: true,
    posts: merged,
    summary: {
      count: merged.length,
      best_score: merged[0]?.total_score || 0,
      loaded: posts.length,
      selected_endpoint: selectedAttempt.edge,
      selected_field_profile: selectedAttempt.field_profile,
      attempts
    },
    message: `Загружено и сохранено постов: ${posts.length}. Таблица отсортирована по лучшим результатам.`
  };
}

function send(res, status, body, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload is too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/telegram/status" && req.method === "GET") {
    return sendJson(res, 200, telegramConfigStatus());
  }

  if (pathname === "/api/stories" && req.method === "GET") {
    return sendJson(res, 200, readStories().map((story) => storySummary(story, req)));
  }

  if (pathname === "/api/ai/story-writer" && req.method === "POST") {
    return sendJson(res, 200, buildStoryDraft(await parseBody(req), req));
  }

  if (pathname === "/api/ai/human-rewriter" && req.method === "POST") {
    const payload = await parseBody(req);
    return sendJson(res, 200, { rewritten_text: humanRewrite(payload.text) });
  }

  if (pathname === "/api/ai/image-creator" && req.method === "POST") {
    return sendJson(res, 200, buildImagePrompt(await parseBody(req)));
  }

  if (pathname === "/api/ai/facebook-post-optimizer" && req.method === "POST") {
    return sendJson(res, 200, optimizeFacebookPost(await parseBody(req)));
  }

  if (pathname === "/api/ai/comment-link-creator" && req.method === "POST") {
    return sendJson(res, 200, createCommentLink(await parseBody(req)));
  }

  if (pathname === "/api/ai/website-story-optimizer" && req.method === "POST") {
    return sendJson(res, 200, optimizeWebsiteStory(await parseBody(req)));
  }

  if (pathname === "/api/facebook/check" && req.method === "GET") {
    return sendJson(res, 200, await checkFacebookConnection(req));
  }

  if (pathname === "/api/facebook/status" && req.method === "GET") {
    return sendJson(res, 200, {
      ...facebookConfigStatus(req),
      stored_posts: readFacebookPosts().length,
      last_sync_at: readProjectBrain().updated_at || null
    });
  }

  if (pathname === "/api/facebook/permissions" && req.method === "GET") {
    try {
      return sendJson(res, 200, {
        ok: true,
        ...(await loadFacebookPermissionDiagnostics(req))
      });
    } catch (error) {
      return sendJson(res, 200, {
        ok: false,
        code: "permission_diagnostics_failed",
        message: safeMetaError(error)
      });
    }
  }

  if (pathname === "/api/facebook/token-debug" && req.method === "GET") {
    try {
      return sendJson(res, 200, await loadFacebookTokenDebug(req));
    } catch (error) {
      return sendJson(res, 200, {
        ok: false,
        code: "token_debug_failed",
        message: safeMetaError(error)
      });
    }
  }

  if (pathname === "/api/facebook/meta-config" && req.method === "GET") {
    return sendJson(res, 200, metaConfigSummary(req));
  }

  if (pathname === "/api/facebook/test-redirect" && req.method === "GET") {
    const redirectUri = configuredRedirectUri(req);
    const isLocalCallback = /^https?:\/\/(127\.0\.0\.1|localhost):4173\/auth\/facebook\/callback$/.test(redirectUri);
    return sendJson(res, 200, {
      ok: isLocalCallback,
      redirect_uri: redirectUri,
      message: isLocalCallback
        ? "OAuth Redirect URI выглядит правильно для локального проекта."
        : "Проверьте FACEBOOK_REDIRECT_URI. Для локального проекта используйте http://127.0.0.1:4173/auth/facebook/callback"
    });
  }

  if (pathname === "/api/facebook/posts" && req.method === "GET") {
    return sendJson(res, 200, await loadFacebookPosts(req, { res }));
  }

  if (pathname === "/api/facebook/posts-debug" && req.method === "GET") {
    try {
      return sendJson(res, 200, await debugFacebookPostsRequest(req));
    } catch (error) {
      return sendJson(res, 200, {
        ok: false,
        code: "posts_debug_failed",
        message: safeMetaError(error)
      });
    }
  }

  if (pathname === "/api/facebook/posts-debug-all" && req.method === "GET") {
    try {
      return sendJson(res, 200, await debugAllFacebookPostEndpoints(req, res));
    } catch (error) {
      return sendJson(res, 200, {
        ok: false,
        code: "posts_debug_all_failed",
        message: safeMetaError(error)
      });
    }
  }

  if (pathname === "/api/facebook/graph-test-full" && req.method === "GET") {
    try {
      return sendJson(res, 200, await runFacebookGraphTestFull(req, res));
    } catch (error) {
      return sendJson(res, 200, {
        ok: false,
        code: "graph_test_full_failed",
        message: safeMetaError(error)
      });
    }
  }

  if (pathname === "/api/facebook/refresh" && req.method === "GET") {
    return sendJson(res, 200, await loadFacebookPosts(req, { res }));
  }

  if (pathname === "/api/facebook/sync" && req.method === "GET") {
    return sendJson(res, 200, await loadFacebookPosts(req, { allPages: true, res }));
  }

  if (pathname === "/api/facebook/select-page" && req.method === "POST") {
    const payload = await parseBody(req);
    return sendJson(res, 200, selectFacebookPage(req, res, String(payload.page_id || "")));
  }

  if (pathname === "/api/facebook/analyze" && req.method === "GET") {
    const brain = await updateProjectBrain();
    return sendJson(res, 200, {
      ok: true,
      message: "Audience Analyst, Project Brain and AI Autopilot updated from loaded Facebook data.",
      audience: buildAudienceInsights(),
      project_brain: brain
    });
  }

  if (pathname === "/api/audience-insights" && req.method === "GET") {
    return sendJson(res, 200, buildAudienceInsights());
  }

  if (pathname === "/api/real-data-layer" && req.method === "GET") {
    return sendJson(res, 200, buildRealDataLayer());
  }

  if (pathname === "/api/competitors" && req.method === "GET") {
    return sendJson(res, 200, readCompetitors());
  }

  if (pathname === "/api/competitors" && req.method === "POST") {
    const result = createCompetitor(await parseBody(req));
    if (result.error) return sendJson(res, 422, result);
    await updateProjectBrain();
    return sendJson(res, 200, result);
  }

  if (pathname === "/api/competitor-analysis" && req.method === "GET") {
    return sendJson(res, 200, buildCompetitorAnalysis());
  }

  if (pathname === "/api/project-brain" && req.method === "GET") {
    return sendJson(res, 200, readProjectBrain());
  }

  if (pathname === "/api/security-audit" && req.method === "GET") {
    return sendJson(res, 200, securityAudit());
  }

  if (pathname === "/api/autopilot/refresh-brain" && req.method === "POST") {
    return sendJson(res, 200, await updateProjectBrain());
  }

  if (pathname === "/api/stories" && req.method === "POST") {
    const payload = await parseBody(req);
    const stories = readStories();
    const now = new Date().toISOString();
    const existing = payload.id ? stories.find((story) => story.id === payload.id) : null;
    const id = existing?.id || crypto.randomUUID();
    const slug = uniqueSlug(payload.title, stories, id);
    const code = existing?.short_code || shortCode();
    const story = {
      id,
      title: String(payload.title || "").trim(),
      slug,
      short_code: code,
      category: categories.includes(payload.category) ? payload.category : categories[0],
      image: String(payload.image || "/assets/default-story-cover.png").trim() || "/assets/default-story-cover.png",
      facebook_text: String(payload.facebook_text || "").trim(),
      website_text: String(payload.website_text || "").trim(),
      comment_text: `Продолжение истории читайте здесь: /s/${code}`,
      status: normalizeStoryStatus(payload.status, existing?.status || "draft"),
      views: Number(existing?.views || 0),
      clicks: Number(existing?.clicks || 0),
      created_at: existing?.created_at || now,
      updated_at: now,
      ai_assistant_notes: String(payload.ai_assistant_notes || "").trim()
    };

    if (!story.title || !story.facebook_text || !story.website_text) {
      return sendJson(res, 422, { error: "Заполните заголовок, Facebook-текст и продолжение." });
    }

    const nextStories = existing
      ? stories.map((item) => item.id === id ? story : item)
      : [story, ...stories];
    writeStories(nextStories);
    await updateProjectBrain();
    return sendJson(res, 200, storySummary(story, req));
  }

  return sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(res, pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, clean.replace(/^[/\\]/, ""));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  send(res, 200, fs.readFileSync(filePath), types[ext] || "application/octet-stream");
  return true;
}

async function router(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) return handleApi(req, res, pathname);
    if (pathname.startsWith("/assets/") || pathname === "/styles.css" || pathname === "/admin.js") {
      if (serveStatic(res, pathname)) return;
    }
    if (pathname === "/auth/facebook/start") return startFacebookOAuth(req, res);
    if (pathname === "/auth/facebook/callback") return handleFacebookOAuthCallback(req, res, url);
    if (pathname === "/") return send(res, 200, renderHome());
    if (pathname === "/admin") return send(res, 200, renderAdmin());
    if (pathname === "/facebook-setup-wizard") return send(res, 200, renderFacebookSetupWizard(req));
    if (pathname === "/facebook-connect") return send(res, 200, renderFacebookConnect(url, req));
    if (pathname === "/audience-insights") return send(res, 200, renderAudienceInsights());
    if (pathname === "/telegram-center") return send(res, 200, renderTelegramCenter());
    if (pathname === "/ai-autopilot") return send(res, 200, renderAutopilotDashboard());
    if (pathname === "/production-status") return send(res, 200, renderProductionStatus());

    if (pathname.startsWith("/s/")) {
      const code = pathname.split("/").filter(Boolean)[1];
      const stories = readStories();
      const story = stories.find((item) => item.short_code === code);
      if (!story) return send(res, 404, layout("История не найдена", `${renderHeader()}<main class="empty-state"><h1>Ссылка не найдена</h1></main>`));
      story.clicks = Number(story.clicks || 0) + 1;
      story.updated_at = new Date().toISOString();
      writeStories(stories.map((item) => item.id === story.id ? story : item));
      res.writeHead(302, { location: `/story/${story.slug}` });
      return res.end();
    }

    if (pathname.startsWith("/story/")) {
      const slug = pathname.split("/").filter(Boolean)[1];
      const story = readStories().find((item) => item.slug === slug && item.status === "published");
      if (!story) return send(res, 404, layout("История не найдена", `${renderHeader()}<main class="empty-state"><h1>История не найдена</h1></main>`));
      return send(res, 200, renderStory(req, story));
    }

    return send(res, 404, layout("Страница не найдена", `${renderHeader()}<main class="empty-state"><h1>Страница не найдена</h1></main>`));
  } catch (error) {
    send(res, 500, layout("Ошибка", `${renderHeader()}<main class="empty-state"><h1>Ошибка сервера</h1><p>${escapeHtml(error.message)}</p></main>`));
  }
}

let storageReadyPromise = null;

function ensureStorageReady() {
  if (!storageReadyPromise) {
    storageReadyPromise = initializeStorage();
  }
  return storageReadyPromise;
}

async function vercelHandler(req, res) {
  await ensureStorageReady();
  return router(req, res);
}

if (require.main === module) {
  ensureStorageReady().then(() => {
    http.createServer(router).listen(PORT, "0.0.0.0", () => {
      console.log(`AI Story Traffic Platform MVP: http://localhost:${PORT} (${storageMode})`);
      startTelegramControlCenter();
    });
  });
}

module.exports = vercelHandler;
module.exports.router = router;
module.exports.ensureStorageReady = ensureStorageReady;
