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
const INTERNET_RESEARCH_FILE = path.join(ROOT, "data", "internet_research.json");
const RESEARCH_STORIES_FILE = path.join(ROOT, "data", "research_stories.json");
const STORY_DNA_FILE = path.join(ROOT, "data", "story_dna.json");
const GENERATED_STORIES_FILE = path.join(ROOT, "data", "generated_stories.json");
const STORY_IDEAS_FILE = path.join(ROOT, "data", "story_ideas.json");
const IMAGE_QUEUE_FILE = path.join(ROOT, "data", "image_queue.json");
const CONTENT_PLAN_FILE = path.join(ROOT, "data", "content_plan.json");
const SCHEDULED_POSTS_FILE = path.join(ROOT, "data", "scheduled_posts.json");
const PUBLISHING_PACKAGES_FILE = path.join(ROOT, "data", "publishing_packages.json");
const STYLE_BRAIN_PROFILES_FILE = path.join(ROOT, "data", "style_brain_profiles.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const ENV_FILE = path.join(ROOT, ".env");
const FACEBOOK_CONNECTION_COOKIE = "astp_fb_conn";
const FACEBOOK_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const FACEBOOK_GRAPH_VERSION = "v20.0";
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || "https://ai-story-traffic-platform.vercel.app/api/telegram/webhook";
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
    name: "engagement",
    fields: facebookFeedFields
  },
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
const facebookPostEndpointOrder = ["published_posts"];

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

const researchCategories = [
  "betrayal",
  "mother in law",
  "inheritance",
  "love",
  "war",
  "poverty to wealth",
  "unexpected ending",
  "family conflict",
  "kindness",
  "revenge"
];

const researchSourceProfiles = [
  { source: "Reddit", query: "site:reddit.com/r/relationships OR site:reddit.com/r/TrueOffMyChest" },
  { source: "News", query: "site:people.com OR site:bbc.com OR site:apnews.com" },
  { source: "Public story websites", query: "site:lovewhatmatters.com OR site:rd.com/list/true-stories" },
  { source: "Forums", query: "site:mumsnet.com OR site:city-data.com/forum" },
  { source: "Facebook public pages", query: "site:facebook.com story public post" },
  { source: "Quora", query: "site:quora.com" }
];

const researchQueryByCategory = {
  betrayal: "betrayal life story",
  "mother in law": "mother in law family story",
  inheritance: "inheritance family conflict story",
  love: "love lost and found story",
  war: "war true family story",
  "poverty to wealth": "poverty to wealth life story",
  "unexpected ending": "unexpected ending true story",
  "family conflict": "family conflict emotional story",
  kindness: "kindness emotional true story",
  revenge: "revenge family story"
};

const researchProviderOrder = [
  { id: "tavily", name: "Tavily API", env: "TAVILY_API_KEY" },
  { id: "brave", name: "Brave Search API", env: "BRAVE_SEARCH_API_KEY" },
  { id: "serpapi", name: "SerpAPI", env: "SERPAPI_KEY" },
  { id: "bing", name: "Bing Search API", env: "BING_SEARCH_API_KEY" }
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

function autopilotV1BrainState() {
  return readProjectBrain().internet_research?.autopilot_v1 || {};
}

function readAutopilotV1Collection(cacheKey, brainKey) {
  const brainItems = autopilotV1BrainState()[brainKey];
  if (Array.isArray(brainItems) && brainItems.length) return brainItems;
  return storageCache[cacheKey] || [];
}

async function writeAutopilotV1Collection(cacheKey, filePath, brainKey, items) {
  storageCache[cacheKey] = items;
  writeJsonBackup(filePath, items);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object"
    ? brain.internet_research
    : {};
  brain.internet_research = {
    ...currentResearch,
    autopilot_v1: {
      ...(currentResearch.autopilot_v1 || {}),
      [brainKey]: items,
      updated_at: new Date().toISOString()
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return items;
}

function readInternetResearchItems() {
  return readAutopilotV1Collection("internetResearchItems", "internet_research_items");
}

async function writeInternetResearchItems(items) {
  return writeAutopilotV1Collection("internetResearchItems", INTERNET_RESEARCH_FILE, "internet_research_items", items);
}

function readResearchStories() {
  const brainItems = autopilotV1BrainState().research_stories;
  if (Array.isArray(brainItems) && brainItems.length) return brainItems;
  return storageCache.researchStories || [];
}

async function writeResearchStories(stories) {
  const safeStories = stories.map((story) => {
    const { snippet, raw_content, content, full_text, ...safeStory } = story || {};
    return safeStory;
  });
  storageCache.researchStories = safeStories;
  writeJsonBackup(RESEARCH_STORIES_FILE, safeStories);
  await persistResearchStories(safeStories);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object"
    ? brain.internet_research
    : {};
  brain.internet_research = {
    ...currentResearch,
    autopilot_v1: {
      ...(currentResearch.autopilot_v1 || {}),
      research_stories: safeStories.slice(0, 100),
      updated_at: new Date().toISOString()
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  await learnStoryDnaFromResearchStories(safeStories);
  await autoSyncProjectBrainV2({ sources: ["research"], reason: "research_saved" });
  return safeStories;
}

function readStoryDna() {
  return storageCache.storyDna || [];
}

async function writeStoryDna(items) {
  storageCache.storyDna = items;
  writeJsonBackup(STORY_DNA_FILE, items);
  await persistStoryDna(items);
  return items;
}

function readStoryIdeas() {
  return readAutopilotV1Collection("storyIdeas", "story_ideas");
}

async function writeStoryIdeas(items) {
  return writeAutopilotV1Collection("storyIdeas", STORY_IDEAS_FILE, "story_ideas", items);
}

function readGeneratedStories() {
  return readAutopilotV1Collection("generatedStories", "generated_stories");
}

async function writeGeneratedStories(items) {
  storageCache.generatedStories = items;
  writeJsonBackup(GENERATED_STORIES_FILE, items);
  await persistGeneratedStories(items);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object"
    ? brain.internet_research
    : {};
  brain.internet_research = {
    ...currentResearch,
    autopilot_v1: {
      ...(currentResearch.autopilot_v1 || {}),
      generated_stories: items.slice(0, 100),
      updated_at: new Date().toISOString()
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return items;
}

function readImageQueue() {
  return readAutopilotV1Collection("imageQueue", "image_queue");
}

async function writeImageQueue(items) {
  return writeAutopilotV1Collection("imageQueue", IMAGE_QUEUE_FILE, "image_queue", items);
}

function readContentPlan() {
  return readAutopilotV1Collection("contentPlan", "content_plan");
}

async function writeContentPlan(items) {
  return writeAutopilotV1Collection("contentPlan", CONTENT_PLAN_FILE, "content_plan", items);
}

function readScheduledPosts() {
  return readAutopilotV1Collection("scheduledPosts", "scheduled_posts");
}

async function writeScheduledPosts(items) {
  storageCache.scheduledPosts = items;
  writeJsonBackup(SCHEDULED_POSTS_FILE, items);
  await persistScheduledPosts(items);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object"
    ? brain.internet_research
    : {};
  brain.internet_research = {
    ...currentResearch,
    autopilot_v1: {
      ...(currentResearch.autopilot_v1 || {}),
      scheduled_posts: items.slice(0, 120),
      updated_at: new Date().toISOString()
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return items;
}

function readPublishingPackages() {
  return readAutopilotV1Collection("publishingPackages", "publishing_packages");
}

async function writePublishingPackages(items) {
  storageCache.publishingPackages = items;
  writeJsonBackup(PUBLISHING_PACKAGES_FILE, items);
  await persistPublishingPackages(items);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object"
    ? brain.internet_research
    : {};
  brain.internet_research = {
    ...currentResearch,
    autopilot_v1: {
      ...(currentResearch.autopilot_v1 || {}),
      publishing_packages: items.slice(0, 120),
      updated_at: new Date().toISOString()
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return items;
}

function readStyleBrainProfiles() {
  return storageCache.styleBrainProfiles || [];
}

async function writeStyleBrainProfiles(items) {
  storageCache.styleBrainProfiles = items;
  writeJsonBackup(STYLE_BRAIN_PROFILES_FILE, items);
  await persistStyleBrainProfiles(items);
  return items;
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
  internetResearchItems: readJsonArray(INTERNET_RESEARCH_FILE),
  researchStories: readJsonArray(RESEARCH_STORIES_FILE),
  storyDna: readJsonArray(STORY_DNA_FILE),
  generatedStories: readJsonArray(GENERATED_STORIES_FILE),
  storyIdeas: readJsonArray(STORY_IDEAS_FILE),
  imageQueue: readJsonArray(IMAGE_QUEUE_FILE),
  contentPlan: readJsonArray(CONTENT_PLAN_FILE),
  scheduledPosts: readJsonArray(SCHEDULED_POSTS_FILE),
  publishingPackages: readJsonArray(PUBLISHING_PACKAGES_FILE),
  styleBrainProfiles: readJsonArray(STYLE_BRAIN_PROFILES_FILE),
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
    await ensureResearchStoriesTable();
    await ensureStoryDnaTable();
    await ensureGeneratedStoriesTable();
    await ensureScheduledPostsTable();
    await ensurePublishingPackagesTable();
    await ensureStyleBrainProfilesTable();
    storageMode = "postgres";
    storageCache.stories = (await pgPool.query("select * from stories order by created_at desc")).rows;
    storageCache.facebookPosts = (await pgPool.query("select * from facebook_posts order by total_score desc, published_at desc")).rows;
    storageCache.competitors = (await pgPool.query("select * from competitors order by created_at desc")).rows.map((row) => ({
      ...row,
      followers_count: row.followers_count || 0,
      category: row.category || "Facebook-страница"
    }));
    storageCache.researchStories = (await pgPool.query("select * from research_stories order by viral_score desc, similarity_score desc, created_at desc limit 500")).rows.map((row) => ({
      ...row,
      keywords: Array.isArray(row.keywords) ? row.keywords : []
    }));
    storageCache.storyDna = (await pgPool.query("select * from story_dna order by viral_score desc, engagement_score desc, created_at desc limit 1000")).rows.map(normalizeStoryDnaRow);
    storageCache.generatedStories = (await pgPool.query("select * from generated_stories order by created_at desc limit 200")).rows.map((row) => ({
      ...row,
      research_signals: Array.isArray(row.research_signals) ? row.research_signals : [],
      facebook_signals: Array.isArray(row.facebook_signals) ? row.facebook_signals : []
    }));
    storageCache.scheduledPosts = (await pgPool.query("select * from scheduled_posts order by scheduled_time asc, created_at desc limit 300")).rows;
    storageCache.publishingPackages = (await pgPool.query("select * from publishing_packages order by created_at desc limit 300")).rows;
    storageCache.styleBrainProfiles = (await pgPool.query("select * from style_brain_profiles order by created_at desc limit 1200")).rows.map(normalizeStyleBrainProfileRow);
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

async function ensureResearchStoriesTable() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists research_stories (
      id text primary key,
      title text not null,
      url text not null unique,
      source text,
      summary text,
      emotion text,
      keywords jsonb not null default '[]'::jsonb,
      viral_score integer not null default 0,
      similarity_score integer not null default 0,
      category text,
      emotional_intensity integer not null default 0,
      story_structure text,
      surprise_factor integer not null default 0,
      source_status text,
      provider text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table research_stories add column if not exists source_status text;
    alter table research_stories add column if not exists provider text;
    create index if not exists research_stories_viral_score_idx on research_stories (viral_score desc);
    create index if not exists research_stories_similarity_score_idx on research_stories (similarity_score desc);
    create index if not exists research_stories_category_idx on research_stories (category);
  `);
}

async function ensureStoryDnaTable() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists story_dna (
      id text primary key,
      source_type text not null default 'website',
      source_reference text not null unique,
      emotion text,
      main_theme text,
      secondary_theme text,
      hook_type text,
      conflict_type text,
      twist_type text,
      ending_type text,
      characters jsonb not null default '[]'::jsonb,
      age_group text,
      family_structure text,
      dialogue_density integer not null default 0,
      story_length text,
      emotion_curve jsonb not null default '[]'::jsonb,
      viral_score integer not null default 0,
      engagement_score integer not null default 0,
      comments_score integer not null default 0,
      shares_score integer not null default 0,
      originality_score integer not null default 100,
      structure_analysis jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    alter table story_dna add column if not exists structure_analysis jsonb not null default '{}'::jsonb;
    create index if not exists story_dna_source_type_idx on story_dna (source_type);
    create index if not exists story_dna_emotion_idx on story_dna (emotion);
    create index if not exists story_dna_main_theme_idx on story_dna (main_theme);
    create index if not exists story_dna_hook_type_idx on story_dna (hook_type);
    create index if not exists story_dna_viral_score_idx on story_dna (viral_score desc);
  `);
}

async function ensureGeneratedStoriesTable() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists generated_stories (
      id text primary key,
      title text not null,
      category text,
      emotion text,
      length text,
      hook text,
      full_story text,
      moral text,
      image_prompt text,
      viral_prediction_score integer not null default 0,
      why_it_should_work text,
      research_signals jsonb not null default '[]'::jsonb,
      facebook_signals jsonb not null default '[]'::jsonb,
      status text not null default 'needs_approval',
      approval_required boolean not null default true,
      publish_allowed boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists generated_stories_category_idx on generated_stories (category);
    create index if not exists generated_stories_score_idx on generated_stories (viral_prediction_score desc);
    create index if not exists generated_stories_created_at_idx on generated_stories (created_at desc);
  `);
}

async function ensureScheduledPostsTable() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists scheduled_posts (
      id text primary key,
      draft_id text not null,
      image_prompt_id text,
      scheduled_time timestamptz not null,
      theme text,
      emotion text,
      status text not null default 'draft',
      title text,
      rhythm_step text,
      publish_allowed boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists scheduled_posts_time_idx on scheduled_posts (scheduled_time asc);
    create index if not exists scheduled_posts_status_idx on scheduled_posts (status);
    create index if not exists scheduled_posts_draft_idx on scheduled_posts (draft_id);
  `);
}

async function ensurePublishingPackagesTable() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists publishing_packages (
      id text primary key,
      draft_id text not null,
      image_prompt_id text,
      schedule_id text,
      status text not null default 'review',
      publish_allowed boolean not null default false,
      approval_required boolean not null default true,
      created_at timestamptz not null default now(),
      approved_at timestamptz
    );
    create index if not exists publishing_packages_status_idx on publishing_packages (status);
    create index if not exists publishing_packages_created_at_idx on publishing_packages (created_at desc);
    create index if not exists publishing_packages_draft_idx on publishing_packages (draft_id);
  `);
}

async function ensureStyleBrainProfilesTable() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists style_brain_profiles (
      id text primary key,
      source_type text not null,
      source_reference text not null unique,
      hook_strength integer not null default 0,
      opening_style text,
      dialogue_density integer not null default 0,
      sentence_rhythm text,
      paragraph_rhythm text,
      emotional_intensity integer not null default 0,
      emotion_curve jsonb not null default '[]'::jsonb,
      conflict_speed integer not null default 0,
      twist_strength integer not null default 0,
      ending_strength integer not null default 0,
      human_realism_score integer not null default 0,
      boring_risk integer not null default 0,
      facebook_readability_score integer not null default 0,
      created_at timestamptz not null default now()
    );
    create index if not exists style_brain_profiles_source_type_idx on style_brain_profiles (source_type);
    create index if not exists style_brain_profiles_hook_strength_idx on style_brain_profiles (hook_strength desc);
    create index if not exists style_brain_profiles_human_realism_idx on style_brain_profiles (human_realism_score desc);
    create index if not exists style_brain_profiles_boring_risk_idx on style_brain_profiles (boring_risk asc);
    create index if not exists style_brain_profiles_readability_idx on style_brain_profiles (facebook_readability_score desc);
  `);
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

async function persistResearchStories(stories) {
  if (!pgPool) return;
  try {
    await ensureResearchStoriesTable();
    for (const story of stories) {
      await pgPool.query(
        `insert into research_stories (
          id, title, url, source, summary, emotion, keywords, viral_score, similarity_score,
          category, emotional_intensity, story_structure, surprise_factor, source_status, provider, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        on conflict (url) do update set
          title = excluded.title,
          source = excluded.source,
          summary = excluded.summary,
          emotion = excluded.emotion,
          keywords = excluded.keywords,
          viral_score = excluded.viral_score,
          similarity_score = excluded.similarity_score,
          category = excluded.category,
          emotional_intensity = excluded.emotional_intensity,
          story_structure = excluded.story_structure,
          surprise_factor = excluded.surprise_factor,
          source_status = excluded.source_status,
          provider = excluded.provider,
          updated_at = excluded.updated_at`,
        [
          story.id || crypto.randomUUID(),
          story.title || "",
          story.url || story.source_url || "",
          story.source || "",
          story.summary || "",
          story.emotion || story.emotional_angle || "",
          JSON.stringify(Array.isArray(story.keywords) ? story.keywords : []),
          Number(story.viral_score || 0),
          Number(story.similarity_score || 0),
          story.category || "",
          Number(story.emotional_intensity || 0),
          story.story_structure || "",
          Number(story.surprise_factor || 0),
          story.source_status || "",
          story.provider || "",
          pgColumnDate(story.created_at),
          pgColumnDate(story.updated_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL research_stories persist failed: ${error.message}`);
  }
}

function normalizeStoryDnaRow(row = {}) {
  return {
    ...row,
    characters: Array.isArray(row.characters) ? row.characters : [],
    emotion_curve: Array.isArray(row.emotion_curve) ? row.emotion_curve : [],
    structure_analysis: row.structure_analysis && typeof row.structure_analysis === "object" ? row.structure_analysis : {}
  };
}

async function persistStoryDna(items) {
  if (!pgPool) return;
  try {
    await ensureStoryDnaTable();
    for (const item of items) {
      await pgPool.query(
        `insert into story_dna (
          id, source_type, source_reference, emotion, main_theme, secondary_theme,
          hook_type, conflict_type, twist_type, ending_type, characters, age_group,
          family_structure, dialogue_density, story_length, emotion_curve, viral_score,
          engagement_score, comments_score, shares_score, originality_score, structure_analysis, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        on conflict (source_reference) do update set
          source_type = excluded.source_type,
          emotion = excluded.emotion,
          main_theme = excluded.main_theme,
          secondary_theme = excluded.secondary_theme,
          hook_type = excluded.hook_type,
          conflict_type = excluded.conflict_type,
          twist_type = excluded.twist_type,
          ending_type = excluded.ending_type,
          characters = excluded.characters,
          age_group = excluded.age_group,
          family_structure = excluded.family_structure,
          dialogue_density = excluded.dialogue_density,
          story_length = excluded.story_length,
          emotion_curve = excluded.emotion_curve,
          viral_score = excluded.viral_score,
          engagement_score = excluded.engagement_score,
          comments_score = excluded.comments_score,
          shares_score = excluded.shares_score,
          originality_score = excluded.originality_score,
          structure_analysis = excluded.structure_analysis`,
        [
          item.id || crypto.randomUUID(),
          item.source_type || "website",
          item.source_reference || "",
          item.emotion || "",
          item.main_theme || "",
          item.secondary_theme || "",
          item.hook_type || "",
          item.conflict_type || "",
          item.twist_type || "",
          item.ending_type || "",
          JSON.stringify(Array.isArray(item.characters) ? item.characters : []),
          item.age_group || "",
          item.family_structure || "",
          Number(item.dialogue_density || 0),
          item.story_length || "",
          JSON.stringify(Array.isArray(item.emotion_curve) ? item.emotion_curve : []),
          Number(item.viral_score || 0),
          Number(item.engagement_score || 0),
          Number(item.comments_score || 0),
          Number(item.shares_score || 0),
          Number(item.originality_score || 100),
          JSON.stringify(item.structure_analysis || {}),
          pgColumnDate(item.created_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL story_dna persist failed: ${error.message}`);
  }
}

async function persistGeneratedStories(stories) {
  if (!pgPool) return;
  try {
    await ensureGeneratedStoriesTable();
    for (const story of stories) {
      await pgPool.query(
        `insert into generated_stories (
          id, title, category, emotion, length, hook, full_story, moral, image_prompt,
          viral_prediction_score, why_it_should_work, research_signals, facebook_signals,
          status, approval_required, publish_allowed, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        on conflict (id) do update set
          title = excluded.title,
          category = excluded.category,
          emotion = excluded.emotion,
          length = excluded.length,
          hook = excluded.hook,
          full_story = excluded.full_story,
          moral = excluded.moral,
          image_prompt = excluded.image_prompt,
          viral_prediction_score = excluded.viral_prediction_score,
          why_it_should_work = excluded.why_it_should_work,
          research_signals = excluded.research_signals,
          facebook_signals = excluded.facebook_signals,
          status = excluded.status,
          approval_required = excluded.approval_required,
          publish_allowed = excluded.publish_allowed,
          updated_at = excluded.updated_at`,
        [
          story.id || crypto.randomUUID(),
          story.title || "",
          story.category || "",
          story.emotion || "",
          story.length || "medium",
          story.hook || "",
          story.full_story || "",
          story.moral || "",
          story.image_prompt || "",
          Number(story.viral_prediction_score || 0),
          story.why_it_should_work || "",
          JSON.stringify(Array.isArray(story.research_signals) ? story.research_signals : []),
          JSON.stringify(Array.isArray(story.facebook_signals) ? story.facebook_signals : []),
          story.status || "needs_approval",
          story.approval_required !== false,
          Boolean(story.publish_allowed),
          pgColumnDate(story.created_at),
          pgColumnDate(story.updated_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL generated_stories persist failed: ${error.message}`);
  }
}

async function persistScheduledPosts(items) {
  if (!pgPool) return;
  try {
    await ensureScheduledPostsTable();
    for (const item of items) {
      await pgPool.query(
        `insert into scheduled_posts (
          id, draft_id, image_prompt_id, scheduled_time, theme, emotion, status,
          title, rhythm_step, publish_allowed, created_at, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        on conflict (id) do update set
          draft_id = excluded.draft_id,
          image_prompt_id = excluded.image_prompt_id,
          scheduled_time = excluded.scheduled_time,
          theme = excluded.theme,
          emotion = excluded.emotion,
          status = excluded.status,
          title = excluded.title,
          rhythm_step = excluded.rhythm_step,
          publish_allowed = excluded.publish_allowed,
          updated_at = excluded.updated_at`,
        [
          item.id || crypto.randomUUID(),
          item.draft_id || "",
          item.image_prompt_id || "",
          pgColumnDate(item.scheduled_time),
          item.theme || "",
          item.emotion || "",
          item.status || "draft",
          item.title || "",
          item.rhythm_step || "",
          Boolean(item.publish_allowed),
          pgColumnDate(item.created_at),
          pgColumnDate(item.updated_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL scheduled_posts persist failed: ${error.message}`);
  }
}

async function deleteScheduledPostById(id) {
  if (pgPool && id) {
    try {
      await pgPool.query("delete from scheduled_posts where id = $1", [id]);
    } catch (error) {
      console.warn(`PostgreSQL scheduled_posts delete failed: ${error.message}`);
    }
  }
}

async function persistPublishingPackages(items) {
  if (!pgPool) return;
  try {
    await ensurePublishingPackagesTable();
    for (const item of items) {
      await pgPool.query(
        `insert into publishing_packages (
          id, draft_id, image_prompt_id, schedule_id, status, publish_allowed,
          approval_required, created_at, approved_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (id) do update set
          draft_id = excluded.draft_id,
          image_prompt_id = excluded.image_prompt_id,
          schedule_id = excluded.schedule_id,
          status = excluded.status,
          publish_allowed = excluded.publish_allowed,
          approval_required = excluded.approval_required,
          approved_at = excluded.approved_at`,
        [
          item.id || crypto.randomUUID(),
          item.draft_id || "",
          item.image_prompt_id || "",
          item.schedule_id || "",
          item.status || "review",
          Boolean(item.publish_allowed),
          item.approval_required !== false,
          pgColumnDate(item.created_at),
          item.approved_at || null
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL publishing_packages persist failed: ${error.message}`);
  }
}

function normalizeStyleBrainProfileRow(row = {}) {
  return {
    ...row,
    emotion_curve: Array.isArray(row.emotion_curve) ? row.emotion_curve : []
  };
}

async function persistStyleBrainProfiles(items) {
  if (!pgPool) return;
  try {
    await ensureStyleBrainProfilesTable();
    for (const item of items) {
      await pgPool.query(
        `insert into style_brain_profiles (
          id, source_type, source_reference, hook_strength, opening_style, dialogue_density,
          sentence_rhythm, paragraph_rhythm, emotional_intensity, emotion_curve, conflict_speed,
          twist_strength, ending_strength, human_realism_score, boring_risk, facebook_readability_score, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        on conflict (source_reference) do update set
          source_type = excluded.source_type,
          hook_strength = excluded.hook_strength,
          opening_style = excluded.opening_style,
          dialogue_density = excluded.dialogue_density,
          sentence_rhythm = excluded.sentence_rhythm,
          paragraph_rhythm = excluded.paragraph_rhythm,
          emotional_intensity = excluded.emotional_intensity,
          emotion_curve = excluded.emotion_curve,
          conflict_speed = excluded.conflict_speed,
          twist_strength = excluded.twist_strength,
          ending_strength = excluded.ending_strength,
          human_realism_score = excluded.human_realism_score,
          boring_risk = excluded.boring_risk,
          facebook_readability_score = excluded.facebook_readability_score`,
        [
          item.id || crypto.randomUUID(),
          item.source_type || "manual",
          item.source_reference || "",
          Number(item.hook_strength || 0),
          item.opening_style || "",
          Number(item.dialogue_density || 0),
          item.sentence_rhythm || "",
          item.paragraph_rhythm || "",
          Number(item.emotional_intensity || 0),
          JSON.stringify(Array.isArray(item.emotion_curve) ? item.emotion_curve : []),
          Number(item.conflict_speed || 0),
          Number(item.twist_strength || 0),
          Number(item.ending_strength || 0),
          Number(item.human_realism_score || 0),
          Number(item.boring_risk || 0),
          Number(item.facebook_readability_score || 0),
          pgColumnDate(item.created_at)
        ]
      );
    }
  } catch (error) {
    console.warn(`PostgreSQL style_brain_profiles persist failed: ${error.message}`);
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
      <a href="/project-brain">Project Brain</a>
      <a href="/style-brain">Style Brain</a>
      <a href="/ai-autopilot">AI Autopilot</a>
      <a href="/ai-autopilot-v1">Autopilot v1</a>
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
          <a>/load_posts</a>
          <a>/analyze</a>
          <a>/research</a>
          <a>/ideas</a>
          <a>/plan</a>
          <a>/schedule</a>
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
  const storyDnaItems = readStoryDna().length ? readStoryDna() : readResearchStories().map(storyDnaFromResearchStory).filter(Boolean);
  const storyDnaStats = buildStoryDnaStatistics(storyDnaItems);
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
  const existingAutopilotV1 = readProjectBrain().internet_research?.autopilot_v1;
  const internetResearch = {
    ...buildInternetResearchSnapshot(audience, competitor, stories),
    ...(existingAutopilotV1 ? { autopilot_v1: existingAutopilotV1 } : {}),
    project_brain_v2: storyDnaStats
  };
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
    `Story DNA: чаще использовать "${storyDnaStats.top_hooks[0]?.name || "hidden truth hook"}" и конфликт "${storyDnaStats.top_conflicts[0]?.name || "family moral conflict"}".`,
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
    data_quality: {
      ...dataState,
      project_brain_v2: {
        status: storyDnaStats.story_dna_count ? "active" : "needs_research_data",
        story_dna_count: storyDnaStats.story_dna_count,
        brain_confidence_score: storyDnaStats.brain_confidence_score,
        stores_full_text: false,
        updated_at: storyDnaStats.updated_at
      }
    },
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
  await learnStoryDnaFromResearchStories(readResearchStories());
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

function storyHook(message = "") {
  const clean = String(message || "").replace(/\s+/g, " ").trim();
  return clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(" ").slice(0, 220);
}

function hookPattern(message = "") {
  const hook = storyHook(message).toLowerCase();
  if (!hook) return "no text";
  if (/[?]/.test(hook)) return "question hook";
  if (/secret|letter|envelope|truth|old|found|hidden|тайн|письм|конверт|правд/i.test(hook)) return "hidden truth hook";
  if (/mother|son|daughter|family|husband|wife|мать|сын|дочь|семь|муж|жен/i.test(hook)) return "family conflict hook";
  if (/money|inherit|house|apartment|наслед|квартир|дом|деньг/i.test(hook)) return "inheritance or money hook";
  if (/suddenly|never expected|вдруг|не ожид/i.test(hook)) return "sudden twist hook";
  return "emotional scene hook";
}

function storyFormatFromPost(post) {
  const text = post.message || "";
  const chars = Number(post.text_length || text.length || 0);
  const paragraphs = Number(post.paragraphs_count || text.split(/\n+/).filter(Boolean).length || 1);
  const hasImage = Boolean(post.image_url || post.full_picture || post.image_analysis?.has_image);
  const bucket = chars < 600 ? "short" : chars <= 1200 ? "medium" : "long";
  return `${bucket} post, ${paragraphs} paragraphs, ${hasImage ? "image" : "no image"}, ${hookPattern(text)}`;
}

function storyDnaSourceType(story = {}) {
  const source = `${story.source || ""} ${story.url || story.source_url || ""}`.toLowerCase();
  if (source.includes("facebook.com")) return "facebook";
  if (source.includes("reddit.com") || source.includes("reddit")) return "reddit";
  if (source.includes("tiktok.com") || source.includes("tiktok")) return "tiktok";
  if (source.includes("youtube.com") || source.includes("youtu.be") || source.includes("youtube")) return "youtube";
  if (source.includes("manual")) return "manual";
  return "website";
}

function storyDnaText(story = {}) {
  return [story.title, story.summary, story.emotion, story.category, ...(Array.isArray(story.keywords) ? story.keywords : [])]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function storyDnaSentences(text = "") {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchStoryDnaPattern(text = "", rules = [], fallback = "general life story") {
  const lower = String(text || "").toLowerCase();
  const found = rules.find(([, regex]) => regex.test(lower));
  return found ? found[0] : fallback;
}

function storyDnaConflictType(text = "") {
  return matchStoryDnaPattern(text, [
    ["betrayal secret", /betray|cheat|affair|secret|lied|hidden|измен|преда|тайн|обман/i],
    ["inheritance dispute", /inherit|will|money|house|apartment|property|наслед|завещ|квартир|дом|деньг/i],
    ["mother-in-law pressure", /mother.?in.?law|in-law|свекров|невестк|тещ/i],
    ["parent-child conflict", /mother|father|son|daughter|child|parent|мать|отец|сын|дочь|дет/i],
    ["poverty versus dignity", /poverty|poor|debt|homeless|бедн|долг|нищ/i],
    ["old love returns", /first love|lost love|reunion|любов|встреч|вернул/i],
    ["revenge choice", /revenge|payback|ответил|отомст|мест/i]
  ], "family moral conflict");
}

function storyDnaTwistType(text = "") {
  return matchStoryDnaPattern(text, [
    ["hidden truth revealed", /truth|secret|letter|envelope|found|hidden|правд|тайн|письм|конверт|нашл/i],
    ["role reversal", /actually|instead|turned out|оказал|вдруг|на самом деле/i],
    ["late confession", /confess|admitted|told her|признал|сказал правд/i],
    ["unexpected kindness", /kindness|helped|forgave|помог|простил|доброт/i],
    ["inheritance surprise", /inherit|will|estate|наслед|завещ/i]
  ], "emotional late reveal");
}

function storyDnaEndingType(text = "") {
  return matchStoryDnaPattern(text, [
    ["forgiveness ending", /forgive|forgave|простил|простила|прощ/i],
    ["justice ending", /justice|court|truth won|справедлив|суд|наказ/i],
    ["bittersweet ending", /sad|tears|goodbye|груст|слез|прощай/i],
    ["hopeful reunion", /reunion|returned|together|вернул|вместе|снова/i],
    ["moral lesson", /lesson|moral|understood|понял|вывод|урок/i]
  ], "moral emotional ending");
}

function storyDnaCharacters(text = "") {
  const lower = String(text || "").toLowerCase();
  const roles = [
    ["older woman", /older woman|elderly|grandmother|пожил|бабуш|стар/i],
    ["mother", /mother|mom|мать|мама/i],
    ["father", /father|dad|отец|папа/i],
    ["adult son", /son|сын/i],
    ["adult daughter", /daughter|дочь/i],
    ["husband", /husband|муж/i],
    ["wife", /wife|жена/i],
    ["mother-in-law", /mother.?in.?law|свекров/i],
    ["neighbor", /neighbor|сосед/i]
  ];
  return roles.filter(([, regex]) => regex.test(lower)).map(([name]) => name).slice(0, 6);
}

function storyDnaAgeGroup(text = "") {
  const lower = String(text || "").toLowerCase();
  if (/elderly|grandmother|grandfather|retired|пенси|пожил|стар/i.test(lower)) return "60+";
  if (/mother|father|husband|wife|мать|отец|муж|жена/i.test(lower)) return "40-65";
  if (/son|daughter|young|сын|дочь|молод/i.test(lower)) return "25-45";
  return "40-65+";
}

function storyDnaFamilyStructure(text = "") {
  return matchStoryDnaPattern(text, [
    ["mother and adult child", /mother|son|daughter|мать|сын|дочь/i],
    ["married couple", /husband|wife|marriage|муж|жена|брак/i],
    ["in-law triangle", /mother.?in.?law|in-law|свекров|невестк/i],
    ["siblings and inheritance", /brother|sister|inherit|брат|сестр|наслед/i],
    ["lonely elder and family", /elderly|alone|grandmother|пожил|один|бабуш/i]
  ], "family circle");
}

function storyDnaDialogueDensity(text = "") {
  const quotes = (String(text || "").match(/["“”«»]/g) || []).length;
  const dialogueMarkers = (String(text || "").match(/\b(said|asked|answered|told|сказал|спросил|ответил)\b/gi) || []).length;
  return Math.min(100, Math.round((quotes * 8) + (dialogueMarkers * 14)));
}

function storyDnaLengthBucket(text = "") {
  const chars = String(text || "").length;
  if (chars < 240) return "short signal";
  if (chars <= 700) return "medium signal";
  return "long signal";
}

function storyDnaEmotionCurve(text = "", emotion = "") {
  const lower = String(text || "").toLowerCase();
  const curve = ["curiosity"];
  if (/secret|hidden|truth|тайн|правд|скрыл/i.test(lower)) curve.push("tension");
  if (/betray|inherit|conflict|argue|измен|наслед|ссор|конфликт/i.test(lower)) curve.push("conflict");
  if (/sudden|unexpected|turned out|вдруг|оказал|не ожид/i.test(lower)) curve.push("surprise");
  curve.push(emotion || detectResearchEmotion(text, ""));
  if (/forgive|hope|returned|прост|надеж|вернул/i.test(lower)) curve.push("release");
  return [...new Set(curve)].slice(0, 6);
}

function storyDnaOpeningStyle(text = "") {
  return matchStoryDnaPattern(text, [
    ["direct emotional confession", /i never|i thought|she thought|he thought|думал|думала|никогда/i],
    ["object-trigger opening", /letter|envelope|photo|key|ring|письм|конверт|фото|ключ|кольц/i],
    ["family argument opening", /argument|fight|dinner|kitchen|ссор|кухн|ужин|разговор/i],
    ["question opening", /\?/],
    ["memory opening", /years ago|old|childhood|много лет|стар|детств/i]
  ], "emotional situation opening");
}

function storyDnaReadingDifficulty(sentences = []) {
  const avgWords = sentences.length
    ? sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length, 0) / sentences.length
    : 0;
  if (avgWords <= 12) return "easy";
  if (avgWords <= 20) return "medium";
  return "dense";
}

function analyzeStoryStructure(story = {}) {
  const text = storyDnaText(story);
  const sentences = storyDnaSentences(text);
  const opening = sentences[0] || story.title || "";
  const emotion = story.emotion || story.emotional_angle || detectResearchEmotion(text, story.category || "");
  const conflict = storyDnaConflictType(text);
  const twist = storyDnaTwistType(text);
  const ending = storyDnaEndingType(text);
  const wordCounts = sentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length);
  const avgSentenceLength = wordCounts.length ? Math.round(wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length) : 0;
  const dialogueDensity = storyDnaDialogueDensity(text);
  return {
    opening_style: storyDnaOpeningStyle(text),
    hook: hookPattern(opening || text),
    conflict,
    emotional_peaks: storyDnaEmotionCurve(text, emotion).slice(1, 5),
    plot_twists: [twist],
    ending,
    moral: ending.includes("moral") ? "lesson learned after family conflict" : `${ending} after ${conflict}`,
    story_rhythm: detectStoryStructure(text, story.category || ""),
    dialogue_percentage: dialogueDensity,
    average_sentence_length: avgSentenceLength,
    reading_difficulty: storyDnaReadingDifficulty(sentences),
    emotion_progression: storyDnaEmotionCurve(text, emotion)
  };
}

function storyDnaFromResearchStory(story = {}) {
  const text = storyDnaText(story);
  const sourceReference = story.url || story.source_url || story.id || story.title;
  if (!sourceReference) return null;
  const structure = analyzeStoryStructure(story);
  const emotion = story.emotion || story.emotional_angle || detectResearchEmotion(text, story.category || "");
  return {
    id: `dna_${crypto.createHash("sha1").update(String(sourceReference)).digest("hex").slice(0, 24)}`,
    source_type: storyDnaSourceType(story),
    source_reference: sourceReference,
    emotion,
    main_theme: normalizeResearchCategory(story.category || detectTopic(text)),
    secondary_theme: storyDnaConflictType(text),
    hook_type: structure.hook,
    conflict_type: structure.conflict,
    twist_type: structure.plot_twists[0],
    ending_type: structure.ending,
    characters: storyDnaCharacters(text),
    age_group: storyDnaAgeGroup(text),
    family_structure: storyDnaFamilyStructure(text),
    dialogue_density: structure.dialogue_percentage,
    story_length: storyDnaLengthBucket(text),
    emotion_curve: structure.emotion_progression,
    viral_score: Number(story.viral_score || 0),
    engagement_score: Math.round((Number(story.viral_score || 0) + Number(story.similarity_score || 0)) / 2),
    comments_score: Math.round(Number(story.emotional_intensity || 0) * 0.7),
    shares_score: Math.round(Number(story.surprise_factor || 0) * 0.8),
    originality_score: 100,
    structure_analysis: structure,
    created_at: story.created_at || new Date().toISOString()
  };
}

function storyDnaPostLengthBucket(chars = 0) {
  const value = Number(chars || 0);
  if (value < 600) return "short";
  if (value <= 1200) return "medium";
  return "long";
}

function storyDnaFromFacebookPost(post = {}, maxScore = 0) {
  const text = String(post.message || "");
  const postId = post.facebook_post_id || post.id;
  if (!postId || !text.trim()) return null;
  const score = Number(post.total_score || 0);
  const sourceReference = `facebook:${postId}`;
  const theme = post.detected_topic || detectTopic(text);
  const emotion = post.detected_emotion || detectEmotion(text);
  const structure = analyzeStoryStructure({
    title: storyHook(text),
    summary: shortText(text, 900),
    emotion,
    category: theme,
    keywords: [theme, emotion]
  });
  return {
    id: `dna_${crypto.createHash("sha1").update(sourceReference).digest("hex").slice(0, 24)}`,
    source_type: "facebook",
    source_reference: sourceReference,
    emotion,
    main_theme: theme,
    secondary_theme: storyDnaConflictType(text),
    hook_type: hookPattern(text),
    conflict_type: structure.conflict,
    twist_type: structure.plot_twists[0],
    ending_type: structure.ending,
    characters: storyDnaCharacters(text),
    age_group: storyDnaAgeGroup(text),
    family_structure: storyDnaFamilyStructure(text),
    dialogue_density: storyDnaDialogueDensity(text),
    story_length: storyDnaPostLengthBucket(post.text_length || text.length),
    emotion_curve: storyDnaEmotionCurve(text, emotion),
    viral_score: maxScore ? Math.round((score / maxScore) * 100) : Math.min(100, score),
    engagement_score: score,
    comments_score: Number(post.comments_count || 0) * 3,
    shares_score: Number(post.shares_count || 0) * 5,
    originality_score: 100,
    structure_analysis: {
      ...structure,
      source_metrics: {
        likes_count: Number(post.likes_count || 0),
        comments_count: Number(post.comments_count || 0),
        shares_count: Number(post.shares_count || 0),
        link_clicks_count: Number(post.link_clicks_count || 0),
        total_score: score
      }
    },
    created_at: post.published_at || post.created_at || new Date().toISOString()
  };
}

function storyDnaFromGeneratedStory(story = {}) {
  const text = [story.title, story.hook, story.full_story, story.moral].filter(Boolean).join(" ");
  const storyId = story.id;
  if (!storyId || !text.trim()) return null;
  const sourceReference = `generated:${storyId}`;
  const emotion = story.emotion || detectResearchEmotion(text, story.category || "");
  const theme = story.category || normalizeResearchCategory(detectTopic(text));
  const structure = analyzeStoryStructure({
    title: story.title,
    summary: shortText([story.hook, story.full_story, story.moral].filter(Boolean).join(" "), 1000),
    emotion,
    category: theme,
    keywords: [theme, emotion]
  });
  const score = Number(story.viral_prediction_score || 0);
  return {
    id: `dna_${crypto.createHash("sha1").update(sourceReference).digest("hex").slice(0, 24)}`,
    source_type: "generated",
    source_reference: sourceReference,
    emotion,
    main_theme: theme,
    secondary_theme: storyDnaConflictType(text),
    hook_type: hookPattern(story.hook || story.title || text),
    conflict_type: structure.conflict,
    twist_type: structure.plot_twists[0],
    ending_type: structure.ending,
    characters: storyDnaCharacters(text),
    age_group: storyDnaAgeGroup(text),
    family_structure: storyDnaFamilyStructure(text),
    dialogue_density: storyDnaDialogueDensity(text),
    story_length: story.length || storyDnaPostLengthBucket(text.length),
    emotion_curve: storyDnaEmotionCurve(text, emotion),
    viral_score: score,
    engagement_score: score,
    comments_score: 0,
    shares_score: 0,
    originality_score: 100,
    structure_analysis: {
      ...structure,
      generated_status: story.status || "needs_approval",
      own_content: true
    },
    created_at: story.created_at || new Date().toISOString()
  };
}

function clampStyleScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function styleBrainParagraphs(text = "") {
  return String(text || "").split(/\n{2,}|\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function styleBrainAverageSentenceWords(sentences = []) {
  if (!sentences.length) return 0;
  return sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length, 0) / sentences.length;
}

function styleBrainSentenceRhythm(avgWords = 0) {
  if (avgWords <= 9) return "short punchy rhythm";
  if (avgWords <= 16) return "mixed human rhythm";
  if (avgWords <= 23) return "steady readable rhythm";
  return "long dense rhythm";
}

function styleBrainParagraphRhythm(paragraphs = []) {
  const averageChars = paragraphs.length
    ? paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0) / paragraphs.length
    : 0;
  if (paragraphs.length >= 6 && averageChars <= 260) return "short mobile paragraphs";
  if (paragraphs.length >= 3 && averageChars <= 420) return "balanced story paragraphs";
  if (averageChars > 520) return "dense paragraphs";
  return "single-block or underdeveloped rhythm";
}

function styleBrainConflictSpeed(text = "") {
  const lower = String(text || "").toLowerCase();
  const index = lower.search(/secret|truth|betray|inherit|argument|fight|silent|found|letter|phone|money|mother|son|daughter|ĐżŃ€Đ°Đ˛Đ´|Ń‚Đ°ĐąĐ˝|Đ¸Đ·ĐĽĐµĐ˝|Đ˝Đ°ŃĐ»ĐµĐ´|ŃŃĐľŃ€/i);
  if (index < 0) return 25;
  const ratio = index / Math.max(1, lower.length);
  if (ratio <= 0.08) return 92;
  if (ratio <= 0.18) return 78;
  if (ratio <= 0.32) return 58;
  return 38;
}

function styleBrainHookStrength(text = "") {
  const hook = storyHook(text);
  const length = hook.length;
  const concreteObject = /letter|envelope|photo|key|ring|receipt|phone|will|transfer|ĐżĐ¸ŃŃŚĐĽ|ĐşĐľĐ˝Đ˛ĐµŃ€Ń‚|Ń„ĐľŃ‚Đľ|ĐşĐ»ŃŽŃ‡|Ń‚ĐµĐ»ĐµŃ„ĐľĐ˝|Đ·Đ°Đ˛ĐµŃ‰/i.test(hook);
  const hiddenTruth = /secret|truth|found|silent|suddenly|never|ĐżŃ€Đ°Đ˛Đ´|Ń‚Đ°ĐąĐ˝|Đ˝Đ°ŃĐ»|ĐĽĐľĐ»Ń‡|Đ˛Đ´Ń€ŃĐł/i.test(hook);
  const family = /mother|father|son|daughter|husband|wife|family|ĐĽĐ°Ń‚ŃŚ|ĐľŃ‚ĐµŃ†|ŃŃ‹Đ˝|Đ´ĐľŃ‡ŃŚ|ĐĽŃĐ¶|Đ¶ĐµĐ˝|ŃĐµĐĽŃŚ/i.test(hook);
  const question = /\?/.test(hook);
  const goodLength = length >= 70 && length <= 240;
  return clampStyleScore(22 + (concreteObject ? 22 : 0) + (hiddenTruth ? 24 : 0) + (family ? 16 : 0) + (question ? 8 : 0) + (goodLength ? 10 : 0));
}

function styleBrainTwistStrength(text = "") {
  return scoreFromMatches(text, ["secret", "truth", "found", "letter", "envelope", "turned out", "actually", "will", "confession", "неожиданно", "правда", "тайна"], 28, 8);
}

function styleBrainEndingStrength(text = "") {
  const paragraphs = styleBrainParagraphs(text);
  const ending = paragraphs[paragraphs.length - 1] || String(text || "").slice(-420);
  return clampStyleScore(
    scoreFromMatches(ending, ["forgive", "hope", "understood", "truth", "stayed", "returned", "простил", "надежда", "поняла", "вернулся"], 34, 8)
    - (/moral|lesson|вывод|урок/i.test(ending) ? 6 : 0)
  );
}

function styleBrainHumanRealismScore(text = "") {
  const lower = String(text || "").toLowerCase();
  const everydayHits = (lower.match(/kitchen|table|tea|kettle|apartment|bus|coat|receipt|phone|window|rain|hospital|кухн|стол|чай|чайник|квартир|автобус|пальто|чек|телефон|окно|дожд|больниц/gi) || []).length;
  const dialogue = storyDnaDialogueDensity(text);
  const specificObjects = (lower.match(/letter|envelope|photo|key|ring|receipt|phone|will|письм|конверт|фото|ключ|кольц|чек|телефон|завещ/gi) || []).length;
  const genericPenalty = (lower.match(/destiny|heart|soul|moral|lesson|судьба|сердце|душа|урок|вывод/gi) || []).length * 4;
  return clampStyleScore(32 + Math.min(28, everydayHits * 4) + Math.min(20, specificObjects * 5) + Math.min(20, dialogue * 0.35) - genericPenalty);
}

function styleBrainBoringRisk(text = "", profile = {}) {
  const sentences = storyDnaSentences(text);
  const avgWords = styleBrainAverageSentenceWords(sentences);
  const paragraphs = styleBrainParagraphs(text);
  const firstConflict = profile.conflict_speed || styleBrainConflictSpeed(text);
  const lowDialoguePenalty = (profile.dialogue_density || 0) < 16 ? 18 : 0;
  const densePenalty = avgWords > 22 ? 18 : avgWords > 17 ? 8 : 0;
  const blockPenalty = paragraphs.length <= 2 ? 20 : 0;
  const weakHookPenalty = (profile.hook_strength || 0) < 55 ? 18 : 0;
  const slowConflictPenalty = firstConflict < 50 ? 14 : 0;
  return clampStyleScore(12 + lowDialoguePenalty + densePenalty + blockPenalty + weakHookPenalty + slowConflictPenalty);
}

function styleBrainFacebookReadability(text = "") {
  const sentences = storyDnaSentences(text);
  const paragraphs = styleBrainParagraphs(text);
  const avgWords = styleBrainAverageSentenceWords(sentences);
  const firstParagraph = paragraphs[0] || storyHook(text);
  return clampStyleScore(
    42
    + (paragraphs.length >= 5 ? 18 : paragraphs.length >= 3 ? 10 : 0)
    + (avgWords >= 7 && avgWords <= 17 ? 16 : avgWords < 23 ? 7 : -8)
    + (firstParagraph.length >= 70 && firstParagraph.length <= 260 ? 14 : 0)
    + (storyDnaDialogueDensity(text) >= 20 ? 10 : 0)
  );
}

function styleBrainProfileFromText({ source_type, source_reference, text, score_hint = 0, created_at } = {}) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!source_reference || !clean) return null;
  const sentences = storyDnaSentences(clean);
  const paragraphs = styleBrainParagraphs(clean);
  const emotion = detectResearchEmotion(clean, "");
  const dialogueDensity = storyDnaDialogueDensity(clean);
  const hookStrength = styleBrainHookStrength(clean);
  const conflictSpeed = styleBrainConflictSpeed(clean);
  const twistStrength = styleBrainTwistStrength(clean);
  const endingStrength = styleBrainEndingStrength(clean);
  const humanRealism = styleBrainHumanRealismScore(clean);
  const partialProfile = { hook_strength: hookStrength, dialogue_density: dialogueDensity, conflict_speed: conflictSpeed };
  const boringRisk = styleBrainBoringRisk(clean, partialProfile);
  const readability = styleBrainFacebookReadability(clean);
  const scoreBoost = Math.min(8, Math.round(Number(score_hint || 0) / 20));
  return {
    id: `style_${crypto.createHash("sha1").update(String(source_reference)).digest("hex").slice(0, 24)}`,
    source_type,
    source_reference,
    hook_strength: clampStyleScore(hookStrength + scoreBoost),
    opening_style: storyDnaOpeningStyle(clean),
    dialogue_density: dialogueDensity,
    sentence_rhythm: styleBrainSentenceRhythm(styleBrainAverageSentenceWords(sentences)),
    paragraph_rhythm: styleBrainParagraphRhythm(paragraphs),
    emotional_intensity: scoreFromMatches(clean, ["secret", "betrayal", "truth", "tears", "silent", "shame", "hope", "family", "тайна", "слез", "молч", "надежда"], 34, 7),
    emotion_curve: storyDnaEmotionCurve(clean, emotion),
    conflict_speed: conflictSpeed,
    twist_strength: twistStrength,
    ending_strength: endingStrength,
    human_realism_score: humanRealism,
    boring_risk: boringRisk,
    facebook_readability_score: readability,
    created_at: created_at || new Date().toISOString()
  };
}

function styleBrainProfileFromFacebookPost(post = {}) {
  const postId = post.facebook_post_id || post.id;
  if (!postId || !post.message) return null;
  return styleBrainProfileFromText({
    source_type: "facebook",
    source_reference: `facebook:${postId}`,
    text: post.message,
    score_hint: post.total_score || 0,
    created_at: post.published_at || post.created_at
  });
}

function styleBrainProfileFromGeneratedStory(story = {}) {
  const storyId = story.id;
  const text = [story.title, story.hook, story.full_story, story.moral].filter(Boolean).join("\n\n");
  if (!storyId || !text.trim()) return null;
  return styleBrainProfileFromText({
    source_type: "generated",
    source_reference: `generated:${storyId}`,
    text,
    score_hint: story.viral_prediction_score || 0,
    created_at: story.created_at
  });
}

function styleBrainProfileFromResearchStory(story = {}) {
  const sourceReference = story.url || story.source_url || story.id || story.title;
  const text = [story.title, story.summary, story.emotion, story.category, ...(Array.isArray(story.keywords) ? story.keywords : [])].filter(Boolean).join("\n\n");
  if (!sourceReference || !text.trim()) return null;
  return styleBrainProfileFromText({
    source_type: "research",
    source_reference: `research:${sourceReference}`,
    text,
    score_hint: (Number(story.viral_score || 0) + Number(story.similarity_score || 0)) / 2,
    created_at: story.created_at
  });
}

function styleBrainProfileFromApprovedPackage(pkg = {}) {
  if (!pkg?.id || pkg.status !== "approved") return null;
  const draft = readGeneratedStories().find((story) => story.id === pkg.draft_id) || {};
  const text = [draft.title, draft.hook, draft.full_story, draft.moral].filter(Boolean).join("\n\n");
  if (!text.trim()) return null;
  return styleBrainProfileFromText({
    source_type: "approved_package",
    source_reference: `package:${pkg.id}`,
    text,
    score_hint: Number(draft.viral_prediction_score || 70),
    created_at: pkg.approved_at || pkg.created_at
  });
}

function mergeStyleBrainProfiles(existing = [], incoming = []) {
  const byReference = new Map();
  for (const item of existing) {
    if (item?.source_reference) byReference.set(item.source_reference, item);
  }
  for (const item of incoming) {
    if (!item?.source_reference) continue;
    byReference.set(item.source_reference, {
      ...(byReference.get(item.source_reference) || {}),
      ...item,
      created_at: byReference.get(item.source_reference)?.created_at || item.created_at || new Date().toISOString()
    });
  }
  return [...byReference.values()]
    .sort((a, b) => Number(b.human_realism_score || 0) + Number(b.hook_strength || 0) - Number(b.boring_risk || 0)
      - (Number(a.human_realism_score || 0) + Number(a.hook_strength || 0) - Number(a.boring_risk || 0)))
    .slice(0, 1500);
}

function buildStyleBrainSourceProfiles() {
  return [
    ...readFacebookPosts().map(styleBrainProfileFromFacebookPost),
    ...readGeneratedStories().map(styleBrainProfileFromGeneratedStory),
    ...readResearchStories().map(styleBrainProfileFromResearchStory),
    ...readPublishingPackages().map(styleBrainProfileFromApprovedPackage)
  ].filter(Boolean);
}

function averageStyleScore(items = [], key) {
  return items.length ? Math.round(items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length) : 0;
}

function styleBrainMode(items = [], key, fallback = "balanced story paragraphs") {
  return countBy(items, (item) => item[key] || "unknown")[0]?.name || fallback;
}

function buildStyleBrainStatistics(profiles = readStyleBrainProfiles()) {
  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  return {
    module: "Style Brain v1",
    profiles_count: safeProfiles.length,
    hook_strength: averageStyleScore(safeProfiles, "hook_strength"),
    emotional_intensity: averageStyleScore(safeProfiles, "emotional_intensity"),
    dialogue_density: averageStyleScore(safeProfiles, "dialogue_density"),
    boring_risk: averageStyleScore(safeProfiles, "boring_risk"),
    human_realism_score: averageStyleScore(safeProfiles, "human_realism_score"),
    facebook_readability_score: averageStyleScore(safeProfiles, "facebook_readability_score"),
    top_opening_styles: countBy(safeProfiles, (item) => item.opening_style || "unknown").slice(0, 8),
    top_sentence_rhythms: countBy(safeProfiles, (item) => item.sentence_rhythm || "unknown").slice(0, 8),
    top_paragraph_rhythms: countBy(safeProfiles, (item) => item.paragraph_rhythm || "unknown").slice(0, 8),
    strongest_profiles: safeProfiles
      .filter((item) => Number(item.hook_strength || 0) >= 60)
      .slice(0, 10)
      .map((item) => ({
        source_type: item.source_type,
        hook_strength: item.hook_strength,
        human_realism_score: item.human_realism_score,
        boring_risk: item.boring_risk,
        opening_style: item.opening_style
      })),
    updated_at: new Date().toISOString()
  };
}

function buildStyleBrainRecommendations(profiles = readStyleBrainProfiles()) {
  const stats = buildStyleBrainStatistics(profiles);
  const idealOpeningStyle = stats.top_opening_styles[0]?.name || "object-trigger opening";
  const idealParagraphRhythm = stats.top_paragraph_rhythms[0]?.name || "short mobile paragraphs";
  const idealDialogue = stats.dialogue_density < 22 ? "add 2-4 short dialogue lines" : "keep natural short dialogue";
  return {
    ok: true,
    module: "Style Brain v1 Recommendations",
    profiles_count: stats.profiles_count,
    ideal_opening_style: idealOpeningStyle,
    ideal_hook_type: idealOpeningStyle.includes("object") ? "hidden object + family silence in the first 2 lines" : "family conflict + emotional question",
    ideal_emotional_intensity: stats.emotional_intensity < 55 ? "55-72 with a clear escalation before the reveal" : "keep current intensity but add one quiet release moment",
    ideal_dialogue_density: idealDialogue,
    paragraph_rhythm: idealParagraphRhythm,
    what_makes_current_drafts_boring: [
      "conflict starts too late",
      "too many generic moral lines",
      "not enough concrete household details",
      "dialogue sounds explanatory instead of lived-in",
      "paragraphs become too dense for Facebook/mobile reading"
    ],
    how_to_make_stories_more_human: [
      "open with a specific object, room, smell, sound or gesture",
      "put the conflict in the first 3 lines",
      "add small imperfect details: cold tea, old slippers, unpaid receipt, shaking hands",
      "use short dialogue where people avoid saying the whole truth",
      "let the moral appear through action, not a final lecture"
    ],
    words_structures_to_avoid: [
      "It was destiny",
      "everything changed forever",
      "from that moment on",
      "lesson learned",
      "her heart was full of emotions",
      "generic long explanations before the conflict"
    ],
    target_scores: {
      hook_strength: Math.max(72, stats.hook_strength),
      human_realism_score: Math.max(76, stats.human_realism_score),
      boring_risk_max: Math.min(35, stats.boring_risk || 35),
      facebook_readability_score: Math.max(75, stats.facebook_readability_score),
      dialogue_density: Math.max(24, stats.dialogue_density)
    },
    statistics: stats,
    safety: {
      stores_full_text: false,
      publishes: false,
      copies_competitors: false
    }
  };
}

async function refreshStyleBrainV1() {
  const incoming = buildStyleBrainSourceProfiles();
  const merged = mergeStyleBrainProfiles(readStyleBrainProfiles(), incoming);
  await writeStyleBrainProfiles(merged);
  const recommendations = buildStyleBrainRecommendations(merged);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object" ? brain.internet_research : {};
  brain.internet_research = {
    ...currentResearch,
    style_brain_v1: {
      statistics: recommendations.statistics,
      recommendations,
      updated_at: new Date().toISOString(),
      safety: recommendations.safety
    }
  };
  brain.recommendations = [
    `Style Brain: use ${recommendations.ideal_opening_style}, ${recommendations.ideal_hook_type}, ${recommendations.ideal_dialogue_density}.`,
    ...(brain.recommendations || []).slice(0, 9)
  ];
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return {
    ok: true,
    module: "Style Brain v1",
    analyzed: incoming.length,
    profiles_count: merged.length,
    statistics: recommendations.statistics,
    recommendations,
    safety: recommendations.safety
  };
}

async function styleBrainGuidanceForGenerator() {
  if (!readStyleBrainProfiles().length && buildStyleBrainSourceProfiles().length) {
    await refreshStyleBrainV1();
  }
  const recommendations = buildStyleBrainRecommendations(readStyleBrainProfiles());
  return {
    opening_style: recommendations.ideal_opening_style,
    hook_type: recommendations.ideal_hook_type,
    emotional_intensity: recommendations.ideal_emotional_intensity,
    dialogue_density: recommendations.ideal_dialogue_density,
    paragraph_rhythm: recommendations.paragraph_rhythm,
    make_human: recommendations.how_to_make_stories_more_human,
    avoid: recommendations.words_structures_to_avoid,
    target_scores: recommendations.target_scores
  };
}

async function learnStyleBrainFromGeneratedStory(story = {}) {
  const profile = styleBrainProfileFromGeneratedStory(story);
  if (!profile) return null;
  const merged = mergeStyleBrainProfiles(readStyleBrainProfiles(), [profile]);
  await writeStyleBrainProfiles(merged);
  return buildStyleBrainRecommendations(merged);
}

function mergeStoryDna(existing = [], incoming = []) {
  const byReference = new Map();
  for (const item of existing) {
    if (item?.source_reference) byReference.set(item.source_reference, item);
  }
  for (const item of incoming) {
    if (!item?.source_reference) continue;
    const previous = byReference.get(item.source_reference);
    const previousMetrics = previous?.structure_analysis?.source_metrics || null;
    const nextMetrics = item?.structure_analysis?.source_metrics || null;
    const previousHistory = Array.isArray(previous?.structure_analysis?.metrics_history)
      ? previous.structure_analysis.metrics_history
      : [];
    const metricsChanged = previousMetrics && nextMetrics
      ? JSON.stringify(previousMetrics) !== JSON.stringify(nextMetrics)
      : Boolean(nextMetrics && !previousMetrics);
    const metricsHistory = metricsChanged
      ? [...previousHistory, { captured_at: new Date().toISOString(), ...(nextMetrics || {}) }].slice(-20)
      : previousHistory;
    byReference.set(item.source_reference, {
      ...(previous || {}),
      ...item,
      structure_analysis: {
        ...(previous?.structure_analysis || {}),
        ...(item.structure_analysis || {}),
        ...(metricsHistory.length ? { metrics_history: metricsHistory } : {})
      },
      created_at: previous?.created_at || item.created_at || new Date().toISOString()
    });
  }
  return [...byReference.values()]
    .sort((a, b) => Number(b.viral_score || 0) - Number(a.viral_score || 0) || new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 1500);
}

function weightedDnaStats(items = [], key) {
  const groups = new Map();
  for (const item of items) {
    const name = item[key] || "unknown";
    const current = groups.get(name) || { name, count: 0, total_score: 0, viral_score: 0, engagement_score: 0 };
    current.count += 1;
    current.total_score += Number(item.viral_score || 0) + Number(item.engagement_score || 0);
    current.viral_score += Number(item.viral_score || 0);
    current.engagement_score += Number(item.engagement_score || 0);
    groups.set(name, current);
  }
  return [...groups.values()]
    .map((item) => ({
      ...item,
      avg_score: item.count ? Math.round(item.total_score / item.count / 2) : 0,
      avg_viral_score: item.count ? Math.round(item.viral_score / item.count) : 0,
      avg_engagement_score: item.count ? Math.round(item.engagement_score / item.count) : 0
    }))
    .sort((a, b) => b.avg_score - a.avg_score || b.count - a.count);
}

function storyDnaStructureName(item = {}) {
  return [
    item.hook_type || "hook",
    item.conflict_type || "conflict",
    item.twist_type || "twist",
    item.ending_type || "ending"
  ].join(" -> ");
}

function buildStoryDnaStatistics(items = readStoryDna()) {
  const safeItems = Array.isArray(items) ? items : [];
  const topEmotions = weightedDnaStats(safeItems, "emotion").slice(0, 8);
  const topHooks = weightedDnaStats(safeItems, "hook_type").slice(0, 8);
  const topEndings = weightedDnaStats(safeItems, "ending_type").slice(0, 8);
  const topConflicts = weightedDnaStats(safeItems, "conflict_type").slice(0, 8);
  const trendingTopics = weightedDnaStats(safeItems, "main_theme").slice(0, 8);
  const rhythmAnalysis = countBy(safeItems, (item) => item.structure_analysis?.story_rhythm || "unknown").slice(0, 8);
  const successfulStructures = weightedDnaStats(safeItems.map((item) => ({
    ...item,
    structure_key: storyDnaStructureName(item)
  })), "structure_key").slice(0, 8);
  const averageOriginality = safeItems.length ? Math.round(safeItems.reduce((sum, item) => sum + Number(item.originality_score || 0), 0) / safeItems.length) : 0;
  const confidenceScore = Math.min(100, Math.round(
    Math.min(safeItems.length, 100) * 0.55 +
    Math.min(topHooks.length * 4, 20) +
    Math.min(trendingTopics.length * 3, 15) +
    (averageOriginality >= 90 ? 10 : 0)
  ));
  return {
    module: "Project Brain v2 Core",
    story_dna_count: safeItems.length,
    top_emotions: topEmotions,
    top_hooks: topHooks,
    top_endings: topEndings,
    top_conflicts: topConflicts,
    trending_topics: trendingTopics,
    story_rhythm_analysis: rhythmAnalysis,
    most_successful_structures: successfulStructures,
    brain_confidence_score: confidenceScore,
    brain_memory: {
      worked: successfulStructures.slice(0, 5).map((item) => item.name),
      failed: safeItems.filter((item) => Number(item.viral_score || 0) < 35).slice(0, 5).map(storyDnaStructureName),
      audience_prefers: [
        topEmotions[0]?.name,
        topHooks[0]?.name,
        topConflicts[0]?.name,
        trendingTopics[0]?.name
      ].filter(Boolean),
      avoid: [
        "copying full copyrighted text",
        "reusing competitor characters or endings",
        "saving raw scraped story content",
        "publishing without explicit approval"
      ]
    },
    safety: {
      stores_full_copyrighted_text: false,
      stores_patterns_only: true,
      publishing_enabled: false,
      generation_changed: false
    },
    updated_at: new Date().toISOString()
  };
}

async function saveStoryDnaPatterns(incoming = [], sourceLabel = "mixed") {
  if (!incoming.length) {
    const stats = buildStoryDnaStatistics(readStoryDna());
    return {
      ok: true,
      module: "Project Brain v2 Core",
      source: sourceLabel,
      imported: 0,
      story_dna_count: stats.story_dna_count,
      statistics: stats
    };
  }
  const merged = mergeStoryDna(readStoryDna(), incoming);
  await writeStoryDna(merged);
  const stats = buildStoryDnaStatistics(merged);
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object" ? brain.internet_research : {};
  brain.internet_research = {
    ...currentResearch,
    project_brain_v2: stats
  };
  brain.data_quality = {
    ...(brain.data_quality || {}),
    project_brain_v2: {
      status: merged.length ? "active" : "needs_data",
      story_dna_count: merged.length,
      stores_full_text: false,
      updated_at: stats.updated_at
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return {
    ok: true,
    module: "Project Brain v2 Core",
    source: sourceLabel,
    imported: incoming.length,
    story_dna_count: merged.length,
    statistics: stats
  };
}

async function learnStoryDnaFromResearchStories(stories = readResearchStories()) {
  const incoming = stories
    .map(storyDnaFromResearchStory)
    .filter(Boolean);
  const result = await saveStoryDnaPatterns(incoming, "research");
  return result.statistics;
}

async function importFacebookPostsToStoryDna(options = {}) {
  const posts = readFacebookPosts();
  const maxScore = Math.max(1, ...posts.map((post) => Number(post.total_score || 0)));
  const incoming = posts
    .map((post) => storyDnaFromFacebookPost(post, maxScore))
    .filter(Boolean);
  const result = await saveStoryDnaPatterns(incoming, "facebook");
  if (!options.skipBrainUpdate) {
    await updateProjectBrain();
    await recordProjectBrainV2Learning({
      reason: options.reason || "manual_facebook_import",
      sources: ["facebook"],
      imported_facebook_posts: incoming.length
    });
  }
  return {
    ...result,
    source_posts: posts.length,
    imported_facebook_posts: incoming.length,
    safety: {
      stores_full_text: false,
      stores_structure_and_stats_only: true,
      publishing_enabled: false
    }
  };
}

async function importGeneratedStoriesToStoryDna(options = {}) {
  const stories = readGeneratedStories();
  const incoming = stories
    .map(storyDnaFromGeneratedStory)
    .filter(Boolean);
  const result = await saveStoryDnaPatterns(incoming, "generated");
  if (!options.skipBrainUpdate) {
    await updateProjectBrain();
    await recordProjectBrainV2Learning({
      reason: options.reason || "manual_generated_import",
      sources: ["generated"],
      imported_generated_stories: incoming.length
    });
  }
  return {
    ...result,
    source_generated_stories: stories.length,
    imported_generated_stories: incoming.length,
    safety: {
      stores_full_text: false,
      stores_structure_only: true,
      publishing_enabled: false
    }
  };
}

function lowestUsefulDnaStats(items = [], key) {
  return weightedDnaStats(items, key)
    .filter((item) => item.count >= 1 && Number(item.avg_score || 0) < 35 && item.name !== "unknown")
    .sort((a, b) => a.avg_score - b.avg_score || b.count - a.count)
    .slice(0, 6);
}

function buildProjectBrainV2Recommendations() {
  const dnaItems = readStoryDna().length ? readStoryDna() : readResearchStories().map(storyDnaFromResearchStory).filter(Boolean);
  const stats = buildStoryDnaStatistics(dnaItems);
  const lengthStats = weightedDnaStats(dnaItems, "story_length").slice(0, 6);
  const avoidTopics = lowestUsefulDnaStats(dnaItems, "main_theme");
  const bestEmotion = stats.top_emotions[0]?.name || "hope";
  const bestHook = stats.top_hooks[0]?.name || "hidden truth hook";
  const bestLength = lengthStats[0]?.name || "medium";
  const bestConflict = stats.top_conflicts[0]?.name || "family moral conflict";
  const bestEnding = stats.top_endings[0]?.name || "moral emotional ending";
  const bestTopic = stats.trending_topics[0]?.name || "family conflict";
  const suggested = {
    theme: bestTopic,
    emotion: bestEmotion,
    hook_type: bestHook,
    conflict_type: bestConflict,
    ending_type: bestEnding,
    story_length: bestLength,
    format: `${bestHook} -> ${bestConflict} -> ${bestEnding}`
  };
  return {
    ok: true,
    module: "Project Brain v2 Recommendations",
    dna_count: stats.story_dna_count,
    confidence_score: stats.brain_confidence_score,
    best_emotions: stats.top_emotions.slice(0, 5),
    best_hook_types: stats.top_hooks.slice(0, 5),
    best_story_length: lengthStats[0] || null,
    avoid_topics: avoidTopics,
    suggested_next_story_type: suggested,
    reason_why: stats.story_dna_count
      ? `Based on ${stats.story_dna_count} Story DNA patterns. Strongest signals: emotion "${bestEmotion}", hook "${bestHook}", conflict "${bestConflict}", length "${bestLength}".`
      : "Not enough Story DNA yet. Import Facebook posts, generated stories, or run Internet Research first.",
    safety: {
      stores_full_copyrighted_text: false,
      publishing_enabled: false,
      auto_posting_enabled: false
    },
    updated_at: new Date().toISOString()
  };
}

function imagePromptVisualPattern(item = {}) {
  const prompt = `${item.prompt || ""} ${item.style || ""}`.toLowerCase();
  const visual = item.visual_analysis || {};
  const composition = /close-up|close up|portrait|eyes/i.test(prompt)
    ? "emotional close-up"
    : /cover|thumbnail|facebook/i.test(prompt)
      ? "facebook cover composition"
      : /horizontal|16:9|wide/i.test(prompt)
        ? "wide story frame"
        : "documentary scene";
  const cameraAngle = /35mm/i.test(prompt)
    ? "35mm documentary lens"
    : /shallow|depth/i.test(prompt)
      ? "shallow depth portrait"
      : "natural eye-level camera";
  const lighting = /warm|kitchen/i.test(prompt)
    ? "warm interior light"
    : /window|natural/i.test(prompt)
      ? "natural window light"
      : "realistic household light";
  return {
    id: item.id,
    draft_id: item.draft_id || item.generated_story_id || "",
    story_title: item.story_title || "",
    visual_emotion: visual.emotion || detectResearchEmotion(prompt, ""),
    composition,
    camera_angle: cameraAngle,
    lighting,
    image_style: item.style || "story_prompt",
    status: item.status || "",
    approved_at: item.updated_at || item.created_at || new Date().toISOString()
  };
}

function buildApprovedImagePromptMemory() {
  const approved = readImageQueue()
    .filter((item) => item.status === "approved")
    .map(imagePromptVisualPattern);
  return {
    approved_count: approved.length,
    visual_patterns: approved.slice(0, 50),
    top_visual_emotions: countBy(approved, (item) => item.visual_emotion).slice(0, 8),
    top_compositions: countBy(approved, (item) => item.composition).slice(0, 8),
    top_camera_angles: countBy(approved, (item) => item.camera_angle).slice(0, 8),
    top_lighting: countBy(approved, (item) => item.lighting).slice(0, 8),
    top_image_styles: countBy(approved, (item) => item.image_style).slice(0, 8),
    updated_at: new Date().toISOString()
  };
}

function buildApprovedScheduleMemory() {
  const approved = readScheduledPosts().filter((item) => item.status === "approved");
  const enriched = approved.map((item) => {
    const date = new Date(item.scheduled_time || item.created_at || Date.now());
    return {
      id: item.id,
      draft_id: item.draft_id,
      hour: String(date.getHours()).padStart(2, "0") + ":00",
      weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
      sequence: item.rhythm_step || item.theme || "mixed",
      theme: item.theme || "",
      emotion: item.emotion || "",
      scheduled_time: item.scheduled_time
    };
  });
  return {
    approved_count: enriched.length,
    best_publish_hours: countBy(enriched, (item) => item.hour).slice(0, 8),
    best_weekdays: countBy(enriched, (item) => item.weekday).slice(0, 7),
    best_sequences: countBy(enriched, (item) => item.sequence).slice(0, 8),
    latest_schedule_patterns: enriched.slice(0, 50),
    updated_at: new Date().toISOString()
  };
}

function buildPermanentBrainMemory(stats = buildStoryDnaStatistics(readStoryDna()), recommendations = buildProjectBrainV2Recommendations(), history = []) {
  const previous = history[history.length - 2] || null;
  const latest = history[history.length - 1] || null;
  const confidenceChange = previous && latest ? Number(latest.confidence_score || 0) - Number(previous.confidence_score || 0) : 0;
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  return {
    what_works: stats.most_successful_structures.slice(0, 5).map((item) => ({
      pattern: item.name,
      avg_score: item.avg_score,
      count: item.count
    })),
    what_stopped_working: stats.brain_memory.failed.slice(0, 5),
    audience_preference_changes: confidenceChange
      ? [`Brain confidence changed by ${confidenceChange} points since previous sync.`]
      : ["Not enough sync history for preference change detection yet."],
    emerging_trends: stats.trending_topics.slice(0, 5).map((item) => item.name),
    seasonal_themes: [
      `${month}: family memories, reunions, household conflict, second chances`,
      "Evening posts: emotional reveals and continuation links",
      "Weekend posts: family dilemmas and moral endings"
    ],
    avoid: recommendations.avoid_topics.length
      ? recommendations.avoid_topics.map((item) => item.name)
      : stats.brain_memory.avoid,
    updated_at: new Date().toISOString()
  };
}

async function recordProjectBrainV2Learning(event = {}) {
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object" ? brain.internet_research : {};
  const previousAuto = currentResearch.project_brain_v2_auto || {};
  const stats = buildStoryDnaStatistics(readStoryDna());
  const recommendations = buildProjectBrainV2Recommendations();
  const now = new Date().toISOString();
  const sources = Array.isArray(event.sources) ? event.sources : [event.source || "mixed"].filter(Boolean);
  const previousHistory = Array.isArray(previousAuto.history) ? previousAuto.history : [];
  const historyEntry = {
    at: now,
    reason: event.reason || "auto_sync",
    sources,
    story_dna_count: stats.story_dna_count,
    confidence_score: stats.brain_confidence_score,
    imported_facebook_posts: Number(event.imported_facebook_posts || 0),
    imported_generated_stories: Number(event.imported_generated_stories || 0),
    imported_research_stories: Number(event.imported_research_stories || 0),
    approved_image_prompts: Number(event.approved_image_prompts || 0),
    approved_schedule_items: Number(event.approved_schedule_items || 0)
  };
  const history = [...previousHistory, historyEntry].slice(-80);
  const visualMemory = buildApprovedImagePromptMemory();
  const scheduleMemory = buildApprovedScheduleMemory();
  const autoState = {
    status: "active",
    automatic_sync_enabled: true,
    last_learning_time: now,
    last_facebook_sync: sources.includes("facebook") ? now : previousAuto.last_facebook_sync || null,
    last_research_sync: sources.includes("research") ? now : previousAuto.last_research_sync || null,
    last_story_sync: sources.includes("generated") ? now : previousAuto.last_story_sync || null,
    last_image_sync: sources.includes("images") ? now : previousAuto.last_image_sync || null,
    last_schedule_sync: sources.includes("schedules") ? now : previousAuto.last_schedule_sync || null,
    history,
    brain_growth_graph: history.map((item) => ({ at: item.at, confidence_score: item.confidence_score })),
    dna_growth_graph: history.map((item) => ({ at: item.at, story_dna_count: item.story_dna_count })),
    confidence_history: history.map((item) => ({ at: item.at, confidence_score: item.confidence_score, reason: item.reason })),
    visual_memory: visualMemory,
    schedule_memory: scheduleMemory,
    recommendations,
    permanent_memory: buildPermanentBrainMemory(stats, recommendations, history),
    safety: {
      stores_full_copyrighted_text: false,
      publishing_enabled: false,
      facebook_posting_enabled: false
    }
  };
  brain.internet_research = {
    ...currentResearch,
    project_brain_v2: stats,
    project_brain_v2_auto: autoState
  };
  brain.recommendations = [
    `Project Brain v2: next story ${recommendations.suggested_next_story_type.theme}, ${recommendations.suggested_next_story_type.emotion}, ${recommendations.suggested_next_story_type.hook_type}.`,
    ...(brain.recommendations || []).slice(0, 9)
  ];
  brain.data_quality = {
    ...(brain.data_quality || {}),
    project_brain_v2_auto: {
      status: "active",
      automatic_sync_enabled: true,
      last_learning_time: now,
      story_dna_count: stats.story_dna_count,
      confidence_score: stats.brain_confidence_score
    }
  };
  brain.updated_at = now;
  await writeProjectBrain(brain);
  return autoState;
}

async function autoSyncProjectBrainV2(options = {}) {
  const sources = new Set(options.sources || []);
  if (options.facebook) sources.add("facebook");
  if (options.generated) sources.add("generated");
  if (options.research) sources.add("research");
  if (options.images) sources.add("images");
  if (options.schedules) sources.add("schedules");
  if (!sources.size) sources.add("research");
  const summary = {
    ok: true,
    module: "Project Brain v2 Auto Sync",
    reason: options.reason || "auto_sync",
    sources: [...sources],
    imported_facebook_posts: 0,
    imported_generated_stories: 0,
    imported_research_stories: 0,
    approved_image_prompts: buildApprovedImagePromptMemory().approved_count,
    approved_schedule_items: buildApprovedScheduleMemory().approved_count
  };
  if (sources.has("research")) {
    const incoming = readResearchStories().map(storyDnaFromResearchStory).filter(Boolean);
    const result = await saveStoryDnaPatterns(incoming, "research");
    summary.imported_research_stories = result.imported || 0;
  }
  if (sources.has("facebook")) {
    const result = await importFacebookPostsToStoryDna({ skipBrainUpdate: true, reason: options.reason || "auto_facebook_sync" });
    summary.imported_facebook_posts = result.imported_facebook_posts || 0;
  }
  if (sources.has("generated")) {
    const result = await importGeneratedStoriesToStoryDna({ skipBrainUpdate: true, reason: options.reason || "auto_generated_sync" });
    summary.imported_generated_stories = result.imported_generated_stories || 0;
  }
  const brain = await updateProjectBrain();
  const autoState = await recordProjectBrainV2Learning(summary);
  return {
    ...summary,
    story_dna_count: autoState.recommendations?.dna_count || buildStoryDnaStatistics(readStoryDna()).story_dna_count,
    confidence_score: autoState.recommendations?.confidence_score || buildStoryDnaStatistics(readStoryDna()).brain_confidence_score,
    last_learning_time: autoState.last_learning_time,
    project_brain_updated_at: brain.updated_at,
    safety: {
      stores_full_copyrighted_text: false,
      publishing_enabled: false,
      facebook_posting_enabled: false
    }
  };
}

async function refreshProjectBrainV2Expansion() {
  const sync = await autoSyncProjectBrainV2({
    sources: ["research", "facebook", "generated", "images", "schedules"],
    reason: "forced_full_sync"
  });
  const recommendations = buildProjectBrainV2Recommendations();
  return {
    ok: true,
    module: "Project Brain v2 Auto Sync",
    research_imported: sync.imported_research_stories || 0,
    facebook_imported: sync.imported_facebook_posts || 0,
    generated_imported: sync.imported_generated_stories || 0,
    story_dna_count: recommendations.dna_count,
    confidence_score: recommendations.confidence_score,
    recommendations,
    automatic_sync_enabled: true,
    last_learning_time: sync.last_learning_time,
    project_brain_updated_at: sync.project_brain_updated_at,
    safety: {
      stores_full_text: false,
      publishing_enabled: false,
      auto_posting_enabled: false
    }
  };
}

function weightedGroup(posts, keyFn) {
  const groups = new Map();
  for (const post of posts) {
    const key = keyFn(post) || "unknown";
    const list = groups.get(key) || [];
    list.push(post);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([name, items]) => {
    const best = [...items].sort((a, b) => Number(b.total_score || 0) - Number(a.total_score || 0))[0];
    return {
      name,
      posts_count: items.length,
      avg_likes: metricAverage(items, "likes_count"),
      avg_comments: metricAverage(items, "comments_count"),
      avg_shares: metricAverage(items, "shares_count"),
      avg_clicks: metricAverage(items, "link_clicks_count"),
      avg_score: metricAverage(items, "total_score"),
      sample_hook: storyHook(best?.message || "")
    };
  }).sort((a, b) => b.avg_score - a.avg_score || b.posts_count - a.posts_count);
}

function buildAIPageAnalysis() {
  const posts = readFacebookPosts().map((post) => {
    const analysis = enrichFacebookPostAnalysis(post);
    const enriched = { ...post, ...analysis };
    return {
      ...enriched,
      hook: storyHook(post.message || ""),
      hook_pattern: hookPattern(post.message || ""),
      format: storyFormatFromPost(enriched)
    };
  });
  const bestThemes = weightedGroup(posts, (post) => post.detected_topic).slice(0, 8);
  const bestEmotions = weightedGroup(posts, (post) => post.detected_emotion).slice(0, 8);
  const bestHooks = weightedGroup(posts, (post) => post.hook_pattern).slice(0, 8);
  const bestFormats = weightedGroup(posts, (post) => post.format).slice(0, 8);
  const topPosts = [...posts].sort((a, b) => Number(b.total_score || 0) - Number(a.total_score || 0)).slice(0, 10);
  return {
    ok: true,
    module: "AI Page Analyzer",
    generated_at: new Date().toISOString(),
    posts_analyzed: posts.length,
    data_source: posts.length ? "stored_facebook_posts" : "no_posts_loaded",
    best_themes: bestThemes,
    best_emotions: bestEmotions,
    best_hooks: bestHooks,
    best_formats: bestFormats,
    best_times: groupStats(posts, (post) => post.published_at ? timeBucket(post.published_at) : "unknown").slice(0, 6),
    top_posts: topPosts.map((post) => ({
      facebook_post_id: post.facebook_post_id,
      published_at: post.published_at,
      topic: post.detected_topic,
      emotion: post.detected_emotion,
      hook: post.hook,
      format: post.format,
      total_score: Number(post.total_score || 0),
      permalink_url: post.permalink_url || ""
    })),
    recommendations: posts.length ? [
      `Use theme "${bestThemes[0]?.name || "family"}" as the next priority.`,
      `Use emotion "${bestEmotions[0]?.name || "hope"}" in the first 2 lines.`,
      `Best hook pattern now: "${bestHooks[0]?.name || "hidden truth hook"}".`,
      `Best format now: "${bestFormats[0]?.name || "medium post with image"}".`
    ] : [
      "Load Facebook Page posts first. Until then, AI Page Analyzer can only use demo assumptions.",
      "Safe starting hypothesis: family conflict, hidden truth, realistic image, evening post."
    ],
    safety: {
      publish_allowed: false,
      approval_required: true,
      token_values_returned: false
    }
  };
}

function htmlDecode(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function cleanResearchUrl(rawUrl = "") {
  let url = htmlDecode(rawUrl);
  if (url.startsWith("//")) url = `https:${url}`;
  try {
    const parsed = new URL(url);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.href;
  } catch {
    return url;
  }
}

function normalizeResearchCategory(category = "") {
  const clean = String(category || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  return researchCategories.includes(clean) ? clean : "family conflict";
}

function researchKeywordsForCategory(category) {
  const map = {
    betrayal: ["betrayal", "affair", "cheating", "secret", "trust", "marriage"],
    "mother in law": ["mother-in-law", "daughter-in-law", "family pressure", "kitchen", "conflict"],
    inheritance: ["inheritance", "will", "house", "apartment", "money", "family secret"],
    love: ["love", "reunion", "marriage", "second chance", "letter"],
    war: ["war", "loss", "separation", "return", "memory", "sacrifice"],
    "poverty to wealth": ["poverty", "rich", "success", "humiliation", "turnaround"],
    "unexpected ending": ["twist", "secret", "unexpected", "truth", "reveal"],
    "family conflict": ["family", "mother", "son", "daughter", "argument", "silence"],
    kindness: ["kindness", "help", "stranger", "gratitude", "hope"],
    revenge: ["revenge", "justice", "truth", "payback", "betrayal"]
  };
  return map[normalizeResearchCategory(category)] || map["family conflict"];
}

function detectResearchEmotion(text = "", category = "") {
  const lower = `${text} ${category}`.toLowerCase();
  const rules = [
    ["betrayal", /betray|cheat|affair|secret|lied|измен|предал/i],
    ["anger", /revenge|payback|justice|furious|rage|злость|мест/i],
    ["hope", /kindness|help|saved|reunion|second chance|надеж|помог/i],
    ["sadness", /war|loss|died|alone|poverty|tears|грусть|потер/i],
    ["surprise", /unexpected|twist|truth|revealed|found|secret|вдруг|правд/i],
    ["family warmth", /mother|father|son|daughter|family|love|мать|отец|сын|дочь|сем/i]
  ];
  return rules.find(([, regex]) => regex.test(lower))?.[0] || emotionalAngleFromTitle(text);
}

function scoreFromMatches(text, patterns, base = 35, weight = 8) {
  const lower = String(text || "").toLowerCase();
  const hits = patterns.filter((pattern) => lower.includes(pattern.toLowerCase())).length;
  return Math.min(100, base + hits * weight);
}

function detectStoryStructure(text = "") {
  const lower = String(text || "").toLowerCase();
  if (/letter|envelope|will|inherit|found|secret|письм|конверт|наслед/i.test(lower)) {
    return "ordinary life -> hidden object/secret -> family confrontation -> reveal";
  }
  if (/revenge|justice|payback/i.test(lower)) {
    return "hurtful action -> delayed consequence -> justice/revenge reveal";
  }
  if (/kindness|help|stranger|saved/i.test(lower)) {
    return "hardship -> unexpected kindness -> emotional payoff";
  }
  if (/war|loss|return|memory/i.test(lower)) {
    return "separation/loss -> memory clue -> late truth -> bittersweet closure";
  }
  return "emotional hook -> conflict -> surprise turn -> moral ending";
}

function analyzeResearchStory({ title, summary, source, category, url }) {
  const text = `${title} ${summary} ${source} ${url}`;
  const keywords = [...new Set([...researchKeywordsForCategory(category), ...String(title || "").toLowerCase().split(/[^a-zа-я0-9]+/i).filter((word) => word.length > 4).slice(0, 6)])].slice(0, 12);
  const emotion = detectResearchEmotion(text, category);
  const emotionalIntensity = scoreFromMatches(text, ["secret", "betrayal", "war", "revenge", "mother", "inheritance", "unexpected", "tears", "truth"], 42, 7);
  const surpriseFactor = scoreFromMatches(text, ["secret", "found", "truth", "revealed", "unexpected", "twist", "will", "letter", "envelope"], 35, 8);
  const sourceBoost = /reddit|facebook|quora|lovewhatmatters|people|rd\.com/i.test(`${source} ${url}`) ? 8 : 0;
  const similarityScore = Math.min(100, Math.round((scoreFromMatches(text, ["family", "mother", "son", "daughter", "inheritance", "betrayal", "love", "kindness", "secret"], 38, 6) + emotionalIntensity) / 2));
  const viralScore = Math.min(100, Math.round((emotionalIntensity * 0.38) + (surpriseFactor * 0.36) + (similarityScore * 0.18) + sourceBoost));
  return {
    emotion,
    keywords,
    emotional_intensity: emotionalIntensity,
    story_structure: detectStoryStructure(text),
    surprise_factor: surpriseFactor,
    viral_probability: viralScore,
    viral_score: viralScore,
    similarity_score: similarityScore
  };
}

function makeResearchSummary(title, category, source) {
  const emotion = detectResearchEmotion(title, category);
  return `Summary only: public ${source || "web"} result about ${normalizeResearchCategory(category)} with ${emotion} angle. Use it as a pattern signal only; create new characters, setting, plot and ending.`;
}

function cleanResearchSnippet(value = "") {
  return htmlDecode(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 320);
}

function normalizeResearchStory(raw, category) {
  const title = htmlDecode(raw.title || "Untitled story").slice(0, 220);
  const url = cleanResearchUrl(raw.url || raw.source_url || "");
  const source = raw.source || (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "web";
    }
  })();
  const snippet = cleanResearchSnippet(raw.snippet || raw.summary || "");
  const summary = raw.summary || (snippet
    ? `Summary only from public search snippet: ${snippet}`
    : makeResearchSummary(title, category, source));
  const analysis = analyzeResearchStory({ title, summary, source, category, url });
  const now = new Date().toISOString();
  return {
    id: raw.id || crypto.randomUUID(),
    title,
    source,
    url,
    source_url: url,
    snippet,
    summary,
    emotion: analysis.emotion,
    emotional_angle: analysis.emotion,
    keywords: analysis.keywords,
    similarity_score: analysis.similarity_score,
    viral_score: analysis.viral_score,
    viral_probability: analysis.viral_probability,
    emotional_intensity: analysis.emotional_intensity,
    story_structure: analysis.story_structure,
    surprise_factor: analysis.surprise_factor,
    category: normalizeResearchCategory(category),
    status: raw.status || "researched",
    source_status: raw.source_status || "live_search",
    provider: raw.provider || "",
    created_at: raw.created_at || now,
    updated_at: now
  };
}

function emotionalAngleFromTitle(title = "") {
  const text = title.toLowerCase();
  if (/mother|father|son|daughter|family|мать|отец|сын|дочь|семь/i.test(text)) return "family loyalty, guilt, reconciliation";
  if (/betray|cheat|husband|wife|измен|муж|жен/i.test(text)) return "betrayal, shock, hard choice";
  if (/inherit|will|money|house|наслед|дом|квартир|деньг/i.test(text)) return "inheritance conflict, hidden truth";
  if (/lonely|alone|одиноч/i.test(text)) return "loneliness, hope, late-life dignity";
  return "emotional life lesson with an unexpected turn";
}

function fallbackResearchItems(query) {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      source: "Love What Matters",
      source_url: "https://www.lovewhatmatters.com/",
      title: "Personal family and relationship stories",
      summary: "Public trend signal: emotional first-person stories often start with a vulnerable domestic moment and build toward a moral choice.",
      emotional_angle: "family loyalty, compassion, unexpected kindness",
      query,
      status: "fallback_seed",
      created_at: now
    },
    {
      id: crypto.randomUUID(),
      source: "Reader's Digest",
      source_url: "https://www.rd.com/list/true-stories/",
      title: "True life story collections",
      summary: "Public trend signal: short readable setups, ordinary people, a clear twist, and a hopeful final beat are common engagement patterns.",
      emotional_angle: "nostalgia, surprise, hope",
      query,
      status: "fallback_seed",
      created_at: now
    },
    {
      id: crypto.randomUUID(),
      source: "Public social discussions",
      source_url: "https://www.reddit.com/r/relationships/",
      title: "Relationship conflict discussions",
      summary: "Public trend signal: family conflict stories draw comments when the dilemma is easy to understand and morally debatable.",
      emotional_angle: "conflict, anger, empathy, debate",
      query,
      status: "fallback_seed",
      created_at: now
    }
  ];
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "user-agent": "AI Story Traffic Platform research bot",
        accept: "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        error: error.name === "AbortError" ? "request_timeout" : safeMetaError(error)
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function researchProviderDiagnostics() {
  return researchProviderOrder.map((provider) => ({
    id: provider.id,
    name: provider.name,
    env: provider.env,
    configured: Boolean(process.env[provider.env])
  }));
}

function selectedResearchProvider() {
  return researchProviderOrder.find((provider) => Boolean(process.env[provider.env])) || null;
}

function baseResearchQuery(category) {
  const normalized = normalizeResearchCategory(category);
  return researchQueryByCategory[normalized] || `${normalized} emotional life story`;
}

function buildResearchQuery(category, sourceProfile) {
  const normalized = normalizeResearchCategory(category);
  const base = baseResearchQuery(normalized);
  const keywords = researchKeywordsForCategory(normalized).slice(0, 3).join(" ");
  return `${base} ${sourceProfile.query} ${keywords}`.slice(0, 390);
}

function sourceFromUrl(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function providerErrorMessage(data = {}) {
  const value = data.error || data.error_message || data.message || data.detail || data.raw || "";
  if (typeof value === "string") return value.slice(0, 220);
  try {
    return JSON.stringify(value).slice(0, 220);
  } catch {
    return "provider_error";
  }
}

function normalizeLiveSearchResult(raw, category, provider, sourceProfile) {
  const url = cleanResearchUrl(raw.url || raw.link || "");
  if (!/^https?:\/\//i.test(url)) return null;
  const snippet = cleanResearchSnippet(raw.snippet || raw.description || raw.content || raw.summary || "");
  return normalizeResearchStory({
    title: raw.title || raw.name || sourceFromUrl(url),
    url,
    source: sourceProfile?.source || sourceFromUrl(url),
    snippet,
    summary: snippet ? `Summary only from public search snippet: ${snippet}` : "",
    source_status: "live_search",
    provider: provider.name
  }, category);
}

async function searchWithTavily(provider, query, category, sourceProfile, limit) {
  const result = await fetchJsonWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env[provider.env]}`
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
      max_results: Math.min(limit, 10)
    })
  }, 14000);
  if (!result.ok) throw new Error(`${provider.id}_status_${result.status}: ${providerErrorMessage(result.data)}`);
  return (result.data.results || [])
    .map((item) => normalizeLiveSearchResult({
      title: item.title,
      url: item.url,
      snippet: item.content
    }, category, provider, sourceProfile))
    .filter(Boolean);
}

async function searchWithBrave(provider, query, category, sourceProfile, limit) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(limit, 20)),
    country: "US",
    search_lang: "en",
    extra_snippets: "true"
  });
  const result = await fetchJsonWithTimeout(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: {
      "X-Subscription-Token": process.env[provider.env]
    }
  }, 14000);
  if (!result.ok) throw new Error(`${provider.id}_status_${result.status}: ${providerErrorMessage(result.data)}`);
  return (result.data.web?.results || [])
    .map((item) => normalizeLiveSearchResult({
      title: item.title,
      url: item.url,
      snippet: [item.description, ...(item.extra_snippets || [])].filter(Boolean).join(" ")
    }, category, provider, sourceProfile))
    .filter(Boolean);
}

async function searchWithSerpApi(provider, query, category, sourceProfile, limit) {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: process.env[provider.env],
    num: String(Math.min(limit, 20))
  });
  const result = await fetchJsonWithTimeout(`https://serpapi.com/search.json?${params.toString()}`, {}, 16000);
  if (!result.ok || result.data.error) throw new Error(`${provider.id}_status_${result.status}: ${providerErrorMessage(result.data)}`);
  return (result.data.organic_results || [])
    .map((item) => normalizeLiveSearchResult({
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }, category, provider, sourceProfile))
    .filter(Boolean);
}

async function searchWithBing(provider, query, category, sourceProfile, limit) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(limit, 20)),
    mkt: "en-US",
    responseFilter: "Webpages"
  });
  const result = await fetchJsonWithTimeout(`https://api.bing.microsoft.com/v7.0/search?${params.toString()}`, {
    headers: {
      "Ocp-Apim-Subscription-Key": process.env[provider.env]
    }
  }, 14000);
  if (!result.ok) throw new Error(`${provider.id}_status_${result.status}: ${providerErrorMessage(result.data)}`);
  return (result.data.webPages?.value || [])
    .map((item) => normalizeLiveSearchResult({
      title: item.name,
      url: item.url,
      snippet: item.snippet
    }, category, provider, sourceProfile))
    .filter(Boolean);
}

async function searchLiveResearchSource(provider, category, sourceProfile, perSourceLimit) {
  const query = buildResearchQuery(category, sourceProfile);
  if (provider.id === "tavily") return searchWithTavily(provider, query, category, sourceProfile, perSourceLimit);
  if (provider.id === "brave") return searchWithBrave(provider, query, category, sourceProfile, perSourceLimit);
  if (provider.id === "serpapi") return searchWithSerpApi(provider, query, category, sourceProfile, perSourceLimit);
  if (provider.id === "bing") return searchWithBing(provider, query, category, sourceProfile, perSourceLimit);
  throw new Error("research_provider_not_supported");
}

function fallbackResearchStories(category, limit) {
  const normalized = normalizeResearchCategory(category);
  const seeds = [
    ["Reddit", "A woman discovered the family secret after an inheritance argument", "https://www.reddit.com/r/relationships/"],
    ["Public story websites", "A mother-in-law conflict turned into a confession nobody expected", "https://www.lovewhatmatters.com/"],
    ["News", "A real family reunion story with a late emotional reveal", "https://people.com/"],
    ["Forums", "A long silence between mother and adult son ended after one letter", "https://www.mumsnet.com/"],
    ["Quora", "What true story had the most unexpected ending?", "https://www.quora.com/"],
    ["Public story websites", "A poor family was humiliated before a surprising act of kindness", "https://www.rd.com/list/true-stories/"]
  ];
  return seeds.slice(0, limit).map(([source, title, url]) => normalizeResearchStory({
    title,
    source,
    url,
    summary: makeResearchSummary(title, normalized, source),
    status: "fallback_seed",
    source_status: "fallback_seed",
    provider: "fallback_seed"
  }, normalized));
}

async function runInternetStoryResearch(payload = {}) {
  const category = normalizeResearchCategory(payload.category || payload.query || "");
  const limit = Math.max(1, Math.min(Number(payload.limit || 20), 40));
  const perSourceLimit = Math.max(2, Math.ceil(limit / researchSourceProfiles.length) + 1);
  const searchErrors = [];
  const provider = selectedResearchProvider();
  const providerDiagnostics = researchProviderDiagnostics();
  const providerUsed = provider?.name || "none";
  const liveSearchAttempted = Boolean(provider);
  let found = [];
  if (provider) {
    const sourceResults = await Promise.allSettled(
      researchSourceProfiles.map((sourceProfile) => searchLiveResearchSource(provider, category, sourceProfile, perSourceLimit))
    );
    for (const result of sourceResults) {
      if (result.status === "fulfilled") found.push(...result.value);
      if (result.status === "rejected") searchErrors.push(result.reason?.message || "search_failed");
    }
  }
  const byFoundUrl = new Map();
  for (const story of found) {
    if (story.url && !byFoundUrl.has(story.url)) byFoundUrl.set(story.url, story);
  }
  found = [...byFoundUrl.values()]
    .sort((a, b) => (b.viral_score + b.similarity_score) - (a.viral_score + a.similarity_score))
    .slice(0, limit);
  let sourceStatus = found.length ? "live_search" : "fallback_seed";
  if (!found.length) {
    found = fallbackResearchStories(category, limit);
  }

  const existingStories = readResearchStories();
  const byUrl = new Map(existingStories.map((item) => [item.url || item.source_url, item]));
  let savedNew = 0;
  let skippedDuplicates = 0;
  for (const story of found) {
    const key = story.url || story.source_url;
    if (!key) continue;
    if (!byUrl.has(key)) savedNew += 1;
    else skippedDuplicates += 1;
    byUrl.set(key, { ...(byUrl.get(key) || {}), ...story, updated_at: new Date().toISOString() });
  }
  const stories = [...byUrl.values()]
    .sort((a, b) => Number(b.viral_score || 0) - Number(a.viral_score || 0) || Number(b.similarity_score || 0) - Number(a.similarity_score || 0))
    .slice(0, 500);
  await writeResearchStories(stories);
  const items = stories.map((story) => ({
    id: story.id,
    source: story.source,
    source_url: story.url || story.source_url,
    title: story.title,
    summary: story.summary,
    emotional_angle: story.emotion,
    query: category,
    status: story.status,
    created_at: story.created_at,
    updated_at: story.updated_at
  }));
  await writeInternetResearchItems(items.slice(0, 100));
  const runDiagnostics = {
    provider_used: providerUsed,
    source_status: sourceStatus,
    live_search_attempted: liveSearchAttempted,
    configured_providers: providerDiagnostics.filter((item) => item.configured).map((item) => item.name),
    provider_config: providerDiagnostics,
    results_count: found.length,
    found_count: found.length,
    saved_new: savedNew,
    skipped_duplicates: skippedDuplicates,
    search_errors: searchErrors.slice(0, 8),
    category,
    limit,
    updated_at: new Date().toISOString()
  };
  const brain = readProjectBrain();
  const currentResearch = brain.internet_research && typeof brain.internet_research === "object"
    ? brain.internet_research
    : {};
  brain.internet_research = {
    ...currentResearch,
    autopilot_v1: {
      ...(currentResearch.autopilot_v1 || {}),
      latest_run: runDiagnostics,
      updated_at: new Date().toISOString()
    }
  };
  brain.updated_at = new Date().toISOString();
  await writeProjectBrain(brain);
  return {
    ok: true,
    module: "Internet Research AI v2",
    category,
    limit,
    provider_used: providerUsed,
    provider_config: providerDiagnostics,
    live_search_attempted: liveSearchAttempted,
    source_status: sourceStatus,
    search_errors: searchErrors.slice(0, 8),
    found_count: found.length,
    results_count: found.length,
    saved_new: savedNew,
    skipped_duplicates: skippedDuplicates,
    stories: found.map((story) => ({
      title: story.title,
      source: story.source,
      url: story.url || story.source_url,
      snippet: story.snippet || shortText(story.summary || "", 220),
      summary: story.summary,
      emotion: story.emotion,
      keywords: story.keywords,
      similarity_score: story.similarity_score,
      viral_score: story.viral_score,
      emotional_intensity: story.emotional_intensity,
      story_structure: story.story_structure,
      surprise_factor: story.surprise_factor,
      viral_probability: story.viral_probability,
      source_status: story.source_status || sourceStatus,
      provider: story.provider || providerUsed
    })),
    items,
    sources: researchSourceProfiles.map((item) => item.source),
    originality_rule: "Research stores summaries and source links only. Use public trends as pattern signals; never copy text, characters, images or endings."
  };
}

function buildCompetitorAutopilotAnalysis() {
  const base = buildCompetitorAnalysis();
  const page = buildAIPageAnalysis();
  const opportunities = (base.popular_topics || []).map((topic) => {
    const own = (page.best_themes || []).find((item) => item.name === topic.name);
    return {
      topic: topic.name,
      competitor_signal: topic.count || 0,
      own_posts_count: own?.posts_count || 0,
      recommendation: own ? "Compare against your loaded posts before scaling." : "Market signal exists, but your page has little/no data yet."
    };
  }).slice(0, 8);
  return {
    ok: true,
    module: "Competitor Analyzer",
    generated_at: new Date().toISOString(),
    competitors_count: base.stats?.competitors_count || 0,
    competitors: base.competitors || [],
    popular_topics: base.popular_topics || [],
    popular_emotions: base.popular_emotions || [],
    image_patterns: base.best_images || [],
    headline_patterns: base.best_headlines || [],
    engagement_comparison: opportunities,
    recommendations: base.recommendations || [],
    safety: {
      copying_allowed: false,
      use_only_patterns: true,
      public_data_only: true
    }
  };
}

function pickSignal(list, fallback, key = "name") {
  return list?.[0]?.[key] || fallback;
}

function storyIdeaTemplate(seed, topic, emotion, hookPatternName) {
  const names = [
    ["Nina", "her adult son", "a locked drawer"],
    ["Galina", "her daughter-in-law", "an old envelope"],
    ["Tamara", "her sister", "a hospital receipt"],
    ["Elena", "her husband", "a forgotten key"]
  ];
  const [hero, relation, object] = pick(names, seed);
  const conflict = pick([
    "a family argument about a small apartment reveals a secret kept for twenty years",
    "an inheritance dispute turns into a confession nobody expected",
    "a quiet kitchen conversation exposes why the family stopped speaking",
    "a late phone call forces everyone to choose between pride and forgiveness"
  ], seed + topic);
  const moral = pick([
    "Silence can protect a family for a while, but truth is the only thing that can heal it.",
    "The person who seems cruel may be the one who carried the heaviest burden.",
    "Money can split a family, but one honest conversation can show what was really lost.",
    "Forgiveness does not erase the past, but it can stop the past from ruling the house."
  ], seed + emotion);
  return {
    title: `${hero} found ${object} and finally understood why ${relation} had been silent`,
    hook: `${hero} thought it was an ordinary family quarrel. Then ${object} fell out of an old bag, and everyone at the table went quiet.`,
    plot: `${hero}, a woman in her late fifties, faces ${conflict}. The Facebook part stops at the moment when the hidden object appears. The website continuation reveals a different situation, different motives, and a final choice built around dignity, family memory and hope.`,
    emotion,
    moral,
    topic,
    hook_pattern: hookPatternName
  };
}

async function generateStoryIdeas(payload = {}) {
  const count = Math.max(1, Math.min(Number(payload.count || 3), 6));
  const page = buildAIPageAnalysis();
  const competitor = buildCompetitorAutopilotAnalysis();
  const research = readInternetResearchItems();
  const ideas = readStoryIdeas();
  const now = new Date().toISOString();
  const newIdeas = [];
  for (let index = 0; index < count; index += 1) {
    const seed = `${now}-${index}-${crypto.randomUUID()}`;
    const topic = String(payload.topic || pickSignal(page.best_themes, pickSignal(competitor.popular_topics, "family"))).trim();
    const emotion = String(payload.emotion || pickSignal(page.best_emotions, "hope and anxiety")).trim();
    const hookName = pickSignal(page.best_hooks, "hidden truth hook");
    newIdeas.push({
      id: crypto.randomUUID(),
      ...storyIdeaTemplate(seed, topic, emotion, hookName),
      status: "needs_approval",
      approval_required: true,
      publish_allowed: false,
      sources_used_as_patterns: research.slice(0, 3).map((item) => ({ title: item.title, source_url: item.source_url, emotional_angle: item.emotional_angle })),
      originality_guard: "Create new characters, different situation, different ending and different wording. Never copy competitor or research text.",
      created_at: now,
      updated_at: now
    });
  }
  const saved = [...newIdeas, ...ideas].slice(0, 100);
  await writeStoryIdeas(saved);
  return {
    ok: true,
    module: "Story Generator",
    generated_count: newIdeas.length,
    ideas: saved,
    new_ideas: newIdeas,
    safety: {
      publish_allowed: false,
      approval_required: true,
      plagiarism_policy: "patterns only, original stories only"
    }
  };
}

function normalizeGeneratedLength(value = "") {
  return ["short", "medium", "long"].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : "medium";
}

function storyLengthPlan(length) {
  const plans = {
    short: { paragraphs: 6, label: "short", target: "700-1000 characters" },
    medium: { paragraphs: 9, label: "medium", target: "1200-1800 characters" },
    long: { paragraphs: 12, label: "long", target: "2200-3200 characters" }
  };
  return plans[normalizeGeneratedLength(length)] || plans.medium;
}

function storyCategoryProfile(category, seed) {
  const normalized = normalizeResearchCategory(category);
  const profiles = {
    betrayal: {
      title_objects: ["a grocery receipt", "a second phone", "a hotel key card", "a bank transfer"],
      settings: ["a small apartment kitchen", "a quiet family dinner", "a rainy bus stop", "a modest birthday party"],
      conflicts: ["a wife thinks her husband has betrayed her", "a daughter discovers her father's double life", "a sister learns why the family savings disappeared"],
      turns: ["the secret was not an affair, but a sacrifice made to protect someone sick", "the money went to a child nobody in the family knew about", "the person who looked guilty had been covering for someone weaker"],
      morals: ["The first truth can wound, but the whole truth can change the heart."]
    },
    "mother in law": {
      title_objects: ["an old apron pocket", "a locked drawer", "a soup recipe", "a folded hospital bill"],
      settings: ["a cramped kitchen", "a Sunday lunch", "a village courtyard", "a hallway outside the apartment"],
      conflicts: ["a daughter-in-law believes her mother-in-law is trying to ruin the marriage", "two women fight over the son's loyalty", "a family meal turns into a quiet humiliation"],
      turns: ["the older woman was hiding a debt she took on for the young couple", "the harsh words came from fear, not hatred", "the daughter-in-law finds proof that the mother-in-law defended her for years"],
      morals: ["Sometimes the hardest person in the family is also the one who carried the most pain."]
    },
    inheritance: {
      title_objects: ["a will", "a house key", "a dusty envelope", "a notebook with names"],
      settings: ["an old family house", "a notary office", "a cold stairwell", "a kitchen after the funeral"],
      conflicts: ["siblings argue over a house before the funeral flowers fade", "a daughter is cut out of the will", "a son returns only when money is mentioned"],
      turns: ["the smallest inheritance contains the only thing that matters", "the excluded child had already received the greatest sacrifice", "the house was left to the person who had quietly cared for everyone"],
      morals: ["Inheritance reveals not only what people own, but what they value."]
    },
    love: {
      title_objects: ["a letter", "a train ticket", "a photo", "a wedding ring"],
      settings: ["a station platform", "a hospital corridor", "a quiet cafe", "a bench near an old house"],
      conflicts: ["two people meet after decades of silence", "a woman learns why her first love vanished", "a husband and wife almost separate after one careless sentence"],
      turns: ["the silence was forced by a family promise", "the lost letter finally reaches the person it was meant for", "love returns as forgiveness, not as a fairy tale"],
      morals: ["Real love is not always loud; sometimes it waits in silence until truth is safe."]
    },
    revenge: {
      title_objects: ["a recording", "a receipt", "a court letter", "a photograph"],
      settings: ["a family celebration", "a workplace office", "a shared apartment", "a courthouse hallway"],
      conflicts: ["a quiet woman is humiliated by relatives", "a brother takes what was not his", "a neighbor spreads a lie that ruins a family"],
      turns: ["the revenge is not cruelty, but calm proof of the truth", "the person everyone mocked becomes the one who saves the house", "justice arrives through dignity, not shouting"],
      morals: ["The strongest answer is sometimes a quiet truth that cannot be denied."]
    }
  };
  const profile = profiles[normalized] || {
    title_objects: ["an old envelope", "a kitchen note", "a forgotten key", "a family photograph"],
    settings: ["a modest kitchen", "a family dinner", "a hospital corridor", "an old house"],
    conflicts: ["a family argument reveals a secret", "an adult child learns why a parent stayed silent", "a small decision divides the family"],
    turns: ["the person who seemed guilty had been protecting someone else", "the secret changes how everyone remembers the past", "forgiveness comes only after the hardest truth is spoken"],
    morals: ["Family truth can arrive late, but it can still heal what silence broke."]
  };
  return {
    category: normalized,
    object: pick(profile.title_objects, `${seed}:object`),
    setting: pick(profile.settings, `${seed}:setting`),
    conflict: pick(profile.conflicts, `${seed}:conflict`),
    turn: pick(profile.turns, `${seed}:turn`),
    moral: pick(profile.morals, `${seed}:moral`)
  };
}

function topResearchSignalsForStory(category, limit = 8) {
  const normalized = normalizeResearchCategory(category);
  const all = readResearchStories()
    .map((item) => ({
      ...item,
      combined_score: Number(item.viral_score || 0) + Number(item.similarity_score || 0)
    }))
    .sort((a, b) => b.combined_score - a.combined_score);
  const byCategory = all.filter((item) => String(item.category || "").toLowerCase() === normalized);
  const liveTavily = byCategory.filter((item) => item.source_status === "live_search" && /tavily/i.test(item.provider || ""));
  const liveAny = byCategory.filter((item) => item.source_status === "live_search");
  const selected = (liveTavily.length ? liveTavily : liveAny.length ? liveAny : byCategory.length ? byCategory : all).slice(0, limit);
  return selected.map((item) => ({
    source: item.source || sourceFromUrl(item.url || item.source_url || ""),
    url: item.url || item.source_url || "",
    emotion: item.emotion || "",
    keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 8) : [],
    viral_score: Number(item.viral_score || 0),
    similarity_score: Number(item.similarity_score || 0),
    source_status: item.source_status || "",
    provider: item.provider || ""
  }));
}

function bestFacebookPostSignals(limit = 5) {
  return readFacebookPosts()
    .map((post) => ({
      id: post.facebook_post_id || post.id || "",
      permalink_url: post.permalink_url || "",
      total_score: Number(post.total_score || 0),
      likes_count: Number(post.likes_count || 0),
      comments_count: Number(post.comments_count || 0),
      shares_count: Number(post.shares_count || 0),
      link_clicks_count: Number(post.link_clicks_count || 0),
      text_length: String(post.message || "").length,
      hook_style: shortText(String(post.message || "").split(/\n+/).filter(Boolean)[0] || "", 120)
    }))
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, limit);
}

function researchKeywordBlend(signals) {
  const words = [];
  for (const signal of signals) {
    for (const keyword of signal.keywords || []) {
      if (keyword && !words.includes(keyword)) words.push(keyword);
    }
  }
  return words.slice(0, 10);
}

function buildGeneratedStoryText({ profile, emotion, length, seed, keywords, styleGuidance = {} }) {
  const plan = storyLengthPlan(length);
  const hero = pick(["Mara", "Helen", "Nina", "Galina", "Elena", "Tamara"], `${seed}:hero`);
  const relation = pick(["her adult son", "her husband", "her daughter-in-law", "her younger sister", "her late mother's neighbor"], `${seed}:relation`);
  const witness = pick(["the kettle was still boiling", "nobody touched the tea", "the phone kept buzzing on the table", "the window was open to the evening rain"], `${seed}:witness`);
  const settingLower = String(profile.setting || "").toLowerCase();
  const domesticDetail = pick(["the tea had gone cold", "a chipped cup stood near her elbow", "someone had left wet shoes by the door", "the old kitchen clock ticked too loudly"], `${seed}:detail`);
  const transitDetail = pick(["a bus ticket was turning soft from the rain", "her shopping bag had slipped against the bench", "headlights moved across the wet pavement", "the timetable shook in the wind"], `${seed}:transit-detail`);
  const hospitalDetail = pick(["the corridor smelled faintly of antiseptic", "a plastic chair creaked under her coat", "someone's discharge papers lay folded in half", "the vending machine hummed too loudly"], `${seed}:hospital-detail`);
  const eventDetail = pick(["paper plates were still on the table", "a half-cut cake stood untouched", "someone had turned the music down", "the children had gone quiet in the next room"], `${seed}:event-detail`);
  const stairwellDetail = pick(["the stairwell light flickered above her", "a neighbor's door clicked shut upstairs", "dust gathered along the concrete step", "the cold handrail left a mark on her palm"], `${seed}:stairwell-detail`);
  const officeDetail = pick(["a stack of documents lay crooked on the desk", "the stamp pad was still open", "the notary's clock sounded too loud", "someone had forgotten a cheap pen beside the papers"], `${seed}:office-detail`);
  const everydayDetail = /bus|stop|station|platform/.test(settingLower)
    ? transitDetail
    : /hospital|corridor/.test(settingLower)
      ? hospitalDetail
      : /stairwell|hallway/.test(settingLower)
        ? stairwellDetail
        : /office|notary/.test(settingLower)
          ? officeDetail
      : /party|dinner|lunch|celebration/.test(settingLower)
        ? eventDetail
        : domesticDetail;
  const objectAnchor = /bus|stop|station|platform/.test(settingLower)
    ? "beside a wet ticket and her shopping bag"
    : /hospital|corridor/.test(settingLower)
      ? "beside folded hospital papers"
      : /stairwell|hallway/.test(settingLower)
        ? "on the concrete step beside her shopping bag"
        : /office|notary/.test(settingLower)
          ? "beside a stack of unsigned papers"
      : /party|dinner|lunch|celebration/.test(settingLower)
        ? "beside the paper plates and cold tea"
        : "next to the cold tea";
  const settingPhrase = /bus|stop|station|platform/.test(settingLower)
    ? `on the bench at ${profile.setting}`
    : /hospital|corridor/.test(settingLower)
      ? `on a plastic chair in ${profile.setting}`
      : /stairwell|hallway/.test(settingLower)
        ? `on the concrete step in ${profile.setting}`
        : /office|notary/.test(settingLower)
          ? `on the desk in ${profile.setting}`
    : /party|dinner|lunch|celebration/.test(settingLower)
      ? `on the table during ${profile.setting}`
      : `in ${profile.setting}`;
  const conflictScene = String(profile.conflict || "")
    .replace("a daughter is cut out of the will", "a daughter being cut out of the will")
    .replace("siblings argue over a house before the funeral flowers fade", "siblings arguing over a house before the funeral flowers had faded")
    .replace("a son returns only when money is mentioned", "a son returning only when money was mentioned");
  const sceneDetail = everydayDetail ? everydayDetail.charAt(0).toUpperCase() + everydayDetail.slice(1) : "";
  const title = `${hero} found ${profile.object}, and the whole family suddenly went silent`;
  const hook = `${hero} noticed ${profile.object} before anyone else did.\n\nIt was lying ${settingPhrase}, ${objectAnchor}, and even ${relation} suddenly stopped talking.\n\n"Who put this here?" she asked. No one answered.`;
  const paragraphs = [
    hook,
    `For years, ${hero} had been the one who smoothed every quarrel over. She made tea, changed the subject, wiped the table twice if her hands were shaking, and pretended family peace did not cost her anything.`,
    `But that evening was different. ${sceneDetail}, ${witness}, and what began as ${conflictScene} turned into a silence so heavy that even the chairs seemed too loud when someone moved.`,
    `${hero} picked up ${profile.object}. At first it looked ordinary. Then she saw one detail that did not belong, and her fingers tightened around the edge.`,
    `"Tell me this is not true," she said.\n\n${relation} looked at the floor.\n\n"Not here," came the answer.\n\n"Here," ${hero} said. "I've been quiet long enough."`,
    `The first explanation hurt her pride. The second hurt her heart. Everyone had a version of the truth, and every version made someone else look cruel.`,
    `Then ${relation} finally spoke. The words came slowly, not like a confession from a film, but like something tired and human. ${profile.turn}.`,
    `${hero} sat down because standing suddenly felt impossible. Anger was still there, but now it had names, dates, unpaid bills, old fear, and one decision nobody had dared to explain.`,
    `No one cried loudly. That would have been easier. Instead, they sat with cold tea between them while the truth moved around the table from face to face.`,
    `By midnight, nobody had won the argument. Still, something important had shifted: they were no longer fighting over the surface of the story.`,
    `In the morning, ${hero} put ${profile.object} back on the table and asked, softer this time, "What do we do with the truth now?"`,
    `No one had an easy answer. But for the first time in years, they stayed in the same room long enough to look for one. ${profile.moral}`
  ];
  const selected = paragraphs.slice(0, plan.paragraphs);
  if (!selected.some((paragraph) => paragraph.includes(profile.moral))) selected[selected.length - 1] = profile.moral;
  const keywordLine = keywords.length ? `\n\nResearch signal themes used only as inspiration: ${keywords.slice(0, 5).join(", ")}.` : "";
  return {
    title,
    hook,
    full_story: selected.join("\n\n"),
    moral: profile.moral,
    target_length: plan.target,
    keyword_note: keywordLine,
    emotion
  };
}

function imagePromptForGeneratedStory(story, profile) {
  return [
    "Photorealistic everyday documentary photo, not cinematic fantasy.",
    `Scene: ${profile.setting}, emotional ${story.emotion} moment, ordinary family conflict.`,
    "Characters: realistic people aged 45-70, natural faces, modest clothes, believable home interior.",
    `Key object: ${profile.object}.`,
    "Mood: tense but human, warm practical light, 35mm lens, no text, no watermark, no cartoon, no plastic AI skin."
  ].join(" ");
}

function latestGeneratedDraftItems(limit = 10) {
  return [...readGeneratedStories()]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

function generatedDraftByRef(ref) {
  const value = String(ref || "").trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return latestGeneratedDraftItems(10)[Number(value) - 1] || null;
  return readGeneratedStories().find((story) => story.id === value) || null;
}

function extractImageSceneSignals(story = {}) {
  const text = `${story.title || ""} ${story.hook || ""} ${story.full_story || ""} ${story.image_prompt || ""}`.toLowerCase();
  const setting = /kitchen|tea|kettle|table/.test(text)
    ? "modest apartment kitchen"
    : /hospital|corridor/.test(text)
      ? "hospital corridor"
      : /station|train|platform/.test(text)
        ? "train station platform"
        : /house|home|apartment|room/.test(text)
          ? "ordinary family apartment"
          : "real everyday home interior";
  const timeOfDay = /midnight|night/.test(text)
    ? "late evening"
    : /morning/.test(text)
      ? "early morning"
      : /rain|evening/.test(text)
        ? "rainy evening"
        : "soft evening light";
  const emotion = story.emotion || detectResearchEmotion(text, story.category || "");
  const characters = /mother-in-law|daughter-in-law/.test(text)
    ? "older mother-in-law and younger daughter-in-law, ordinary realistic faces"
    : /husband|wife/.test(text)
      ? "middle-aged husband and wife sitting apart with visible tension"
      : /son|daughter/.test(text)
        ? "older woman and adult child in a tense family moment"
        : "two or three ordinary adults aged 45-70 in a family conflict";
  const visualConflict = /receipt|phone|card|letter|envelope|will|key|photo/.test(text)
    ? "a small discovered object on the table becomes the emotional focus"
    : "silent family confrontation, people avoiding eye contact";
  const mainScene = `${characters} in ${setting}, ${visualConflict}`;
  return {
    main_scene: mainScene,
    characters,
    emotion,
    setting,
    time_of_day: timeOfDay,
    visual_conflict: visualConflict
  };
}

function imagePromptVariant(story, signals, style) {
  const styleText = {
    realistic_cinematic: "realistic cinematic documentary photo, natural color grade, 35mm lens, believable skin texture",
    dramatic_facebook_cover: "dramatic Facebook story cover, strong emotional hook, clear readable composition, high attention thumbnail",
    emotional_close_up: "emotional close-up, expressive eyes, restrained tears, shallow depth of field, intimate domestic realism"
  }[style] || style;
  return [
    styleText,
    `Story title: ${story.title}.`,
    `Main scene: ${signals.main_scene}.`,
    `Characters: ${signals.characters}.`,
    `Emotion: ${signals.emotion}.`,
    `Setting: ${signals.setting}.`,
    `Time of day: ${signals.time_of_day}.`,
    `Visual conflict: ${signals.visual_conflict}.`,
    "Photorealistic, ordinary people aged 40-70, modest clothes, real home details, natural imperfect faces.",
    "No text, no subtitles, no logo, no watermark, no cartoon, no glossy plastic AI faces, no extra fingers."
  ].join(" ");
}

async function createImagePromptsForGeneratedDraft(ref = "1") {
  const draft = generatedDraftByRef(ref);
  if (!draft) {
    return {
      ok: false,
      code: "draft_not_found",
      message: "Generated draft not found. Use /drafts to see draft numbers."
    };
  }
  const signals = extractImageSceneSignals(draft);
  const styles = ["realistic_cinematic", "dramatic_facebook_cover", "emotional_close_up"];
  const now = new Date().toISOString();
  const created = styles.map((style) => ({
    id: crypto.randomUUID(),
    draft_id: draft.id,
    generated_story_id: draft.id,
    story_title: draft.title,
    prompt: imagePromptVariant(draft, signals, style),
    style,
    status: "needs_approval",
    created_at: now,
    updated_at: now,
    approval_required: true,
    publish_allowed: false,
    generated_image_url: "",
    visual_analysis: signals
  }));
  const next = [...created, ...readImageQueue()].slice(0, 200);
  await writeImageQueue(next);
  return {
    ok: true,
    module: "Image Generator v2",
    draft_id: draft.id,
    draft_title: draft.title,
    created_count: created.length,
    prompts: created,
    queue: next,
    safety: {
      prompt_only: true,
      image_generation_enabled: false,
      approval_required: true,
      publish_allowed: false
    }
  };
}

function latestImageQueueItems(limit = 10) {
  return [...readImageQueue()]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

function imageQueueItemByNumber(numberText) {
  const index = Number(numberText);
  if (!Number.isInteger(index) || index < 1) return null;
  return latestImageQueueItems(10)[index - 1] || null;
}

async function updateImageQueueStatusByNumber(numberText, status) {
  const prompt = imageQueueItemByNumber(numberText);
  if (!prompt) return null;
  const updated = readImageQueue().map((item) => item.id === prompt.id
    ? {
        ...item,
        status,
        approval_required: true,
        publish_allowed: false,
        updated_at: new Date().toISOString()
      }
    : item);
  await writeImageQueue(updated);
  if (status === "approved") {
    await autoSyncProjectBrainV2({ sources: ["images"], reason: "image_prompt_approved" });
  }
  return updated.find((item) => item.id === prompt.id);
}

function viralPredictionScore(researchSignals, facebookSignals, length) {
  const researchBase = researchSignals.length
    ? Math.round(researchSignals.reduce((sum, item) => sum + ((Number(item.viral_score || 0) + Number(item.similarity_score || 0)) / 2), 0) / researchSignals.length)
    : 45;
  const fbBase = facebookSignals.length
    ? Math.min(25, Math.round(facebookSignals.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / facebookSignals.length / 10))
    : 8;
  const lengthBoost = length === "medium" ? 7 : length === "long" ? 4 : 3;
  return Math.max(1, Math.min(100, researchBase + fbBase + lengthBoost));
}

async function generateOriginalStoryV2(payload = {}) {
  const category = normalizeResearchCategory(payload.category || "betrayal");
  const length = normalizeGeneratedLength(payload.length || "medium");
  let researchSignals = topResearchSignalsForStory(category, 8);
  if (!researchSignals.some((item) => item.source_status === "live_search")) {
    await runInternetStoryResearch({ category, limit: 20 });
    researchSignals = topResearchSignalsForStory(category, 8);
  }
  const facebookSignals = bestFacebookPostSignals(5);
  const topEmotion = researchSignals.find((item) => item.emotion)?.emotion || "";
  const emotion = String(payload.emotion || topEmotion || "anxiety and hope").trim();
  const seed = `${category}:${emotion}:${length}:${Date.now()}:${crypto.randomUUID()}`;
  const profile = storyCategoryProfile(category, seed);
  const keywords = researchKeywordBlend(researchSignals);
  const styleGuidance = await styleBrainGuidanceForGenerator();
  const draft = buildGeneratedStoryText({ profile, emotion, length, seed, keywords, styleGuidance });
  const score = viralPredictionScore(researchSignals, facebookSignals, length);
  const story = {
    id: crypto.randomUUID(),
    title: draft.title,
    category,
    emotion,
    length,
    hook: draft.hook,
    full_story: draft.full_story,
    moral: draft.moral,
    image_prompt: imagePromptForGeneratedStory(draft, profile),
    viral_prediction_score: score,
    why_it_should_work: [
      `Uses ${researchSignals.filter((item) => item.source_status === "live_search").length} live research signals from high-scoring public results.`,
      facebookSignals.length ? `Calibrated against ${facebookSignals.length} top Facebook posts from your loaded Page data.` : "Facebook Page data is not loaded enough yet, so scoring leans more on research signals.",
      `Built around ${category}, ${emotion}, a concrete object, family tension and a late reveal.`,
      `Style Brain guidance: ${styleGuidance.opening_style}, ${styleGuidance.dialogue_density}, ${styleGuidance.paragraph_rhythm}.`,
      "Original draft: new characters, new setting, new ending, no copied text."
    ].join(" "),
    research_signals: researchSignals,
    facebook_signals: facebookSignals,
    style_brain_guidance: styleGuidance,
    status: "needs_approval",
    approval_required: true,
    publish_allowed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const saved = [story, ...readGeneratedStories()].slice(0, 200);
  await writeGeneratedStories(saved);
  await autoSyncProjectBrainV2({ sources: ["generated"], reason: "story_generated" });
  await learnStyleBrainFromGeneratedStory(story);
  return {
    ok: true,
    module: "Story Generator v2",
    story,
    preview: {
      title: story.title,
      hook: story.hook,
      excerpt: shortText(story.full_story, 900),
      emotion: story.emotion,
      viral_prediction_score: story.viral_prediction_score,
      why_it_should_work: story.why_it_should_work
    },
    saved: true,
    generated_stories_count: saved.length,
    safety: {
      copied_research_text: false,
      source_links_only_for_inspiration: true,
      approval_required: true,
      publish_allowed: false
    }
  };
}

async function generateOriginalStoriesV2(payload = {}) {
  const count = Math.max(1, Math.min(Number(payload.count || 3), 8));
  const generated = [];
  for (let index = 0; index < count; index += 1) {
    const result = await generateOriginalStoryV2({
      ...payload,
      count: 1
    });
    generated.push(result.story);
  }
  return {
    ok: true,
    module: "Story Generator v2",
    count: generated.length,
    stories: generated,
    story: generated[0] || null,
    preview: generated.map((story, index) => ({
      index: index + 1,
      title: story.title,
      emotion: story.emotion,
      viral_prediction_score: story.viral_prediction_score,
      hook: story.hook,
      status: story.status
    })),
    generated_stories_count: readGeneratedStories().length,
    safety: {
      copied_research_text: false,
      source_links_only_for_inspiration: true,
      approval_required: true,
      publish_allowed: false
    }
  };
}

function imagePromptForIdea(idea) {
  return [
    "Photorealistic everyday family photo for a life story.",
    `Story title: ${idea.title}.`,
    `Scene: ${idea.topic}, ${idea.emotion}, ${idea.hook_pattern}.`,
    "Characters: realistic people aged 40-70, ordinary clothes, believable faces, natural skin texture.",
    "Place: modest kitchen or apartment, warm natural light, tense emotional moment, documentary 35mm look.",
    "No text, no logo, no watermark, no cartoon style, no plastic AI faces."
  ].join(" ");
}

async function enqueueImagePromptsForIdeas() {
  const ideas = readStoryIdeas();
  const queue = readImageQueue();
  const existingIdeaIds = new Set(queue.map((item) => item.story_idea_id));
  const now = new Date().toISOString();
  const created = [];
  for (const idea of ideas.filter((item) => !existingIdeaIds.has(item.id)).slice(0, 20)) {
    created.push({
      id: crypto.randomUUID(),
      story_idea_id: idea.id,
      story_title: idea.title,
      prompt: imagePromptForIdea(idea),
      status: "pending",
      generated_image_url: "",
      approval_required: true,
      publish_allowed: false,
      created_at: now,
      updated_at: now
    });
  }
  const next = [...created, ...queue].slice(0, 150);
  await writeImageQueue(next);
  return {
    ok: true,
    module: "Image Generator Queue",
    created_count: created.length,
    queue: next,
    safety: {
      generated_image_url_is_placeholder: true,
      approval_required: true
    }
  };
}

function bestPlanTimes() {
  const analysis = buildAIPageAnalysis();
  const buckets = (analysis.best_times || []).map((item) => item.name);
  if (buckets.some((item) => /18:00-21:00/.test(item))) return ["18:30", "19:30", "20:15"];
  if (buckets.some((item) => /12:00-18:00/.test(item))) return ["12:30", "15:30", "18:30"];
  return ["11:00", "15:00", "19:00"];
}

async function createDailyContentPlan(payload = {}) {
  const days = Math.max(1, Math.min(Number(payload.days || 1), 7));
  const slotsPerDay = Math.max(1, Math.min(Number(payload.slots_per_day || 3), 5));
  const ideas = readStoryIdeas();
  const times = bestPlanTimes();
  const now = new Date();
  const items = [];
  for (let day = 0; day < days; day += 1) {
    for (let slot = 0; slot < slotsPerDay; slot += 1) {
      const idea = ideas[(day * slotsPerDay + slot) % Math.max(ideas.length, 1)];
      const date = new Date(now);
      date.setDate(now.getDate() + day);
      const [hour, minute] = (times[slot % times.length] || "19:00").split(":").map(Number);
      date.setHours(hour, minute, 0, 0);
      items.push({
        id: crypto.randomUUID(),
        scheduled_for: date.toISOString(),
        local_time_hint: times[slot % times.length] || "19:00",
        story_idea_id: idea?.id || "",
        title: idea?.title || "Create a new original life story idea first",
        topic: idea?.topic || "family",
        emotion: idea?.emotion || "hope",
        status: "needs_approval",
        approval_required: true,
        publish_allowed: false,
        channel: "facebook_manual_after_approval",
        created_at: new Date().toISOString()
      });
    }
  }
  const existing = readContentPlan();
  const next = [...items, ...existing].slice(0, 100);
  await writeContentPlan(next);
  return {
    ok: true,
    module: "Scheduler",
    created_count: items.length,
    plan: next,
    safety: {
      autopublishing: false,
      approval_required_before_publishing: true
    }
  };
}

const schedulerV2Rhythm = [
  { step: "love", categories: ["love"], emotions: ["love", "hope", "family warmth"] },
  { step: "conflict", categories: ["family conflict", "mother in law", "inheritance"], emotions: ["anger", "anxiety", "betrayal"] },
  { step: "shock", categories: ["betrayal", "revenge"], emotions: ["surprise", "betrayal"] },
  { step: "hope", categories: ["kindness", "love"], emotions: ["hope", "family warmth"] },
  { step: "family", categories: ["family conflict", "inheritance", "mother in law"], emotions: ["family warmth", "sadness"] },
  { step: "twist", categories: ["unexpected ending", "betrayal"], emotions: ["surprise"] },
  { step: "resolution", categories: ["kindness", "love", "war"], emotions: ["hope", "sadness"] }
];

function approvedImagePromptByDraft() {
  const map = new Map();
  for (const item of latestImageQueueItems(200)) {
    if ((item.status || "") !== "approved") continue;
    const draftId = item.draft_id || item.generated_story_id || "";
    if (draftId && !map.has(draftId)) map.set(draftId, item);
  }
  return map;
}

function scheduledQueueItems(limit = 50) {
  return [...readScheduledPosts()]
    .filter((item) => (item.status || "draft") !== "skipped")
    .sort((a, b) => new Date(a.scheduled_time || 0) - new Date(b.scheduled_time || 0))
    .slice(0, limit);
}

function scheduledItemByNumber(numberText) {
  const index = Number(numberText);
  if (!Number.isInteger(index) || index < 1) return null;
  return scheduledQueueItems(50)[index - 1] || null;
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function schedulerTimesForDay() {
  const brainTimes = (readProjectBrain().best_times || [])
    .map((item) => item.time || item.name || "")
    .filter((value) => /^\d{1,2}:\d{2}$/.test(value))
    .slice(0, 3);
  return brainTimes.length ? brainTimes : ["11:00", "15:00", "19:30"];
}

function scheduledDateAt(baseDate, timeText) {
  const [hour, minute] = String(timeText || "19:30").split(":").map(Number);
  const date = new Date(baseDate);
  date.setHours(Number.isFinite(hour) ? hour : 19, Number.isFinite(minute) ? minute : 30, 0, 0);
  return date;
}

function parseMoveScheduleTime(dayText = "tomorrow", timeText = "19:30") {
  const base = new Date();
  const cleanDay = String(dayText || "tomorrow").toLowerCase();
  if (cleanDay === "tomorrow") base.setDate(base.getDate() + 1);
  if (cleanDay === "today") base.setDate(base.getDate());
  base.setHours(0, 0, 0, 0);
  return scheduledDateAt(base, timeText).toISOString();
}

function schedulerCandidateDrafts() {
  const imageByDraft = approvedImagePromptByDraft();
  const activeDraftIds = new Set(scheduledQueueItems(300).map((item) => item.draft_id));
  return latestGeneratedDraftItems(200)
    .filter((draft) => !["rejected"].includes(draft.status || ""))
    .filter((draft) => !activeDraftIds.has(draft.id))
    .map((draft) => ({
      draft,
      image: imageByDraft.get(draft.id) || null,
      score: Number(draft.viral_prediction_score || 0) + (imageByDraft.has(draft.id) ? 15 : 0)
    }))
    .sort((a, b) => b.score - a.score);
}

function draftMatchesRhythm(candidate, rhythm) {
  const category = String(candidate.draft.category || "").toLowerCase();
  const emotion = String(candidate.draft.emotion || "").toLowerCase();
  return rhythm.categories.includes(category) || rhythm.emotions.some((item) => emotion.includes(item));
}

function pickScheduleCandidate(candidates, usedDraftIds, recentThemes, rhythm) {
  const available = candidates.filter((item) => !usedDraftIds.has(item.draft.id));
  const preferred = available.filter((item) => draftMatchesRhythm(item, rhythm));
  const antiRepetition = (list) => list.filter((item) => {
    const theme = item.draft.category || "story";
    return !(recentThemes.length >= 2 && recentThemes[recentThemes.length - 1] === theme && recentThemes[recentThemes.length - 2] === theme);
  });
  return antiRepetition(preferred)[0] || antiRepetition(available)[0] || preferred[0] || available[0] || null;
}

async function createSchedulerV2Plan(options = {}) {
  const days = Math.max(1, Math.min(Number(options.days || 1), 7));
  const slotsPerDay = Math.max(1, Math.min(Number(options.slots_per_day || 3), 5));
  const candidates = schedulerCandidateDrafts();
  const created = [];
  const usedDraftIds = new Set();
  const recentThemes = [];
  const times = schedulerTimesForDay();
  const startDate = tomorrowDate();
  for (let day = 0; day < days; day += 1) {
    const baseDate = new Date(startDate);
    baseDate.setDate(startDate.getDate() + day);
    for (let slot = 0; slot < slotsPerDay; slot += 1) {
      const rhythm = schedulerV2Rhythm[(day * slotsPerDay + slot) % schedulerV2Rhythm.length];
      const candidate = pickScheduleCandidate(candidates, usedDraftIds, recentThemes, rhythm);
      if (!candidate) continue;
      usedDraftIds.add(candidate.draft.id);
      recentThemes.push(candidate.draft.category || "story");
      if (recentThemes.length > 3) recentThemes.shift();
      const scheduledTime = scheduledDateAt(baseDate, times[slot % times.length] || "19:30").toISOString();
      created.push({
        id: crypto.randomUUID(),
        draft_id: candidate.draft.id,
        image_prompt_id: candidate.image?.id || "",
        scheduled_time: scheduledTime,
        theme: candidate.draft.category || "",
        emotion: candidate.draft.emotion || "",
        status: "draft",
        title: candidate.draft.title || "",
        rhythm_step: rhythm.step,
        publish_allowed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }
  const next = [...readScheduledPosts(), ...created]
    .sort((a, b) => new Date(a.scheduled_time || 0) - new Date(b.scheduled_time || 0))
    .slice(0, 300);
  await writeScheduledPosts(next);
  return {
    ok: true,
    module: "AI Scheduler v2",
    created_count: created.length,
    days,
    plan: created,
    queue: scheduledQueueItems(50),
    warnings: [
      ...(!candidates.length ? ["No generated story drafts available. Use /generate betrayal first."] : []),
      ...(created.some((item) => !item.image_prompt_id) ? ["Some scheduled drafts do not have approved image prompts yet. Use /image 1 and /approve_image 1."] : [])
    ],
    safety: {
      autopublishing: false,
      approval_required: true,
      publish_allowed: false
    }
  };
}

function scheduleItemsForTomorrow() {
  const start = tomorrowDate();
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return scheduledQueueItems(200).filter((item) => {
    const date = new Date(item.scheduled_time || 0);
    return date >= start && date < end;
  });
}

async function approveSchedulerV2() {
  const updated = readScheduledPosts().map((item) => (item.status || "draft") === "draft"
    ? { ...item, status: "approved", publish_allowed: false, updated_at: new Date().toISOString() }
    : item);
  await writeScheduledPosts(updated);
  await autoSyncProjectBrainV2({ sources: ["schedules"], reason: "schedule_approved" });
  return {
    ok: true,
    module: "AI Scheduler v2",
    approved_count: updated.filter((item) => item.status === "approved").length,
    queue: scheduledQueueItems(50),
    safety: { autopublishing: false, publish_allowed: false }
  };
}

async function moveScheduledPost(numberText, dayText, timeText) {
  const item = scheduledItemByNumber(numberText);
  if (!item) return null;
  const movedTime = parseMoveScheduleTime(dayText, timeText);
  const updated = readScheduledPosts().map((scheduled) => scheduled.id === item.id
    ? { ...scheduled, scheduled_time: movedTime, status: "draft", publish_allowed: false, updated_at: new Date().toISOString() }
    : scheduled);
  await writeScheduledPosts(updated);
  return updated.find((scheduled) => scheduled.id === item.id);
}

async function unschedulePost(numberText) {
  const item = scheduledItemByNumber(numberText);
  if (!item) return null;
  const next = readScheduledPosts().filter((scheduled) => scheduled.id !== item.id);
  await deleteScheduledPostById(item.id);
  await writeScheduledPosts(next);
  return item;
}

function latestPublishingPackages(limit = 20) {
  return [...readPublishingPackages()]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

function publishingPackageByNumber(numberText) {
  const index = Number(numberText);
  if (!Number.isInteger(index) || index < 1) return null;
  return latestPublishingPackages(20)[index - 1] || null;
}

function approvedImageForDraft(draftId) {
  return latestImageQueueItems(200).find((item) =>
    (item.draft_id || item.generated_story_id || "") === draftId && item.status === "approved"
  ) || null;
}

function scheduleForDraft(draftId) {
  return scheduledQueueItems(200).find((item) => item.draft_id === draftId) || null;
}

function publishingPackageDetails(pkg) {
  if (!pkg) return null;
  const draft = readGeneratedStories().find((item) => item.id === pkg.draft_id) || null;
  const imagePrompt = readImageQueue().find((item) => item.id === pkg.image_prompt_id) || null;
  const schedule = readScheduledPosts().find((item) => item.id === pkg.schedule_id) || null;
  return {
    package: pkg,
    draft,
    image_prompt: imagePrompt,
    schedule,
    safety: {
      publish_allowed: false,
      approval_required: true,
      facebook_publishing: false
    }
  };
}

async function createPublishingPackageFromDraft(ref = "1") {
  const draft = generatedDraftByRef(ref);
  if (!draft) {
    return {
      ok: false,
      code: "draft_not_found",
      message: "Generated draft not found. Use /drafts to see draft numbers."
    };
  }
  const imagePrompt = approvedImageForDraft(draft.id);
  const schedule = scheduleForDraft(draft.id);
  const now = new Date().toISOString();
  const pkg = {
    id: crypto.randomUUID(),
    draft_id: draft.id,
    image_prompt_id: imagePrompt?.id || "",
    schedule_id: schedule?.id || "",
    status: "review",
    publish_allowed: false,
    approval_required: true,
    created_at: now,
    approved_at: null
  };
  const next = [pkg, ...readPublishingPackages()].slice(0, 300);
  await writePublishingPackages(next);
  return {
    ok: true,
    module: "Approval Pipeline v2",
    package: pkg,
    details: publishingPackageDetails(pkg),
    warnings: [
      ...(!imagePrompt ? ["No approved image prompt attached yet. Use /image 1 and /approve_image 1."] : []),
      ...(!schedule ? ["No scheduled slot attached yet. Use /schedule or /schedule week."] : [])
    ],
    safety: {
      publish_allowed: false,
      approval_required: true,
      facebook_publishing: false
    }
  };
}

async function updatePublishingPackageStatus(numberText, status) {
  const allowed = new Set(["review", "approved", "rejected"]);
  if (!allowed.has(status)) return null;
  const pkg = publishingPackageByNumber(numberText);
  if (!pkg) return null;
  const now = new Date().toISOString();
  const updated = readPublishingPackages().map((item) => item.id === pkg.id
    ? {
        ...item,
        status,
        publish_allowed: false,
        approval_required: true,
        approved_at: status === "approved" ? now : item.approved_at || null
      }
    : item);
  await writePublishingPackages(updated);
  return updated.find((item) => item.id === pkg.id);
}

function readyPublishingPackages() {
  return latestPublishingPackages(50).filter((item) => item.status === "approved");
}

function buildAutopilotV1Status() {
  const page = buildAIPageAnalysis();
  const competitor = buildCompetitorAutopilotAnalysis();
  const research = readInternetResearchItems();
  const ideas = readStoryIdeas();
  const imageQueue = readImageQueue();
  const plan = readContentPlan();
  const scheduledPosts = readScheduledPosts();
  const fb = facebookConfigStatus();
  return {
    ok: true,
    module: "AI Autopilot v1",
    generated_at: new Date().toISOString(),
    system: {
      facebook_loading: readFacebookPosts().length > 0 ? "working" : (fb.configured ? "connected_empty" : "not_connected"),
      project_brain: readProjectBrain().updated_at ? "active" : "needs_refresh",
      telegram: telegramConfigStatus().configured ? "connected" : "not_connected",
      autopublishing: "disabled",
      approval_required: true
    },
    modules: {
      ai_page_analyzer: { status: "ready", posts_analyzed: page.posts_analyzed },
      internet_story_researcher: { status: "ready", saved_items: research.length },
      competitor_analyzer: { status: "ready", competitors: competitor.competitors_count },
      story_generator: { status: "ready", ideas: ideas.length },
      image_generator_queue: { status: "ready", queued: imageQueue.length },
      telegram_control: { status: telegramConfigStatus().configured ? "connected" : "needs_env" },
      scheduler: { status: "ready", planned_items: plan.length },
      scheduler_v2: { status: "ready", scheduled_posts: scheduledPosts.length, approved: scheduledPosts.filter((item) => item.status === "approved").length }
    },
    top_signals: {
      themes: page.best_themes.slice(0, 5),
      emotions: page.best_emotions.slice(0, 5),
      hooks: page.best_hooks.slice(0, 5),
      formats: page.best_formats.slice(0, 5)
    },
    safety: {
      no_auto_publishing: true,
      no_competitor_copying: true,
      no_tokens_in_logs: true
    }
  };
}

async function runAutopilotV1Plan() {
  const analysis = buildAIPageAnalysis();
  const research = await runInternetStoryResearch({});
  const ideas = await generateStoryIdeas({ count: 3 });
  const imageQueue = await enqueueImagePromptsForIdeas();
  const plan = await createDailyContentPlan({ days: 1, slots_per_day: 3 });
  const brain = await updateProjectBrain();
  return {
    ok: true,
    module: "AI Autopilot v1 Orchestrator",
    message: "Autopilot v1 prepared analysis, research, story ideas, image prompts and a manual approval content plan. Nothing was published.",
    analysis,
    research: { found_count: research.found_count, saved_new: research.saved_new },
    ideas: { generated_count: ideas.generated_count, total: ideas.ideas.length },
    image_queue: { created_count: imageQueue.created_count, total: imageQueue.queue.length },
    content_plan: { created_count: plan.created_count, total: plan.plan.length },
    project_brain_updated_at: brain.updated_at,
    safety: {
      publish_allowed: false,
      approval_required: true
    }
  };
}

function renderProjectBrainDashboard() {
  const dnaItems = readStoryDna().length ? readStoryDna() : readResearchStories().map(storyDnaFromResearchStory).filter(Boolean);
  const stats = buildStoryDnaStatistics(dnaItems);
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  const autoState = brain.internet_research?.project_brain_v2_auto || {};
  const history = Array.isArray(autoState.history) ? autoState.history : [];
  const recommendations = autoState.recommendations || buildProjectBrainV2Recommendations();
  const rowList = (items = [], empty = "No data yet.") => items.length
    ? `<ol class="insight-list">${items.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${Number(item.count || 0)} signals · avg score ${Number(item.avg_score || 0)}</span></li>`).join("")}</ol>`
    : `<p class="empty-table">${escapeHtml(empty)}</p>`;
  const rhythmList = (items = []) => items.length
    ? `<ol class="insight-list">${items.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${Number(item.count || 0)} patterns</span></li>`).join("")}</ol>`
    : `<p class="empty-table">No rhythm data yet.</p>`;
  const dnaRows = dnaItems.slice(0, 12).map((item) => `<tr>
    <td>${escapeHtml(item.source_type || "")}</td>
    <td>${escapeHtml(item.main_theme || "")}</td>
    <td>${escapeHtml(item.emotion || "")}</td>
    <td>${escapeHtml(item.hook_type || "")}</td>
    <td>${escapeHtml(item.conflict_type || "")}</td>
    <td>${escapeHtml(item.twist_type || "")}</td>
    <td>${Number(item.viral_score || 0)}</td>
  </tr>`).join("") || `<tr><td colspan="7">Run Internet Research to create Story DNA patterns.</td></tr>`;
  const graphRows = (items = [], valueKey, label) => items.length
    ? `<ol class="insight-list">${items.slice(-10).map((item) => `<li><strong>${escapeHtml(new Date(item.at).toLocaleString("ru-RU"))}</strong><span>${escapeHtml(label)}: ${Number(item[valueKey] || 0)} · ${escapeHtml(item.reason || "sync")}</span></li>`).join("")}</ol>`
    : `<p class="empty-table">No ${escapeHtml(label)} history yet.</p>`;
  return layout("Project Brain", `${renderHeader()}
    <main class="insights-page">
      <section class="insights-hero">
        <p class="kicker">Project Brain v2 Core</p>
        <h1>Project Brain</h1>
        <p>Central memory for story patterns. It learns from research summaries and performance signals, stores structures only, and never saves full copyrighted stories.</p>
      </section>

      <section class="insight-card">
        <div class="section-title">
          <div>
            <h2>Brain Status</h2>
            <p class="helper-text">Auto Sync is active. Manual import buttons are no longer required. Analysis only, no publishing.</p>
          </div>
        </div>
        <div class="autopilot-status-grid">
          <article><span>Story DNA count</span><strong>${stats.story_dna_count}</strong><p>Pattern records, not full stories.</p></article>
          <article><span>Brain confidence</span><strong>${stats.brain_confidence_score}%</strong><p>Based on DNA volume and pattern diversity.</p></article>
          <article><span>Auto Sync</span><strong>${autoState.automatic_sync_enabled ? "active" : "ready"}</strong><p>${escapeHtml(autoState.last_learning_time || "Waiting for next data event.")}</p></article>
          <article><span>Safety</span><strong>patterns only</strong><p>No full copyrighted text. No publishing.</p></article>
        </div>
      </section>

      <section class="insight-card">
        <h2>Auto Sync Timeline</h2>
        <div class="autopilot-status-grid">
          <article><span>Last learning time</span><strong>${escapeHtml(autoState.last_learning_time || "not yet")}</strong><p>Updated after every import/sync event.</p></article>
          <article><span>Last Facebook sync</span><strong>${escapeHtml(autoState.last_facebook_sync || "not yet")}</strong><p>Runs after Load Page Posts.</p></article>
          <article><span>Last Research sync</span><strong>${escapeHtml(autoState.last_research_sync || "not yet")}</strong><p>Runs after Internet Research saves summaries.</p></article>
          <article><span>Last Story sync</span><strong>${escapeHtml(autoState.last_story_sync || "not yet")}</strong><p>Runs after Story Generator creates drafts.</p></article>
          <article><span>Last Image sync</span><strong>${escapeHtml(autoState.last_image_sync || "not yet")}</strong><p>Runs after image prompt approval.</p></article>
          <article><span>Last Schedule sync</span><strong>${escapeHtml(autoState.last_schedule_sync || "not yet")}</strong><p>Runs after schedule approval.</p></article>
        </div>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>DNA growth graph</h2>${graphRows(history, "story_dna_count", "DNA")}</article>
        <article class="insight-card"><h2>Confidence history</h2>${graphRows(history, "confidence_score", "confidence")}</article>
      </section>

      <section class="insight-card">
        <h2>Recommendations</h2>
        <div class="autopilot-status-grid">
          <article><span>Next theme</span><strong>${escapeHtml(recommendations.suggested_next_story_type.theme)}</strong><p>${escapeHtml(recommendations.suggested_next_story_type.conflict_type)}</p></article>
          <article><span>Best emotion</span><strong>${escapeHtml(recommendations.suggested_next_story_type.emotion)}</strong><p>Use in the first 1-2 lines.</p></article>
          <article><span>Best hook</span><strong>${escapeHtml(recommendations.suggested_next_story_type.hook_type)}</strong><p>${escapeHtml(recommendations.suggested_next_story_type.format)}</p></article>
          <article><span>Best length</span><strong>${escapeHtml(recommendations.suggested_next_story_type.story_length)}</strong><p>${escapeHtml(recommendations.reason_why)}</p></article>
        </div>
        <h3>Avoid topics</h3>
        ${recommendations.avoid_topics.length ? rowList(recommendations.avoid_topics, "No weak topics yet.") : `<p class="empty-table">No weak topics yet.</p>`}
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Top emotions</h2>${rowList(stats.top_emotions, "No emotions yet.")}</article>
        <article class="insight-card"><h2>Top hooks</h2>${rowList(stats.top_hooks, "No hooks yet.")}</article>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Top endings</h2>${rowList(stats.top_endings, "No endings yet.")}</article>
        <article class="insight-card"><h2>Top conflicts</h2>${rowList(stats.top_conflicts, "No conflicts yet.")}</article>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Trending topics</h2>${rowList(stats.trending_topics, "No topics yet.")}</article>
        <article class="insight-card"><h2>Story rhythm analysis</h2>${rhythmList(stats.story_rhythm_analysis)}</article>
      </section>

      <section class="insight-card">
        <h2>Most successful structures</h2>
        ${rowList(stats.most_successful_structures, "No structure data yet.")}
      </section>

      <section class="insight-grid">
        <article class="insight-card">
          <h2>Brain Memory: what worked</h2>
          <ol class="insight-list">${(autoState.permanent_memory?.what_works || stats.brain_memory.worked).length ? (autoState.permanent_memory?.what_works || stats.brain_memory.worked).slice(0, 6).map((item) => `<li><strong>${escapeHtml(item.pattern || item)}</strong><span>${item.avg_score ? `score ${item.avg_score}` : ""}</span></li>`).join("") : "<li><strong>Not enough data yet</strong></li>"}</ol>
        </article>
        <article class="insight-card">
          <h2>What to avoid</h2>
          <ol class="insight-list">${(autoState.permanent_memory?.avoid || stats.brain_memory.avoid).map((item) => `<li><strong>${escapeHtml(item)}</strong></li>`).join("")}</ol>
        </article>
      </section>

      <section class="insight-grid">
        <article class="insight-card">
          <h2>Emerging trends</h2>
          <ol class="insight-list">${(autoState.permanent_memory?.emerging_trends || []).length ? autoState.permanent_memory.emerging_trends.map((item) => `<li><strong>${escapeHtml(item)}</strong></li>`).join("") : "<li><strong>Not enough trend history yet</strong></li>"}</ol>
        </article>
        <article class="insight-card">
          <h2>Seasonal themes</h2>
          <ol class="insight-list">${(autoState.permanent_memory?.seasonal_themes || []).length ? autoState.permanent_memory.seasonal_themes.map((item) => `<li><strong>${escapeHtml(item)}</strong></li>`).join("") : "<li><strong>Seasonal memory will appear after sync.</strong></li>"}</ol>
        </article>
      </section>

      <section class="insight-grid">
        <article class="insight-card">
          <h2>Approved image prompt memory</h2>
          <ol class="insight-list">${(autoState.visual_memory?.top_compositions || []).length ? autoState.visual_memory.top_compositions.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.count} approved prompts</span></li>`).join("") : "<li><strong>No approved image prompts yet</strong></li>"}</ol>
        </article>
        <article class="insight-card">
          <h2>Approved schedule memory</h2>
          <ol class="insight-list">${(autoState.schedule_memory?.best_publish_hours || []).length ? autoState.schedule_memory.best_publish_hours.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.count} approved slots</span></li>`).join("") : "<li><strong>No approved schedule slots yet</strong></li>"}</ol>
        </article>
      </section>

      <section class="insight-card">
        <h2>Latest Story DNA records</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Source</th><th>Theme</th><th>Emotion</th><th>Hook</th><th>Conflict</th><th>Twist</th><th>Viral</th></tr></thead>
            <tbody>${dnaRows}</tbody>
          </table>
        </div>
      </section>
    </main>`);
}

function renderStyleBrainDashboard() {
  const profiles = readStyleBrainProfiles();
  const recommendations = buildStyleBrainRecommendations(profiles);
  const stats = recommendations.statistics;
  const list = (items = [], empty = "No data yet.") => items.length
    ? `<ol class="insight-list">${items.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.name || item)}</strong><span>${item.count ? `${item.count} signals` : ""}</span></li>`).join("")}</ol>`
    : `<p class="empty-table">${escapeHtml(empty)}</p>`;
  const tips = (items = []) => `<ol class="insight-list">${items.map((item) => `<li><strong>${escapeHtml(item)}</strong></li>`).join("")}</ol>`;
  const profileRows = profiles.slice(0, 20).map((item) => `<tr>
    <td>${escapeHtml(item.source_type || "")}</td>
    <td>${Number(item.hook_strength || 0)}</td>
    <td>${Number(item.emotional_intensity || 0)}</td>
    <td>${Number(item.dialogue_density || 0)}</td>
    <td>${Number(item.boring_risk || 0)}</td>
    <td>${Number(item.human_realism_score || 0)}</td>
    <td>${escapeHtml(item.opening_style || "")}</td>
  </tr>`).join("") || `<tr><td colspan="7">Run Style Brain refresh after loading Facebook posts, research, or drafts.</td></tr>`;
  return layout("Style Brain", `${renderHeader()}
    <main class="insights-page">
      <section class="insights-hero">
        <p class="kicker">Style Brain v1</p>
        <h1>Style Brain</h1>
        <p>Analyzes narrative style, emotional rhythm, hook strength and human realism. It guides Story Generator and never publishes anything.</p>
      </section>

      <section class="insight-card">
        <div class="section-title">
          <div>
            <h2>Style Status</h2>
            <p class="helper-text">Stores structure and style signals only. No full copyrighted stories are stored.</p>
          </div>
          <div class="button-row">
            <button class="primary-btn" id="styleBrainRefreshBtn" type="button">Refresh Style Brain</button>
          </div>
        </div>
        <div class="autopilot-status-grid">
          <article><span>Profiles</span><strong>${stats.profiles_count}</strong><p>Facebook, generated, research summaries, approved packages.</p></article>
          <article><span>Hook strength</span><strong>${stats.hook_strength}%</strong><p>Average first-line pulling power.</p></article>
          <article><span>Emotion intensity</span><strong>${stats.emotional_intensity}%</strong><p>Conflict and feeling signal.</p></article>
          <article><span>Dialogue density</span><strong>${stats.dialogue_density}%</strong><p>Natural speech signal.</p></article>
          <article><span>Boring risk</span><strong>${stats.boring_risk}%</strong><p>Lower is better.</p></article>
          <article><span>Human realism</span><strong>${stats.human_realism_score}%</strong><p>Everyday details and believable texture.</p></article>
        </div>
        <p id="styleBrainMessage" class="helper-text">Ready.</p>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Current Recommendations</h2>
          <p><strong>Opening:</strong> ${escapeHtml(recommendations.ideal_opening_style)}</p>
          <p><strong>Hook:</strong> ${escapeHtml(recommendations.ideal_hook_type)}</p>
          <p><strong>Dialogue:</strong> ${escapeHtml(recommendations.ideal_dialogue_density)}</p>
          <p><strong>Paragraph rhythm:</strong> ${escapeHtml(recommendations.paragraph_rhythm)}</p>
        </article>
        <article class="insight-card"><h2>Top Opening Styles</h2>${list(stats.top_opening_styles)}</article>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>What Makes Drafts Boring</h2>${tips(recommendations.what_makes_current_drafts_boring)}</article>
        <article class="insight-card"><h2>Make Stories More Human</h2>${tips(recommendations.how_to_make_stories_more_human)}</article>
      </section>

      <section class="insight-grid">
        <article class="insight-card"><h2>Words / Structures To Avoid</h2>${tips(recommendations.words_structures_to_avoid)}</article>
        <article class="insight-card"><h2>Rhythm Signals</h2>
          <h3>Sentence rhythm</h3>${list(stats.top_sentence_rhythms)}
          <h3>Paragraph rhythm</h3>${list(stats.top_paragraph_rhythms)}
        </article>
      </section>

      <section class="insight-card">
        <h2>Latest Style Profiles</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Source</th><th>Hook</th><th>Emotion</th><th>Dialogue</th><th>Boring</th><th>Realism</th><th>Opening</th></tr></thead>
            <tbody>${profileRows}</tbody>
          </table>
        </div>
      </section>
    </main>
    <script>
      const styleMessage = document.getElementById("styleBrainMessage");
      document.getElementById("styleBrainRefreshBtn").addEventListener("click", async () => {
        styleMessage.textContent = "Refreshing...";
        try {
          const response = await fetch("/api/style-brain-v1/refresh", { method: "POST" });
          const result = await response.json();
          styleMessage.textContent = result.ok ? "Style Brain refreshed. Reloading..." : (result.message || "Refresh failed.");
          if (result.ok) window.location.reload();
        } catch (error) {
          styleMessage.textContent = error.message;
        }
      });
    </script>`);
}

function renderAutopilotV1Dashboard() {
  const status = buildAutopilotV1Status();
  const ideas = readStoryIdeas().slice(0, 6);
  const generatedStories = readGeneratedStories().slice(0, 6);
  const queue = readImageQueue().slice(0, 6);
  const scheduledPosts = scheduledQueueItems(20);
  const tomorrowSchedule = scheduleItemsForTomorrow();
  const approvedSchedule = scheduledPosts.filter((item) => item.status === "approved").slice(0, 6);
  const pendingSchedule = scheduledPosts.filter((item) => item.status === "draft").slice(0, 6);
  const packages = latestPublishingPackages(12);
  const readyPackages = packages.filter((item) => item.status === "approved");
  const rejectedPackages = packages.filter((item) => item.status === "rejected");
  const reviewPackages = packages.filter((item) => item.status === "review");
  const plan = readContentPlan().slice(0, 8);
  const research = readInternetResearchItems().slice(0, 6);
  const researchStories = readResearchStories();
  const trendingStories = researchStories.slice(0, 8);
  const viralCandidates = [...researchStories].sort((a, b) => Number(b.viral_score || 0) - Number(a.viral_score || 0)).slice(0, 8);
  const similarStories = [...researchStories].sort((a, b) => Number(b.similarity_score || 0) - Number(a.similarity_score || 0)).slice(0, 8);
  const storyEmotions = countBy(researchStories, (item) => item.emotion || "unknown").slice(0, 8);
  const storySources = countBy(researchStories, (item) => item.source || "unknown").slice(0, 8);
  const latestResearchRun = autopilotV1BrainState().latest_run || {};
  const card = (title, value, detail) => `<article><span>${escapeHtml(title)}</span><strong>${escapeHtml(String(value))}</strong><p>${escapeHtml(detail)}</p></article>`;
  const rows = (items, empty, mapper) => items.length
    ? items.map(mapper).join("")
    : `<tr><td colspan="4">${escapeHtml(empty)}</td></tr>`;
  return layout("AI Autopilot v1", `${renderHeader()}
    <main class="insights-page">
      <section class="insights-hero">
        <p class="kicker">AI Autopilot v1</p>
        <h1>Editorial autopilot, approval first</h1>
        <p>Central control layer for Page analysis, internet research, competitor signals, original story ideas, image prompts, Telegram commands and a daily content plan. Publishing stays disabled until you approve manually.</p>
      </section>

      <section class="insight-card">
        <div class="section-title">
          <div>
            <h2>System State</h2>
            <p class="helper-text">No tokens are printed. No Facebook publishing exists in this flow.</p>
          </div>
          <button class="primary-btn" data-autopilot-action="/api/autopilot/v1/run" type="button">Run Full v1 Plan</button>
        </div>
        <div class="autopilot-status-grid">
          ${card("Facebook Loading", status.system.facebook_loading, `${readFacebookPosts().length} stored posts`)}
          ${card("Project Brain", status.system.project_brain, readProjectBrain().updated_at || "Needs refresh")}
          ${card("Telegram", status.system.telegram, "Commands: /status /load_posts /analyze /research /ideas /plan /schedule /help")}
          ${card("Publishing", status.system.autopublishing, "Approval is required before any publishing step.")}
        </div>
      </section>

      <section class="insight-card">
        <h2>Modules</h2>
        <div class="button-row">
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/analyze" type="button">AI Page Analyzer</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/research" type="button">Internet Research</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/competitors" type="button">Competitor Analyzer</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/generate-story" type="button">Generate Story v2</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/ideas" type="button">Generate Ideas</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/image-prompts" type="button">Image Prompts v2</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/image-queue" type="button">Image Queue</button>
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/plan" type="button">Daily Plan</button>
        </div>
        <p id="autopilotV1Message" class="helper-text">Ready.</p>
        <pre id="autopilotV1Output" class="debug-box"></pre>
      </section>

      <section class="insight-grid">
        <article class="insight-card">
          <h2>Top Themes</h2>
          <ol class="insight-list">${status.top_signals.themes.length ? status.top_signals.themes.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>score ${item.avg_score}, posts ${item.posts_count}</span></li>`).join("") : "<li><strong>No loaded post data yet</strong></li>"}</ol>
        </article>
        <article class="insight-card">
          <h2>Top Hooks</h2>
          <ol class="insight-list">${status.top_signals.hooks.length ? status.top_signals.hooks.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(shortText(item.sample_hook || "", 120))}</span></li>`).join("") : "<li><strong>No hooks yet</strong></li>"}</ol>
        </article>
      </section>

      <section class="insight-card">
        <h2>Generated Stories v2</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Title</th><th>Category</th><th>Emotion</th><th>Score</th></tr></thead>
            <tbody>${rows(generatedStories, "No generated stories yet. Click Generate Story v2.", (item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.emotion)}</td><td>${Number(item.viral_prediction_score || 0)} / ${escapeHtml(item.status || "needs_approval")}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Story Ideas</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Title</th><th>Topic</th><th>Emotion</th><th>Status</th></tr></thead>
            <tbody>${rows(ideas, "No ideas yet. Click Generate Ideas.", (item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.topic)}</td><td>${escapeHtml(item.emotion)}</td><td>${escapeHtml(item.status)}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Image Generator Queue</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Draft</th><th>Style</th><th>Status</th><th>Prompt</th></tr></thead>
            <tbody>${rows(queue, "No queued image prompts yet.", (item) => `<tr><td>${escapeHtml(item.story_title)}</td><td>${escapeHtml(item.style || "story_idea_prompt")}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(shortText(item.prompt, 220))}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Scheduler v2</h2>
        <div class="button-row">
          <button class="secondary-btn" data-autopilot-action="/api/autopilot/v1/scheduler-v2" type="button">Build Tomorrow Plan</button>
        </div>
        <div class="autopilot-status-grid">
          ${card("Tomorrow Plan", tomorrowSchedule.length, "Logical chain for the next day")}
          ${card("Approved Schedule", approvedSchedule.length, "Approved does not publish automatically")}
          ${card("Pending Schedule", pendingSchedule.length, "Waiting for review")}
        </div>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Time</th><th>Draft</th><th>Theme</th><th>Status</th></tr></thead>
            <tbody>${rows(scheduledPosts.slice(0, 8), "No scheduled drafts yet.", (item) => `<tr><td>${escapeHtml(new Date(item.scheduled_time).toLocaleString("ru-RU"))}</td><td>${escapeHtml(item.title || item.draft_id)}</td><td>${escapeHtml(item.rhythm_step || item.theme || "")}</td><td>${escapeHtml(item.status || "draft")}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Approval Pipeline v2</h2>
        <div class="autopilot-status-grid">
          ${card("Latest Packages", packages.length, "Story + image prompt + schedule")}
          ${card("Ready To Publish", readyPackages.length, "Approved, but publishing is still manual")}
          ${card("In Review", reviewPackages.length, "Waiting for approval")}
          ${card("Rejected", rejectedPackages.length, "Rejected packages")}
        </div>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Status</th><th>Draft</th><th>Image</th><th>Schedule</th></tr></thead>
            <tbody>${rows(packages.slice(0, 8), "No publishing packages yet.", (item) => {
              const detail = publishingPackageDetails(item);
              return `<tr><td>${escapeHtml(item.status || "review")}</td><td>${escapeHtml(detail?.draft?.title || item.draft_id)}</td><td>${item.image_prompt_id ? "attached" : "missing"}</td><td>${detail?.schedule?.scheduled_time ? escapeHtml(new Date(detail.schedule.scheduled_time).toLocaleString("ru-RU")) : "missing"}</td></tr>`;
            })}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Daily Content Plan</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Time</th><th>Title</th><th>Status</th><th>Publishing</th></tr></thead>
            <tbody>${rows(plan, "No plan yet. Click Daily Plan.", (item) => `<tr><td>${escapeHtml(item.local_time_hint || item.scheduled_for)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.status)}</td><td>${item.publish_allowed ? "allowed" : "blocked until approval"}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-card">
        <h2>Internet Research AI</h2>
        <div class="autopilot-status-grid">
          ${card("Research Stories", researchStories.length, "Saved summaries with source links only")}
          ${card("Search Mode", latestResearchRun.source_status || "not run", "live_search only when a search API key is configured")}
          ${card("Provider", latestResearchRun.provider_used || "none", (latestResearchRun.configured_providers || []).length ? `Configured: ${(latestResearchRun.configured_providers || []).join(", ")}` : "Add Tavily, Brave, SerpAPI or Bing key")}
          ${card("Last Results", latestResearchRun.results_count || 0, `Saved new ${latestResearchRun.saved_new || 0}, skipped duplicates ${latestResearchRun.skipped_duplicates || 0}`)}
          ${card("Top Emotion", storyEmotions[0]?.name || "not enough data", `${storyEmotions[0]?.count || 0} stories`)}
          ${card("Top Source", storySources[0]?.name || "not enough data", `${storySources[0]?.count || 0} stories`)}
        </div>
      </section>

      <section class="insight-card">
        <h2>Trending Stories</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Title</th><th>Source</th><th>Emotion</th><th>Scores</th></tr></thead>
            <tbody>${rows(trendingStories, "Run Internet Research first.", (item) => `<tr><td><a href="${escapeHtml(item.url || item.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></td><td>${escapeHtml(item.source)}</td><td>${escapeHtml(item.emotion)}</td><td>viral ${Number(item.viral_score || 0)} / similar ${Number(item.similarity_score || 0)} / ${escapeHtml(item.source_status || "unknown")}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>

      <section class="insight-grid">
        <article class="insight-card">
          <h2>Viral Candidates</h2>
          <ol class="insight-list">${viralCandidates.length ? viralCandidates.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.source)} · viral ${Number(item.viral_score || 0)} · ${escapeHtml(item.emotion || "")}</span></li>`).join("") : "<li><strong>No research yet</strong></li>"}</ol>
        </article>
        <article class="insight-card">
          <h2>Similar To Our Audience</h2>
          <ol class="insight-list">${similarStories.length ? similarStories.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.source)} · similarity ${Number(item.similarity_score || 0)} · ${escapeHtml(item.story_structure || "")}</span></li>`).join("") : "<li><strong>No research yet</strong></li>"}</ol>
        </article>
      </section>

      <section class="insight-grid">
        <article class="insight-card">
          <h2>Story Emotions</h2>
          <ol class="insight-list">${storyEmotions.length ? storyEmotions.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.count} stories</span></li>`).join("") : "<li><strong>No emotions yet</strong></li>"}</ol>
        </article>
        <article class="insight-card">
          <h2>Sources</h2>
          <ol class="insight-list">${storySources.length ? storySources.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.count} stories</span></li>`).join("") : "<li><strong>No sources yet</strong></li>"}</ol>
        </article>
      </section>

      <section class="insight-card">
        <h2>Research Sources</h2>
        <div class="facebook-table-wrap">
          <table class="facebook-table">
            <thead><tr><th>Source</th><th>Title</th><th>Angle</th><th>Status</th></tr></thead>
            <tbody>${rows(research, "No research saved yet.", (item) => `<tr><td>${escapeHtml(item.source)}</td><td><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></td><td>${escapeHtml(item.emotional_angle)}</td><td>${escapeHtml(item.status)}</td></tr>`)}</tbody>
          </table>
        </div>
      </section>
    </main>
    <script>
      const message = document.getElementById("autopilotV1Message");
      const output = document.getElementById("autopilotV1Output");
      document.querySelectorAll("[data-autopilot-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          message.textContent = "Working...";
          output.textContent = "";
          try {
            const response = await fetch(button.dataset.autopilotAction, { method: "POST" });
            const result = await response.json();
            message.textContent = result.message || result.module || "Done.";
            output.textContent = JSON.stringify(result, null, 2);
          } catch (error) {
            message.textContent = error.message;
          } finally {
            button.disabled = false;
          }
        });
      });
    </script>`);
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
  const configured = Boolean(process.env.BOT_TOKEN && process.env.CHAT_ID);
  return {
    ok: configured,
    configured,
    has_bot_token: Boolean(process.env.BOT_TOKEN),
    has_chat_id: Boolean(process.env.CHAT_ID),
    webhook_url: TELEGRAM_WEBHOOK_URL
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

function safeTelegramApiResult(result) {
  if (!result) return { ok: false, error_code: "bot_token_missing", description: "BOT_TOKEN is missing." };
  return {
    ok: Boolean(result.ok),
    error_code: result.error_code || null,
    description: result.description || "",
    result: result.result || null
  };
}

async function telegramBotInfo() {
  const result = safeTelegramApiResult(await telegramApi("getMe"));
  return {
    ok: result.ok,
    username: result.result?.username || "",
    first_name: result.result?.first_name || "",
    id_present: Boolean(result.result?.id),
    error_code: result.error_code,
    description: result.description
  };
}

async function telegramWebhookInfo() {
  const config = telegramConfigStatus();
  const bot = await telegramBotInfo();
  const info = safeTelegramApiResult(await telegramApi("getWebhookInfo"));
  return {
    ok: config.configured && bot.ok && info.ok,
    configured: config.configured,
    has_bot_token: config.has_bot_token,
    has_chat_id: config.has_chat_id,
    target_webhook_url: TELEGRAM_WEBHOOK_URL,
    bot_username: bot.username,
    bot: {
      ok: bot.ok,
      username: bot.username,
      first_name: bot.first_name,
      id_present: bot.id_present,
      error_code: bot.error_code,
      description: bot.description
    },
    webhook: {
      ok: info.ok,
      url: info.result?.url || "",
      pending_update_count: Number(info.result?.pending_update_count || 0),
      last_error_message: info.result?.last_error_message || "",
      last_error_date: info.result?.last_error_date || null,
      max_connections: info.result?.max_connections || null,
      allowed_updates: info.result?.allowed_updates || []
    },
    error_code: info.error_code,
    description: info.description
  };
}

async function setTelegramWebhook() {
  if (!telegramConfigStatus().configured) {
    return {
      ok: false,
      configured: false,
      code: "telegram_env_missing",
      message: "BOT_TOKEN or CHAT_ID is missing in environment variables.",
      webhook_url: TELEGRAM_WEBHOOK_URL
    };
  }
  const commands = await registerTelegramCommands();
  const result = safeTelegramApiResult(await telegramApi("setWebhook", {
    url: TELEGRAM_WEBHOOK_URL,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false
  }));
  const info = await telegramWebhookInfo();
  return {
    ok: result.ok,
    configured: true,
    webhook_url: TELEGRAM_WEBHOOK_URL,
    message: result.description || (result.ok ? "Telegram webhook set." : "Telegram webhook was not set."),
    set_webhook: {
      ok: result.ok,
      error_code: result.error_code,
      description: result.description
    },
    set_commands: safeTelegramApiResult(commands),
    webhook_info: info
  };
}

function mainTelegramKeyboard() {
  return {
    keyboard: [
      [{ text: "🧠 Статус" }, { text: "🔍 Поиск идей" }],
      [{ text: "✍️ Создать истории" }, { text: "📚 Черновики" }],
      [{ text: "🎨 Картинки" }, { text: "📅 План" }],
      [{ text: "📦 Пакеты" }, { text: "✅ Готово к публикации" }],
      [{ text: "❓ Помощь" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function telegramSafetyFooter() {
  return "Безопасность: автопубликация отключена, publish_allowed=false, approval_required=true.";
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

async function sendTelegramLongMessage(chatId, text, replyMarkup, limit = 3400) {
  const source = String(text || "");
  if (source.length <= limit) return sendTelegramMessage(chatId, source, replyMarkup);
  const chunks = [];
  let current = "";
  for (const part of source.split(/\n\n/)) {
    const next = current ? `${current}\n\n${part}` : part;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (part.length <= limit) {
      current = part;
      continue;
    }
    for (let index = 0; index < part.length; index += limit) {
      chunks.push(part.slice(index, index + limit));
    }
    current = "";
  }
  if (current) chunks.push(current);
  for (let index = 0; index < chunks.length; index += 1) {
    await sendTelegramMessage(chatId, chunks[index], index === chunks.length - 1 ? replyMarkup : undefined);
  }
  return { ok: true, chunks: chunks.length };
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
  return sendTelegramMessage(chatId, [
    "🤖 <b>AI Story Traffic Platform</b>",
    "",
    "Личный центр управления историями, идеями, картинками, планом и пакетами публикаций.",
    "",
    "Выберите кнопку ниже или напишите команду:",
    "• /поиск измена — найти идеи",
    "• /создать измена 3 — создать 3 черновика",
    "• /пакеты — посмотреть пакеты на проверку",
    "",
    telegramSafetyFooter()
  ].join("\n"), mainTelegramKeyboard());
}

async function telegramButtonGuide(chatId, text = "") {
  const button = String(text || "").trim();
  const guides = {
    "🔍 Поиск идей": [
      "🔍 <b>Поиск идей</b>",
      "",
      "Я найду похожие эмоциональные темы и сохраню только краткие выводы и ссылки на источники.",
      "",
      "Попробуйте:",
      "/поиск измена",
      "/поиск любовь",
      "/поиск наследство",
      "",
      "Английский вариант тоже работает: /research betrayal",
      telegramSafetyFooter()
    ],
    "✍️ Создать истории": [
      "✍️ <b>Создать истории</b>",
      "",
      "Я создам оригинальные черновики на основе Project Brain, Facebook-аналитики и research signals.",
      "",
      "Попробуйте:",
      "/создать измена 3",
      "/создать любовь 5",
      "/создать наследство 3",
      "",
      "После генерации:",
      "/черновики",
      "/черновик 1",
      "/одобрить 1",
      "",
      telegramSafetyFooter()
    ],
    "🎨 Картинки": [
      "🎨 <b>Картинки</b>",
      "",
      "Сейчас система создаёт промпты, а не сами изображения.",
      "",
      "Попробуйте:",
      "/картинка 1 — создать 3 промпта для черновика #1",
      "/картинки — очередь промптов",
      "/image_prompt 1 — полный промпт",
      "/одобрить_картинку 1 — одобрить промпт",
      "",
      telegramSafetyFooter()
    ],
    "📅 План": [
      "📅 <b>План публикаций</b>",
      "",
      "Планировщик собирает черновик, одобренный промпт картинки и время публикации.",
      "",
      "Попробуйте:",
      "/план — план на завтра",
      "/план неделя — план на 7 дней",
      "/очередь — запланированные черновики",
      "/approve_schedule — одобрить расписание без публикации",
      "",
      telegramSafetyFooter()
    ],
    "📦 Пакеты": [
      "📦 <b>Пакеты публикаций</b>",
      "",
      "Пакет объединяет историю, одобренный промпт картинки и слот расписания.",
      "",
      "Попробуйте:",
      "/создать_пакет 1",
      "/пакеты",
      "/пакет 1",
      "/одобрить_пакет 1",
      "/отклонить_пакет 1",
      "",
      telegramSafetyFooter()
    ]
  };
  const guide = guides[button];
  if (!guide) return null;
  return sendTelegramMessage(chatId, guide.join("\n"), mainTelegramKeyboard());
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

async function telegramImageQueueV2(chatId) {
  const items = latestImageQueueItems(10);
  if (!items.length) return sendTelegramMessage(chatId, "Промптов для картинок пока нет. Сначала создайте черновики: /создать измена 3, потом /картинка 1.", mainTelegramKeyboard());
  const text = items.map((item, index) => [
    `${index + 1}. <b>${escapeHtml(shortText(item.story_title || "Untitled draft", 90))}</b>`,
    `стиль: ${escapeHtml(item.style || "story_idea_prompt")}`,
    `статус: ${escapeHtml(item.status || "needs_approval")}`,
    `черновик: ${escapeHtml(shortText(item.draft_id || item.story_idea_id || "", 32))}`
  ].join("\n")).join("\n\n");
  return sendTelegramMessage(chatId, `<b>Очередь промптов для картинок</b>\n\n${text}\n\n/image_prompt 1 — полный промпт\n/одобрить_картинку 1 — одобрить\n/reject_image 1 — отклонить\n\nКартинки автоматически не генерируются.`, mainTelegramKeyboard());
}

async function telegramImagePromptDetailsV2(chatId, numberText = "1") {
  const item = imageQueueItemByNumber(numberText);
  if (!item) return sendTelegramMessage(chatId, "Промпт не найден. Используйте /картинки, чтобы увидеть номера 1-10.", mainTelegramKeyboard());
  const visual = item.visual_analysis || {};
  const text = [
    `<b>Промпт картинки ${escapeHtml(numberText)}</b>`,
    "",
    `<b>${escapeHtml(item.story_title || "Untitled draft")}</b>`,
    `стиль: ${escapeHtml(item.style || "story_idea_prompt")}`,
    `статус: ${escapeHtml(item.status || "needs_approval")}`,
    "",
    `<b>Визуальный анализ</b>`,
    `сцена: ${escapeHtml(visual.main_scene || "")}`,
    `персонажи: ${escapeHtml(visual.characters || "")}`,
    `эмоция: ${escapeHtml(visual.emotion || "")}`,
    `место: ${escapeHtml(visual.setting || "")}`,
    `время: ${escapeHtml(visual.time_of_day || "")}`,
    `конфликт: ${escapeHtml(visual.visual_conflict || "")}`,
    "",
    `<b>Prompt</b>`,
    escapeHtml(item.prompt || ""),
    "",
    "Это только промпт. Изображение не создаётся автоматически. Публикации нет."
  ].join("\n");
  return sendTelegramLongMessage(chatId, text, mainTelegramKeyboard());
}

async function telegramCreateImagePrompts(chatId, draftNumber = "1") {
  const result = await createImagePromptsForGeneratedDraft(draftNumber || "1");
  if (!result.ok) return sendTelegramMessage(chatId, escapeHtml(result.message || "Черновик не найден. Используйте /черновики."), mainTelegramKeyboard());
  const text = result.prompts.map((item, index) => [
    `${index + 1}. ${item.style}`,
    `статус: ${item.status}`,
    `промпт: ${shortText(item.prompt, 420)}`
  ].join("\n")).join("\n\n");
  return sendTelegramLongMessage(chatId, `<b>Image Generator v2</b>\n\nЧерновик: ${escapeHtml(result.draft_title)}\nСоздано промптов: ${result.created_count}\n\n${escapeHtml(text)}\n\n/картинки — очередь\n/image_prompt 1 — полный промпт\n/одобрить_картинку 1 — одобрить промпт\n\nИзображения автоматически не создаются.`, mainTelegramKeyboard());
}

async function telegramApproveImageCommand(chatId, numberText = "1") {
  const item = await updateImageQueueStatusByNumber(numberText, "approved");
  return sendTelegramMessage(chatId, item ? `Промпт картинки ${numberText} одобрен.\nСтиль: ${escapeHtml(item.style || "")}\nСтатус: ${escapeHtml(item.status)}\n\nИзображение не создано и ничего не опубликовано.` : "Промпт не найден. Используйте /картинки.", mainTelegramKeyboard());
}

async function telegramRejectImageCommand(chatId, numberText = "1") {
  const item = await updateImageQueueStatusByNumber(numberText, "rejected");
  return sendTelegramMessage(chatId, item ? `Промпт картинки ${numberText} отклонён.\nСтиль: ${escapeHtml(item.style || "")}\nСтатус: ${escapeHtml(item.status)}\n\nНичего не создано и не опубликовано.` : "Промпт не найден. Используйте /картинки.", mainTelegramKeyboard());
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
  return sendTelegramMessage(chatId, `🧠 <b>Статус системы</b>\n\nTelegram: ${tg.configured ? "подключён" : "не подключён"}\nFacebook: ${fb.configured ? "подключён" : "не подключён"}\nБаза данных: ${pgPool ? "PostgreSQL" : "JSON backup mode"}\nProject Brain: ${brain.updated_at ? "активен" : "нужно обновить"}\n\n${escapeHtml(realData.notice)}\n\nСледующие действия:\n/поиск измена — найти идеи\n/создать измена 3 — создать черновики\n/пакеты — проверить пакеты\n\n${telegramSafetyFooter()}`, mainTelegramKeyboard());
}

async function telegramStats(chatId) {
  const stories = readStories();
  const posts = readFacebookPosts();
  const brain = readProjectBrain().updated_at ? readProjectBrain() : rebuildProjectBrain();
  const stats = brain.publication_statistics || {};
  return sendTelegramMessage(chatId, `📊 <b>Stats</b>\n\nStories: ${stories.length}\nDrafts: ${stats.draft || 0}\nReview: ${stats.review || 0}\nApproved: ${stats.approved || 0}\nScheduled: ${stats.scheduled || 0}\nPublished: ${stats.published || 0}\nRejected: ${stats.rejected || 0}\n\nFacebook posts loaded: ${posts.length}\nViews: ${stats.total_views || 0}\nClicks: ${stats.total_clicks || 0}`, mainTelegramKeyboard());
}

async function telegramLoadPosts(chatId) {
  const result = await loadFacebookPosts();
  const summary = result.summary || {};
  return sendTelegramMessage(chatId, `<b>Load Page Posts</b>\n\n${escapeHtml(result.message || "Done.")}\n\nLoaded: ${summary.loaded_posts || summary.loaded || 0}\nSaved new: ${summary.saved_new_posts || 0}\nSkipped duplicates: ${summary.skipped_duplicates || 0}\nStored total: ${readFacebookPosts().length}\n\nNothing was published.`, mainTelegramKeyboard());
}

async function telegramAnalyze(chatId) {
  const analysis = buildAIPageAnalysis();
  await updateProjectBrain();
  const themes = analysis.best_themes.slice(0, 3).map((item, index) => `${index + 1}. ${item.name} (${item.avg_score})`).join("\n") || "No data yet";
  const hooks = analysis.best_hooks.slice(0, 3).map((item) => `- ${item.name}`).join("\n") || "No data yet";
  return sendTelegramMessage(chatId, `<b>AI Page Analyzer</b>\n\nPosts analyzed: ${analysis.posts_analyzed}\n\nBest themes:\n${escapeHtml(themes)}\n\nBest hooks:\n${escapeHtml(hooks)}\n\nProject Brain updated.`, mainTelegramKeyboard());
}

async function telegramResearch(chatId, category = "") {
  const result = await runInternetStoryResearch({ category, limit: 20 });
  const emotions = countBy(result.stories || [], (item) => item.emotion || "unknown")
    .slice(0, 5)
    .map((item) => `- ${item.name}: ${item.count}`)
    .join("\n") || "Эмоций пока нет";
  const topStories = (result.stories || [])
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\nИсточник: ${item.source}\nviral_score: ${item.viral_score}\nsimilarity_score: ${item.similarity_score}`)
    .join("\n\n") || "Историй для анализа пока нет";
  return sendTelegramMessage(chatId, `<b>Internet Research AI v2</b>\n\nКатегория: ${escapeHtml(result.category)}\nПровайдер: ${escapeHtml(result.provider_used)}\nРежим: ${escapeHtml(result.source_status)}\nНайдено: ${result.results_count}\nСохранено новых: ${result.saved_new}\nДубликатов пропущено: ${result.skipped_duplicates}\n\nЛучшие эмоции:\n${escapeHtml(emotions)}\n\nТоп-5 идей:\n${escapeHtml(topStories)}\n\nСохраняются только краткие summaries и ссылки. Тексты не копируются.`, mainTelegramKeyboard());
}

async function telegramIdeas(chatId) {
  const result = await generateStoryIdeas({ count: 3 });
  const ideas = result.new_ideas.map((idea, index) => `${index + 1}. ${idea.title}\nEmotion: ${idea.emotion}`).join("\n\n");
  return sendTelegramMessage(chatId, `<b>Story Generator</b>\n\nGenerated: ${result.generated_count}\n\n${escapeHtml(ideas)}\n\nStatus: needs approval. Nothing was published.`, mainTelegramKeyboard());
}

function parseTelegramCategoryAndCount(args = [], defaultCategory = "betrayal", defaultCount = 3) {
  const parts = Array.isArray(args) ? args : String(args || "").split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  const count = /^\d+$/.test(last || "") ? Math.max(1, Math.min(Number(last), 8)) : defaultCount;
  const categoryParts = /^\d+$/.test(last || "") ? parts.slice(0, -1) : parts;
  return {
    category: categoryParts.join(" ").trim() || defaultCategory,
    count
  };
}

function latestGeneratedDrafts(limit = 10) {
  return [...readGeneratedStories()]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

function generatedDraftByNumber(numberText) {
  const index = Number(numberText);
  if (!Number.isInteger(index) || index < 1) return null;
  return latestGeneratedDrafts(10)[index - 1] || null;
}

async function updateGeneratedDraftStatusByNumber(numberText, status) {
  const draft = generatedDraftByNumber(numberText);
  if (!draft) return null;
  const generated = readGeneratedStories();
  const updated = generated.map((item) => item.id === draft.id
    ? {
        ...item,
        status,
        approval_required: true,
        publish_allowed: false,
        updated_at: new Date().toISOString()
      }
    : item);
  await writeGeneratedStories(updated);
  return updated.find((item) => item.id === draft.id);
}

async function telegramGenerateStory(chatId, args = []) {
  const { category, count } = parseTelegramCategoryAndCount(args, "betrayal", 3);
  const result = await generateOriginalStoriesV2({ category, length: "medium", count });
  const previews = result.stories.map((story, index) => [
    `${index + 1}. ${story.title}`,
    `эмоция: ${story.emotion}`,
    `viral_prediction_score: ${story.viral_prediction_score}/100`,
    `крючок: ${story.hook}`
  ].join("\n")).join("\n\n");
  const text = [
    "<b>Story Generator v2</b>",
    "",
    `Создано черновиков: ${result.count}`,
    `Категория: ${escapeHtml(normalizeResearchCategory(category))}`,
    "Статус: needs_approval",
    "",
    escapeHtml(previews),
    "",
    "/черновики — очередь черновиков",
    "/черновик 1 — прочитать полностью",
    "/approve 1 или /reject 1 — проверить черновик",
    "",
    "Ничего не опубликовано."
  ].join("\n");
  return sendTelegramLongMessage(chatId, text, mainTelegramKeyboard());
}

async function telegramPlan(chatId) {
  if (!readStoryIdeas().length) await generateStoryIdeas({ count: 3 });
  await enqueueImagePromptsForIdeas();
  const result = await createDailyContentPlan({ days: 1, slots_per_day: 3 });
  const plan = result.plan.slice(0, 3).map((item) => `- ${item.local_time_hint}: ${item.title}`).join("\n");
  return sendTelegramMessage(chatId, `<b>Daily Content Plan</b>\n\nCreated: ${result.created_count}\n\n${escapeHtml(plan)}\n\nEvery item is blocked until approval.`, mainTelegramKeyboard());
}

function scheduleLine(item, index) {
  return [
    `${index + 1}. ${item.title || item.draft_id}`,
    `время: ${new Date(item.scheduled_time).toLocaleString("ru-RU")}`,
    `тема: ${item.theme || "story"} / ритм: ${item.rhythm_step || "mixed"}`,
    `эмоция: ${item.emotion || "mixed"}`,
    `картинка: ${item.image_prompt_id ? "одобренный промпт прикреплён" : "нет одобренного промпта"}`,
    `статус: ${item.status || "draft"}`
  ].join("\n");
}

async function telegramSchedule(chatId, args = []) {
  const mode = String(args[0] || "").toLowerCase();
  if (mode === "week" || mode === "неделя") {
    const result = await createSchedulerV2Plan({ days: 7, slots_per_day: 3 });
    const text = result.plan.slice(0, 10).map(scheduleLine).join("\n\n") || "План не создан.";
    const warnings = result.warnings.length ? `\n\nПредупреждения:\n${result.warnings.map((item) => `- ${item}`).join("\n")}` : "";
    return sendTelegramLongMessage(chatId, `<b>Scheduler v2: план на 7 дней</b>\n\nСоздано слотов: ${result.created_count}\n\n${escapeHtml(text)}${escapeHtml(warnings)}\n\n/очередь — посмотреть запланированные черновики\n/approve_schedule — одобрить расписание без публикации\n\nАвтопубликация отключена.`, mainTelegramKeyboard());
  }
  let tomorrow = scheduleItemsForTomorrow();
  if (!tomorrow.length) {
    await createSchedulerV2Plan({ days: 1, slots_per_day: 3 });
    tomorrow = scheduleItemsForTomorrow();
  }
  const text = tomorrow.map(scheduleLine).join("\n\n") || "План на завтра пуст. Сначала создайте черновики и одобрите промпты картинок.";
  return sendTelegramLongMessage(chatId, `<b>Scheduler v2: план на завтра</b>\n\n${escapeHtml(text)}\n\n/план неделя — план на 7 дней\n/очередь — очередь\n/move 1 tomorrow 19:30 — перенести слот\n/unschedule 1 — убрать из расписания\n\nАвтопубликация отключена.`, mainTelegramKeyboard());
}

async function telegramQueue(chatId) {
  const queue = scheduledQueueItems(20);
  if (!queue.length) return sendTelegramMessage(chatId, "Очередь расписания пустая. Сначала используйте /план или /план неделя.", mainTelegramKeyboard());
  return sendTelegramLongMessage(chatId, `<b>Очередь запланированных черновиков</b>\n\n${escapeHtml(queue.map(scheduleLine).join("\n\n"))}\n\n/move 1 tomorrow 19:30 — перенести\n/unschedule 1 — убрать из расписания`, mainTelegramKeyboard());
}

async function telegramMoveSchedule(chatId, args = []) {
  const [numberText, dayText, timeText] = args;
  if (!numberText || !dayText || !timeText) return sendTelegramMessage(chatId, "Usage: /move 1 tomorrow 19:30", mainTelegramKeyboard());
  const item = await moveScheduledPost(numberText, dayText, timeText);
  return sendTelegramMessage(chatId, item ? `Moved #${numberText}\n${escapeHtml(item.title || item.draft_id)}\nNew time: ${escapeHtml(new Date(item.scheduled_time).toLocaleString("ru-RU"))}\n\nNo publishing.` : "Scheduled draft not found. Use /queue.", mainTelegramKeyboard());
}

async function telegramUnschedule(chatId, numberText) {
  const item = await unschedulePost(numberText || "1");
  return sendTelegramMessage(chatId, item ? `Unscheduled #${numberText || "1"}: ${escapeHtml(item.title || item.draft_id)}\n\nIt was removed from the schedule. Nothing was published.` : "Scheduled draft not found. Use /queue.", mainTelegramKeyboard());
}

async function telegramApproveSchedule(chatId) {
  const result = await approveSchedulerV2();
  return sendTelegramMessage(chatId, `<b>Расписание одобрено</b>\n\nОдобрено слотов: ${result.approved_count}\n\nПубликация остаётся отключённой. Одобрение меняет только статус расписания.`, mainTelegramKeyboard());
}

function packageLine(pkg, index) {
  const details = publishingPackageDetails(pkg);
  const scheduleText = details?.schedule?.scheduled_time
    ? new Date(details.schedule.scheduled_time).toLocaleString("ru-RU")
    : "нет расписания";
  return [
    `${index + 1}. ${details?.draft?.title || pkg.draft_id}`,
    `статус: ${pkg.status || "review"}`,
    `картинка: ${pkg.image_prompt_id ? "прикреплена" : "нет"}`,
    `расписание: ${scheduleText}`
  ].join("\n");
}

async function telegramPackages(chatId) {
  const packages = latestPublishingPackages(10);
  if (!packages.length) return sendTelegramMessage(chatId, "Пакетов публикаций пока нет. Используйте /создать_пакет 1.", mainTelegramKeyboard());
  return sendTelegramLongMessage(chatId, `<b>Пакеты публикаций</b>\n\n${escapeHtml(packages.map(packageLine).join("\n\n"))}\n\n/пакет 1 — детали\n/одобрить_пакет 1 — одобрить без публикации\n/отклонить_пакет 1 — отклонить`, mainTelegramKeyboard());
}

async function telegramPackageDetails(chatId, numberText = "1") {
  const pkg = publishingPackageByNumber(numberText);
  const details = publishingPackageDetails(pkg);
  if (!details?.draft) return sendTelegramMessage(chatId, "Пакет не найден. Используйте /пакеты, чтобы увидеть номера 1-10.", mainTelegramKeyboard());
  const scheduleText = details.schedule?.scheduled_time
    ? new Date(details.schedule.scheduled_time).toLocaleString("ru-RU")
    : "нет расписания";
  const text = [
    `<b>Пакет публикации ${escapeHtml(numberText)}</b>`,
    "",
    `<b>${escapeHtml(details.draft.title || "")}</b>`,
    `статус: ${escapeHtml(pkg.status || "review")}`,
    `тема: ${escapeHtml(details.draft.category || details.schedule?.theme || "")}`,
    `эмоция: ${escapeHtml(details.draft.emotion || details.schedule?.emotion || "")}`,
    `время: ${escapeHtml(scheduleText)}`,
    "",
    `<b>Крючок</b>`,
    escapeHtml(details.draft.hook || ""),
    "",
    `<b>Превью истории</b>`,
    escapeHtml(shortText(details.draft.full_story || "", 1400)),
    "",
    `<b>Превью промпта картинки</b>`,
    escapeHtml(shortText(details.image_prompt?.prompt || "Одобренный промпт картинки не прикреплён.", 900)),
    "",
    "publish_allowed: false",
    "approval_required: true",
    "Автоматической публикации в Facebook нет."
  ].join("\n");
  return sendTelegramLongMessage(chatId, text, mainTelegramKeyboard());
}

async function telegramCreatePackage(chatId, draftNumber = "1") {
  const result = await createPublishingPackageFromDraft(draftNumber || "1");
  if (!result.ok) return sendTelegramMessage(chatId, escapeHtml(result.message || "Не удалось создать пакет."), mainTelegramKeyboard());
  const warnings = result.warnings.length ? `\n\nПредупреждения:\n${result.warnings.map((item) => `- ${item}`).join("\n")}` : "";
  const details = result.details;
  return sendTelegramMessage(chatId, `<b>Пакет публикации создан</b>\n\nЗаголовок: ${escapeHtml(details?.draft?.title || result.package.draft_id)}\nСтатус: ${escapeHtml(result.package.status)}\nКартинка: ${result.package.image_prompt_id ? "прикреплена" : "нет"}\nРасписание: ${result.package.schedule_id ? "прикреплено" : "нет"}${escapeHtml(warnings)}\n\n/пакеты — список\n/пакет 1 — детали\n\nПубликация не запускалась.`, mainTelegramKeyboard());
}

async function telegramApprovePackage(chatId, numberText = "1") {
  const pkg = await updatePublishingPackageStatus(numberText, "approved");
  if (!pkg) return sendTelegramMessage(chatId, "Пакет не найден. Используйте /пакеты.", mainTelegramKeyboard());
  const details = publishingPackageDetails(pkg);
  return sendTelegramMessage(chatId, `Пакет ${numberText} одобрен.\nЗаголовок: ${escapeHtml(details?.draft?.title || pkg.draft_id)}\nСтатус: ${escapeHtml(pkg.status)}\n\nПубликация не запускалась.`, mainTelegramKeyboard());
}

async function telegramRejectPackage(chatId, numberText = "1") {
  const pkg = await updatePublishingPackageStatus(numberText, "rejected");
  if (!pkg) return sendTelegramMessage(chatId, "Пакет не найден. Используйте /пакеты.", mainTelegramKeyboard());
  const details = publishingPackageDetails(pkg);
  return sendTelegramMessage(chatId, `Пакет ${numberText} отклонён.\nЗаголовок: ${escapeHtml(details?.draft?.title || pkg.draft_id)}\nСтатус: ${escapeHtml(pkg.status)}\n\nНичего не опубликовано.`, mainTelegramKeyboard());
}

async function telegramReadyPackages(chatId) {
  const packages = readyPublishingPackages().slice(0, 10);
  if (!packages.length) return sendTelegramMessage(chatId, "Одобренных пакетов пока нет. Используйте /одобрить_пакет 1.", mainTelegramKeyboard());
  return sendTelegramLongMessage(chatId, `<b>Готово к публикации</b>\n\n${escapeHtml(packages.map(packageLine).join("\n\n"))}\n\nВажно: «готово» означает только одобрено. Публикация остаётся ручной и отключённой.`, mainTelegramKeyboard());
}

async function telegramDrafts(chatId) {
  const drafts = latestGeneratedDrafts(10);
  if (!drafts.length) return sendTelegramMessage(chatId, "Черновиков пока нет. Сначала используйте /создать измена 3.", mainTelegramKeyboard());
  const text = drafts.map((draft, index) => [
    `${index + 1}. <b>${escapeHtml(draft.title)}</b>`,
    `категория: ${escapeHtml(draft.category || "")}`,
    `эмоция: ${escapeHtml(draft.emotion || "")}`,
    `оценка: ${Number(draft.viral_prediction_score || 0)}/100`,
    `статус: ${escapeHtml(draft.status || "needs_approval")}`
  ].join("\n")).join("\n\n");
  return sendTelegramMessage(chatId, `<b>Черновики историй</b>\n\n${text}\n\n/черновик 1 — полный текст\n/approve 1 — одобрить черновик\n/reject 1 — отклонить черновик\n\nАвтопубликации нет.`, mainTelegramKeyboard());
}

async function telegramDraftDetails(chatId, numberText) {
  const draft = generatedDraftByNumber(numberText);
  if (!draft) return sendTelegramMessage(chatId, "Черновик не найден. Используйте /черновики, чтобы увидеть номера 1-10.", mainTelegramKeyboard());
  const header = [
    `<b>Черновик ${escapeHtml(numberText)}</b>`,
    "",
    `<b>${escapeHtml(draft.title)}</b>`,
    `категория: ${escapeHtml(draft.category || "")}`,
    `эмоция: ${escapeHtml(draft.emotion || "")}`,
    `оценка: ${Number(draft.viral_prediction_score || 0)}/100`,
    `статус: ${escapeHtml(draft.status || "needs_approval")}`,
    "",
    `<b>Крючок</b>`,
    escapeHtml(draft.hook || ""),
    "",
    `<b>Полная история</b>`,
    escapeHtml(draft.full_story || ""),
    "",
    `<b>Мораль</b>`,
    escapeHtml(draft.moral || ""),
    "",
    `<b>Image prompt</b>`,
    escapeHtml(draft.image_prompt || ""),
    "",
    `<b>Почему может сработать</b>`,
    escapeHtml(draft.why_it_should_work || ""),
    "",
    "Нужно одобрение. Используйте /approve 1 или /reject 1. Автопубликации нет."
  ].join("\n");
  return sendTelegramLongMessage(chatId, header, mainTelegramKeyboard());
}

async function telegramApproveCommand(chatId, id) {
  if (!id) return telegramDrafts(chatId);
  if (/^\d+$/.test(String(id))) {
    const draft = await updateGeneratedDraftStatusByNumber(id, "approved");
    return sendTelegramMessage(chatId, draft ? `Approved draft ${id}: ${escapeHtml(draft.title)}\nStatus: ${escapeHtml(draft.status)}\n\nNot published. Manual publishing/approval flow is still required.` : "Draft not found. Use /drafts to see numbers 1-10.", mainTelegramKeyboard());
  }
  const result = setStoryStatusFromTelegram(id, "approve");
  return sendTelegramMessage(chatId, result ? `✅ Approved: ${escapeHtml(result.title)}\nСтатус: ${escapeHtml(result.status)}\n\nNothing was published automatically.` : "История не найдена.", mainTelegramKeyboard());
}

async function telegramRejectCommand(chatId, id) {
  if (!id) return telegramDrafts(chatId);
  if (/^\d+$/.test(String(id))) {
    const draft = await updateGeneratedDraftStatusByNumber(id, "rejected");
    return sendTelegramMessage(chatId, draft ? `Rejected draft ${id}: ${escapeHtml(draft.title)}\nStatus: ${escapeHtml(draft.status)}\n\nNothing was deleted or published.` : "Draft not found. Use /drafts to see numbers 1-10.", mainTelegramKeyboard());
  }
  const result = setStoryStatusFromTelegram(id, "reject");
  return sendTelegramMessage(chatId, result ? `❌ Rejected: ${escapeHtml(result.title)}\nСтатус: ${escapeHtml(result.status)}\n\nNothing was deleted or published.` : "История не найдена.", mainTelegramKeyboard());
}

async function telegramSettings(chatId) {
  const fb = facebookConfigStatus();
  const tg = telegramConfigStatus();
  return sendTelegramMessage(chatId, `⚙ <b>Настройки</b>\n\nFacebook API: ${fb.configured ? "✅" : "⏳"}\nTelegram: ${tg.configured ? "✅" : "⏳"}\nPostgreSQL: ${pgPool ? "✅" : "JSON backup mode"}\n\nСекреты хранятся только локально в .env или environment variables.`, mainTelegramKeyboard());
}

function telegramBrainStatsText(recommendations = buildProjectBrainV2Recommendations()) {
  const topEmotions = recommendations.best_emotions.length
    ? recommendations.best_emotions.slice(0, 3).map((item, index) => `${index + 1}. ${escapeHtml(item.name)} — score ${item.avg_score}`).join("\n")
    : "Пока недостаточно данных.";
  const topHooks = recommendations.best_hook_types.length
    ? recommendations.best_hook_types.slice(0, 3).map((item, index) => `${index + 1}. ${escapeHtml(item.name)} — score ${item.avg_score}`).join("\n")
    : "Пока недостаточно данных.";
  const avoid = recommendations.avoid_topics.length
    ? recommendations.avoid_topics.slice(0, 4).map((item) => `• ${escapeHtml(item.name)} — слабый score ${item.avg_score}`).join("\n")
    : "Пока нет слабых тем. Продолжайте собирать данные.";
  const next = recommendations.suggested_next_story_type || {};
  return [
    "🧠 <b>Project Brain v2</b>",
    "",
    `Story DNA: ${recommendations.dna_count}`,
    `Confidence score: ${recommendations.confidence_score}%`,
    "",
    "<b>Топ эмоции</b>",
    topEmotions,
    "",
    "<b>Топ hooks</b>",
    topHooks,
    "",
    "<b>Следующая рекомендованная история</b>",
    `Тема: ${escapeHtml(next.theme || "family conflict")}`,
    `Эмоция: ${escapeHtml(next.emotion || "hope")}`,
    `Hook: ${escapeHtml(next.hook_type || "hidden truth hook")}`,
    `Конфликт: ${escapeHtml(next.conflict_type || "family moral conflict")}`,
    `Длина: ${escapeHtml(next.story_length || "medium")}`,
    "",
    "<b>Что избегать</b>",
    avoid,
    "",
    escapeHtml(recommendations.reason_why || ""),
    "",
    "Безопасность: полные чужие тексты не сохраняются. Публикации нет."
  ].join("\n");
}

async function telegramBrain(chatId, args = []) {
  const mode = String(args[0] || "").toLowerCase();
  if (mode === "обновить" || mode === "refresh") {
    const result = await refreshProjectBrainV2Expansion();
    return sendTelegramLongMessage(chatId, [
      "🧠 <b>Project Brain v2 обновлён</b>",
      "",
      `Facebook imported: ${result.facebook_imported}`,
      `Generated imported: ${result.generated_imported}`,
      `Research imported: ${result.research_imported}`,
      `Story DNA: ${result.story_dna_count}`,
      `Confidence score: ${result.confidence_score}%`,
      "",
      telegramBrainStatsText(result.recommendations)
    ].join("\n"), mainTelegramKeyboard());
  }
  return sendTelegramLongMessage(chatId, telegramBrainStatsText(), mainTelegramKeyboard());
}

async function telegramBrainRecommendations(chatId) {
  return sendTelegramLongMessage(chatId, telegramBrainStatsText(buildProjectBrainV2Recommendations()), mainTelegramKeyboard());
}

function telegramStyleBrainStatsText(recommendations = buildStyleBrainRecommendations(readStyleBrainProfiles())) {
  const stats = recommendations.statistics || buildStyleBrainStatistics(readStyleBrainProfiles());
  const makeHuman = recommendations.how_to_make_stories_more_human
    .slice(0, 4)
    .map((item) => `• ${item}`)
    .join("\n");
  const avoid = recommendations.words_structures_to_avoid
    .slice(0, 5)
    .map((item) => `• ${item}`)
    .join("\n");
  return [
    "✍️ <b>Style Brain v1</b>",
    "",
    `Profiles: ${stats.profiles_count}`,
    `Hook strength: ${stats.hook_strength}%`,
    `Emotional intensity: ${stats.emotional_intensity}%`,
    `Dialogue density: ${stats.dialogue_density}%`,
    `Boring risk: ${stats.boring_risk}%`,
    `Human realism: ${stats.human_realism_score}%`,
    "",
    "<b>Рекомендации</b>",
    `Opening: ${escapeHtml(recommendations.ideal_opening_style)}`,
    `Hook: ${escapeHtml(recommendations.ideal_hook_type)}`,
    `Dialogue: ${escapeHtml(recommendations.ideal_dialogue_density)}`,
    `Paragraphs: ${escapeHtml(recommendations.paragraph_rhythm)}`,
    "",
    "<b>Сделать живее</b>",
    escapeHtml(makeHuman),
    "",
    "<b>Избегать</b>",
    escapeHtml(avoid),
    "",
    "Безопасность: Style Brain хранит только style signals и не публикует."
  ].join("\n");
}

async function telegramStyleBrain(chatId, args = []) {
  const mode = String(args[0] || "").toLowerCase();
  if (mode === "обновить" || mode === "refresh" || mode === "update") {
    const result = await refreshStyleBrainV1();
    return sendTelegramLongMessage(chatId, [
      "✍️ <b>Style Brain обновлён</b>",
      "",
      `Analyzed: ${result.analyzed}`,
      `Profiles: ${result.profiles_count}`,
      "",
      telegramStyleBrainStatsText(result.recommendations)
    ].join("\n"), mainTelegramKeyboard());
  }
  return sendTelegramLongMessage(chatId, telegramStyleBrainStatsText(), mainTelegramKeyboard());
}

async function telegramStyleBrainRecommendations(chatId) {
  return sendTelegramLongMessage(chatId, telegramStyleBrainStatsText(buildStyleBrainRecommendations(readStyleBrainProfiles())), mainTelegramKeyboard());
}

async function telegramForceBrainSync(chatId) {
  return telegramBrain(chatId, ["обновить"]);
}

async function legacyTelegramHelp(chatId) {
  return sendTelegramMessage(chatId, `<b>AI Story Traffic Platform Commands</b>\n\n/status — system connection status\n/stats — stories and traffic stats\n/drafts — drafts and stories waiting for review\n/approve — show approval list\n/approve STORY_ID — approve a story locally\n/reject — show rejection list\n/reject STORY_ID — reject a story locally\n/help — command list\n\nButtons:\n✅ Approve — marks story as approved\n✏ Edit — returns story to review\n❌ Reject — marks story as rejected\n\nPublishing is never automatic.`, mainTelegramKeyboard());
}

async function telegramHelp(chatId) {
  return sendTelegramMessage(chatId, [
    "<b>AI Story Traffic Platform — команды</b>",
    "",
    "<b>Русский интерфейс</b>",
    "/старт — главное меню",
    "/статус — статус системы",
    "/поиск измена — найти идеи и тренды",
    "/создать измена 3 — создать 3 черновика",
    "/черновики — последние черновики",
    "/черновик 1 — полный текст черновика",
    "/картинка 1 — создать 3 промпта картинки",
    "/картинки — очередь промптов",
    "/одобрить_картинку 1 — одобрить промпт",
    "/план — план на завтра",
    "/план неделя — план на 7 дней",
    "/очередь — очередь расписания",
    "/создать_пакет 1 — собрать пакет на проверку",
    "/пакеты — последние пакеты",
    "/пакет 1 — детали пакета",
    "/одобрить_пакет 1 — одобрить пакет без публикации",
    "/отклонить_пакет 1 — отклонить пакет",
    "/готово — одобренные пакеты",
    "/мозг — Project Brain v2",
    "/мозг обновить — импорт Facebook/generated/research в Story DNA",
    "/обновить_мозг — принудительная полная синхронизация Project Brain",
    "/рекомендации — рекомендации Project Brain",
    "/стиль — Style Brain v1",
    "/стиль обновить — проанализировать Facebook/generated/research/approved packages",
    "/стиль рекомендации — рекомендации по живому стилю",
    "/помощь — эта справка",
    "",
    "<b>English commands still work</b>",
    "/status, /research betrayal, /generate betrayal 3, /drafts, /draft 1, /image 1, /images, /schedule, /schedule week, /queue, /create_package 1, /packages, /package 1, /approve_package 1, /reject_package 1, /ready, /brain, /recommendations, /help",
    "",
    "Кнопки снизу показывают подсказки для ежедневной работы.",
    "",
    telegramSafetyFooter(),
    "Публикации в Facebook нет."
  ].join("\n"), mainTelegramKeyboard());
}

function telegramCommandList() {
  return [
    { command: "start", description: "Главное меню" },
    { command: "status", description: "Статус системы" },
    { command: "load_posts", description: "Загрузить посты Facebook" },
    { command: "analyze", description: "Анализ постов" },
    { command: "research", description: "Поиск идей" },
    { command: "generate", description: "Создать черновики" },
    { command: "drafts", description: "Черновики" },
    { command: "draft", description: "Открыть черновик" },
    { command: "image", description: "Создать промпты картинки" },
    { command: "images", description: "Очередь промптов" },
    { command: "image_prompt", description: "Полный промпт" },
    { command: "approve_image", description: "Одобрить промпт" },
    { command: "reject_image", description: "Отклонить промпт" },
    { command: "schedule", description: "План публикаций" },
    { command: "queue", description: "Очередь расписания" },
    { command: "packages", description: "Пакеты публикаций" },
    { command: "package", description: "Детали пакета" },
    { command: "create_package", description: "Создать пакет" },
    { command: "approve_package", description: "Одобрить пакет" },
    { command: "reject_package", description: "Отклонить пакет" },
    { command: "ready", description: "Готово к публикации" },
    { command: "move", description: "Перенести слот" },
    { command: "unschedule", description: "Убрать из расписания" },
    { command: "approve_schedule", description: "Одобрить расписание" },
    { command: "stats", description: "Статистика" },
    { command: "brain", description: "Project Brain v2" },
    { command: "update_brain", description: "Force Project Brain sync" },
    { command: "recommendations", description: "Рекомендации мозга" },
    { command: "style", description: "Style Brain v1" },
    { command: "update_style", description: "Refresh Style Brain" },
    { command: "style_recommendations", description: "Style recommendations" },
    { command: "approve", description: "Одобрить черновик" },
    { command: "reject", description: "Отклонить черновик" },
    { command: "help", description: "Помощь" }
  ];
}

async function registerTelegramCommands() {
  if (!telegramConfigStatus().configured) return null;
  return telegramApi("setMyCommands", { commands: telegramCommandList() });
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
  if (data === "menu:images") return telegramImageQueueV2(chatId);
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

function telegramCommandParts(text = "") {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  const raw = (parts[0] || "").toLowerCase();
  return {
    command: raw.replace(/@[\w_]+$/, ""),
    args: parts.slice(1)
  };
}

async function handleTelegramUpdate(update = {}) {
  if (update.message) await handleTelegramMessage(update.message);
  if (update.callback_query) await handleTelegramCallback(update.callback_query);
  return {
    ok: true,
    update_id: update.update_id || null,
    handled: Boolean(update.message || update.callback_query)
  };
}

async function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const { command, args } = telegramCommandParts(text);
  if (process.env.CHAT_ID && String(chatId) !== String(process.env.CHAT_ID)) {
    return sendTelegramMessage(chatId, "Этот бот привязан к другому CHAT_ID.");
  }
  if (text === "🧠 Статус") return telegramStatus(chatId);
  if (text === "📚 Черновики") return telegramDrafts(chatId);
  if (text === "✅ Готово к публикации") return telegramReadyPackages(chatId);
  if (text === "❓ Помощь") return telegramHelp(chatId);
  if (["🔍 Поиск идей", "✍️ Создать истории", "🎨 Картинки", "📅 План", "📦 Пакеты"].includes(text)) {
    return telegramButtonGuide(chatId, text);
  }
  if (command === "/start") return telegramStart(chatId);
  if (command === "/старт") return telegramStart(chatId);
  if (command === "/help" || command === "/помощь") return telegramHelp(chatId);
  if (command === "/status" || command === "/статус") return telegramStatus(chatId);
  if (command === "/load_posts") return telegramLoadPosts(chatId);
  if (command === "/analyze") return telegramAnalyze(chatId);
  if (command === "/research" || command === "/поиск") return telegramResearch(chatId, args.join(" "));
  if (command === "/generate" || command === "/создать") return telegramGenerateStory(chatId, args);
  if (command === "/ideas") return telegramIdeas(chatId);
  if (command === "/plan") return telegramPlan(chatId);
  if (command === "/schedule" || command === "/план") return telegramSchedule(chatId, args);
  if (command === "/queue" || command === "/очередь") return telegramQueue(chatId);
  if (command === "/move") return telegramMoveSchedule(chatId, args);
  if (command === "/unschedule") return telegramUnschedule(chatId, args[0]);
  if (command === "/approve_schedule") return telegramApproveSchedule(chatId);
  if (command === "/packages" || command === "/пакеты") return telegramPackages(chatId);
  if (command === "/package" || command === "/пакет") return telegramPackageDetails(chatId, args[0] || "1");
  if (command === "/create_package" || command === "/создать_пакет") return telegramCreatePackage(chatId, args[0] || "1");
  if (command === "/approve_package" || command === "/одобрить_пакет") return telegramApprovePackage(chatId, args[0] || "1");
  if (command === "/reject_package" || command === "/отклонить_пакет") return telegramRejectPackage(chatId, args[0] || "1");
  if (command === "/ready" || command === "/готово") return telegramReadyPackages(chatId);
  if (command === "/update_brain" || command === "/обновить_мозг") return telegramForceBrainSync(chatId);
  if (command === "/brain" || command === "/мозг") return telegramBrain(chatId, args);
  if (command === "/recommendations" || command === "/рекомендации") return telegramBrainRecommendations(chatId);
  if (command === "/style" || command === "/стиль") {
    if (String(args[0] || "").toLowerCase() === "рекомендации") return telegramStyleBrainRecommendations(chatId);
    return telegramStyleBrain(chatId, args);
  }
  if (command === "/update_style") return telegramStyleBrain(chatId, ["refresh"]);
  if (command === "/style_recommendations") return telegramStyleBrainRecommendations(chatId);
  if (command === "/stats") return telegramStats(chatId);
  if (command === "/drafts" || command === "/черновики") return telegramDrafts(chatId);
  if (command === "/draft" || command === "/черновик") return telegramDraftDetails(chatId, args[0]);
  if (command === "/approve" || command === "/одобрить") return telegramApproveCommand(chatId, args[0]);
  if (command === "/reject" || command === "/отклонить") return telegramRejectCommand(chatId, args[0]);
  if (command === "/stories") return telegramStories(chatId);
  if (command === "/image" || command === "/картинка") return telegramCreateImagePrompts(chatId, args[0] || "1");
  if (command === "/images" || command === "/картинки") return telegramImageQueueV2(chatId);
  if (command === "/image_prompt") return telegramImagePromptDetailsV2(chatId, args[0] || "1");
  if (command === "/approve_image" || command === "/одобрить_картинку") return telegramApproveImageCommand(chatId, args[0] || "1");
  if (command === "/reject_image" || command === "/отклонить_картинку") return telegramRejectImageCommand(chatId, args[0] || "1");
  if (command === "/audience") return telegramAudience(chatId);
  if (command === "/competitors") return telegramCompetitors(chatId);
  if (command === "/autopilot") return telegramAutopilot(chatId);
  if (command === "/settings") return telegramSettings(chatId);
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
      await handleTelegramUpdate(update);
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
  registerTelegramCommands().catch((error) => console.warn(`Telegram setMyCommands failed: ${error.message}`));
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

async function loadAndSavePaginatedFacebookPosts({ selectedAttempt, pageAccessToken, attempts, refresh, pageId, pageAccessTokenSource, fields, options = {} }) {
  const startedAt = Date.now();
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || process.env.FACEBOOK_SYNC_MAX_PAGES || 10), 10));
  const maxPosts = Math.max(1, Math.min(Number(options.maxPosts || process.env.FACEBOOK_SYNC_MAX_POSTS || 250), 250));
  const timeoutMs = Math.max(5000, Math.min(Number(options.timeoutMs || process.env.FACEBOOK_SYNC_TIMEOUT_MS || 50000), 55000));
  const token = encodeURIComponent(pageAccessToken);
  const existingPosts = readFacebookPosts();
  const fetchedPosts = [];
  let pages = 1;
  let nextUrl = selectedAttempt.paging_next;

  try {
    const firstPostsWithInsights = await Promise.all((selectedAttempt.data.data || []).map(async (post) => ({
      ...post,
      insights: await fetchFacebookPostInsights(post.id, token)
    })));
    fetchedPosts.push(...firstPostsWithInsights.map((post) =>
      normalizeFacebookPost(post, existingPosts.find((item) => item.facebook_post_id === post.id))
    ));
  } catch (error) {
    return {
      ok: false,
      configured: true,
      posts: [],
      code: "facebook_posts_normalize_failed",
      message: safeMetaError(error),
      diagnostics: { selected_endpoint: selectedAttempt.edge, selected_field_profile: selectedAttempt.field_profile, attempts }
    };
  }

  try {
    while (nextUrl && pages < maxPages && fetchedPosts.length < maxPosts && Date.now() - startedAt < timeoutMs) {
      const page = await fetchFacebookPostsPage(nextUrl, token, [...existingPosts, ...fetchedPosts]);
      const remaining = maxPosts - fetchedPosts.length;
      fetchedPosts.push(...page.posts.slice(0, remaining));
      nextUrl = page.next;
      pages += 1;
    }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      posts: [],
      code: "meta_api_error",
      message: error.message || "Meta Graph API could not load paginated posts.",
      meta_status: error.metaStatus || null,
      diagnostics: {
        graph_api_version: FACEBOOK_GRAPH_VERSION,
        selected_endpoint: selectedAttempt.edge,
        selected_field_profile: selectedAttempt.field_profile,
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

  const incomingById = new Map();
  let duplicateInApi = 0;
  for (const post of fetchedPosts) {
    if (!post.facebook_post_id) continue;
    if (incomingById.has(post.facebook_post_id)) {
      duplicateInApi += 1;
      continue;
    }
    incomingById.set(post.facebook_post_id, post);
  }

  const mergedById = new Map(existingPosts.map((post) => [post.facebook_post_id, post]));
  let savedNew = 0;
  let updatedExisting = 0;
  for (const [postId, post] of incomingById.entries()) {
    const existing = mergedById.get(postId);
    if (existing) {
      updatedExisting += 1;
      mergedById.set(postId, {
        ...post,
        created_at: existing.created_at || post.created_at
      });
    } else {
      savedNew += 1;
      mergedById.set(postId, post);
    }
  }

  const skippedDuplicates = updatedExisting + duplicateInApi;
  const merged = [...mergedById.values()].sort((a, b) => b.total_score - a.total_score);
  writeFacebookPosts(merged);
  const autoSync = await autoSyncProjectBrainV2({ sources: ["facebook"], reason: "facebook_posts_loaded" });

  const stoppedByTimeout = Boolean(nextUrl && Date.now() - startedAt >= timeoutMs);
  const stoppedByMaxPosts = Boolean(nextUrl && fetchedPosts.length >= maxPosts);
  return {
    ok: true,
    configured: true,
    posts: merged,
    summary: {
      loaded_posts: fetchedPosts.length,
      saved_new_posts: savedNew,
      skipped_duplicates: skippedDuplicates,
      updated_existing_posts: updatedExisting,
      duplicate_posts_in_api: duplicateInApi,
      pages_loaded: pages,
      max_pages: maxPages,
      max_posts: maxPosts,
      stopped_by_timeout: stoppedByTimeout,
      stopped_by_max_posts: stoppedByMaxPosts,
      auto_sync: {
        story_dna_count: autoSync.story_dna_count,
        confidence_score: autoSync.confidence_score,
        last_learning_time: autoSync.last_learning_time
      },
      has_more: Boolean(nextUrl),
      selected_endpoint: selectedAttempt.edge,
      selected_field_profile: selectedAttempt.field_profile,
      attempts
    },
    message: `Loaded ${fetchedPosts.length} posts. Saved new ${savedNew} posts. Skipped duplicates ${skippedDuplicates} posts. Updated existing ${updatedExisting} posts.`
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

  return await loadAndSavePaginatedFacebookPosts({
    selectedAttempt,
    pageAccessToken,
    attempts,
    refresh,
    pageId,
    pageAccessTokenSource,
    fields,
    options
  });

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
    const autoSync = await autoSyncProjectBrainV2({ sources: ["facebook"], reason: "facebook_historical_sync" });
    return {
      ok: true,
      configured: true,
      posts: merged,
      summary: {
        count: merged.length,
        loaded: posts.length,
        pages,
        best_score: merged[0]?.total_score || 0,
        selected_endpoint: selectedAttempt.edge,
        selected_field_profile: selectedAttempt.field_profile,
        auto_sync: {
          story_dna_count: autoSync.story_dna_count,
          confidence_score: autoSync.confidence_score,
          last_learning_time: autoSync.last_learning_time
        }
      },
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
  const autoSync = await autoSyncProjectBrainV2({ sources: ["facebook"], reason: "facebook_posts_loaded" });
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
      auto_sync: {
        story_dna_count: autoSync.story_dna_count,
        confidence_score: autoSync.confidence_score,
        last_learning_time: autoSync.last_learning_time
      },
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

function requestQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  return Object.fromEntries(url.searchParams.entries());
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/telegram/status" && req.method === "GET") {
    const config = telegramConfigStatus();
    let bot = { ok: false, username: "" };
    if (config.has_bot_token) bot = await telegramBotInfo();
    return sendJson(res, 200, {
      ...config,
      ok: config.configured && bot.ok,
      bot_username: bot.username || "",
      bot_ok: bot.ok,
      message: config.configured
        ? (bot.ok ? "Telegram env is configured and bot token is valid." : "Telegram env exists, but bot token check failed.")
        : "Telegram is not configured. BOT_TOKEN and CHAT_ID are required."
    });
  }

  if (pathname === "/api/telegram/webhook" && req.method === "POST") {
    try {
      const update = await parseBody(req);
      const result = await handleTelegramUpdate(update);
      return sendJson(res, 200, result);
    } catch (error) {
      console.warn(`Telegram webhook failed: ${error.message}`);
      return sendJson(res, 200, {
        ok: false,
        code: "telegram_webhook_failed",
        message: error.message
      });
    }
  }

  if (pathname === "/api/telegram/set-webhook" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await setTelegramWebhook());
  }

  if (pathname === "/api/telegram/webhook-info" && req.method === "GET") {
    return sendJson(res, 200, await telegramWebhookInfo());
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

  if (pathname === "/api/style-brain-v1" && req.method === "GET") {
    const profiles = readStyleBrainProfiles();
    return sendJson(res, 200, {
      ok: true,
      module: "Style Brain v1",
      statistics: buildStyleBrainStatistics(profiles),
      recommendations: buildStyleBrainRecommendations(profiles),
      profiles_sample: profiles.slice(0, 20),
      safety: {
        stores_full_copyrighted_text: false,
        stores_style_signals_only: true,
        publishing_enabled: false,
        copies_competitor_text: false
      }
    });
  }

  if (pathname === "/api/style-brain-v1/refresh" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await refreshStyleBrainV1());
  }

  if (pathname === "/api/style-brain-v1/recommendations" && req.method === "GET") {
    return sendJson(res, 200, buildStyleBrainRecommendations(readStyleBrainProfiles()));
  }

  if (pathname === "/api/project-brain-v2" && req.method === "GET") {
    const dnaItems = readStoryDna().length ? readStoryDna() : readResearchStories().map(storyDnaFromResearchStory).filter(Boolean);
    const brain = readProjectBrain();
    const autoSync = brain.internet_research?.project_brain_v2_auto || {
      status: "ready",
      automatic_sync_enabled: true,
      last_learning_time: null,
      history: []
    };
    return sendJson(res, 200, {
      ok: true,
      module: "Project Brain v2 Auto Sync",
      statistics: buildStoryDnaStatistics(dnaItems),
      auto_sync: autoSync,
      recommendations: autoSync.recommendations || buildProjectBrainV2Recommendations(),
      story_dna_sample: dnaItems.slice(0, 20),
      safety: {
        stores_full_copyrighted_text: false,
        stores_patterns_only: true,
        publishing_enabled: false,
        generation_changed: false
      }
    });
  }

  if (pathname === "/api/project-brain-v2/import-facebook" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await importFacebookPostsToStoryDna());
  }

  if (pathname === "/api/project-brain-v2/import-generated" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await importGeneratedStoriesToStoryDna());
  }

  if (pathname === "/api/project-brain-v2/recommendations" && req.method === "GET") {
    return sendJson(res, 200, buildProjectBrainV2Recommendations());
  }

  if (pathname === "/api/project-brain-v2/refresh" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await refreshProjectBrainV2Expansion());
  }

  if (pathname === "/api/security-audit" && req.method === "GET") {
    return sendJson(res, 200, securityAudit());
  }

  if (pathname === "/api/autopilot/v1/status" && req.method === "GET") {
    return sendJson(res, 200, buildAutopilotV1Status());
  }

  if (pathname === "/api/autopilot/v1/analyze" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, buildAIPageAnalysis());
  }

  if (pathname === "/api/autopilot/v1/research" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await runInternetStoryResearch(req.method === "POST" ? await parseBody(req) : requestQuery(req)));
  }

  if (pathname === "/api/autopilot/v1/competitors" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, buildCompetitorAutopilotAnalysis());
  }

  if (pathname === "/api/autopilot/v1/ideas" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await generateStoryIdeas(req.method === "POST" ? await parseBody(req) : {}));
  }

  if (pathname === "/api/autopilot/v1/generate-story" && req.method === "POST") {
    return sendJson(res, 200, await generateOriginalStoriesV2(await parseBody(req)));
  }

  if (pathname === "/api/autopilot/v1/image-prompts" && req.method === "POST") {
    const payload = await parseBody(req);
    return sendJson(res, 200, await createImagePromptsForGeneratedDraft(payload.draft_id || payload.draft || payload.index || "1"));
  }

  if (pathname === "/api/autopilot/v1/image-queue" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      module: "Image Generator Queue",
      queue: readImageQueue(),
      safety: { prompt_only: true, image_generation_enabled: false, publish_allowed: false }
    });
  }

  if (pathname === "/api/autopilot/v1/image-queue" && req.method === "POST") {
    return sendJson(res, 200, await enqueueImagePromptsForIdeas());
  }

  if (pathname === "/api/autopilot/v1/plan" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await createDailyContentPlan(req.method === "POST" ? await parseBody(req) : {}));
  }

  if (pathname === "/api/autopilot/v1/scheduler-v2" && ["GET", "POST"].includes(req.method)) {
    const payload = req.method === "POST" ? await parseBody(req) : requestQuery(req);
    return sendJson(res, 200, await createSchedulerV2Plan(payload));
  }

  if (pathname === "/api/autopilot/v1/scheduled-posts" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      module: "AI Scheduler v2",
      tomorrow: scheduleItemsForTomorrow(),
      queue: scheduledQueueItems(100),
      safety: { autopublishing: false, approval_required: true, publish_allowed: false }
    });
  }

  if (pathname === "/api/autopilot/v1/packages" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      module: "Approval Pipeline v2",
      packages: latestPublishingPackages(100),
      ready: readyPublishingPackages(),
      safety: { publish_allowed: false, approval_required: true, facebook_publishing: false }
    });
  }

  if (pathname === "/api/autopilot/v1/packages" && req.method === "POST") {
    const payload = await parseBody(req);
    return sendJson(res, 200, await createPublishingPackageFromDraft(payload.draft || payload.draft_id || payload.index || "1"));
  }

  if (pathname === "/api/autopilot/v1/package-status" && req.method === "POST") {
    const payload = await parseBody(req);
    const updated = await updatePublishingPackageStatus(payload.package || payload.index || "1", payload.status || "review");
    return sendJson(res, 200, {
      ok: Boolean(updated),
      module: "Approval Pipeline v2",
      package: updated,
      details: publishingPackageDetails(updated),
      safety: { publish_allowed: false, approval_required: true, facebook_publishing: false }
    });
  }

  if (pathname === "/api/autopilot/v1/schedule" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, {
      ok: true,
      module: "Scheduler",
      plan: readContentPlan(),
      message: "Schedule is approval-only. Nothing is published automatically.",
      safety: { autopublishing: false, approval_required: true }
    });
  }

  if (pathname === "/api/autopilot/v1/run" && ["GET", "POST"].includes(req.method)) {
    return sendJson(res, 200, await runAutopilotV1Plan());
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
    if (pathname === "/project-brain") return send(res, 200, renderProjectBrainDashboard());
    if (pathname === "/style-brain") return send(res, 200, renderStyleBrainDashboard());
    if (pathname === "/ai-autopilot") return send(res, 200, renderAutopilotDashboard());
    if (pathname === "/ai-autopilot-v1") return send(res, 200, renderAutopilotV1Dashboard());
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
