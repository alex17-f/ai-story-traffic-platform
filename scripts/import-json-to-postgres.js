const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const root = path.join(__dirname, "..");

function loadLocalEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) continue;
    const [key, ...valueParts] = clean.split("=");
    if (!process.env[key]) process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

function readJsonArray(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function now(value) {
  return value || new Date().toISOString();
}

async function importStories(pool) {
  const stories = readJsonArray("data/stories.json");
  for (const story of stories) {
    await pool.query(
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
        story.status || "draft",
        Number(story.views || 0),
        Number(story.clicks || 0),
        story.ai_assistant_notes || "",
        story.seo_title || "",
        story.seo_description || "",
        now(story.created_at),
        now(story.updated_at)
      ]
    );
  }
  console.log(`Imported stories: ${stories.length}`);
}

async function importFacebookPosts(pool) {
  const posts = readJsonArray("data/facebook_posts.json");
  for (const post of posts) {
    await pool.query(
      `insert into facebook_posts (
        id, facebook_post_id, message, permalink_url, published_at, likes_count, comments_count,
        shares_count, reach_count, link_clicks_count, total_score, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
        updated_at = excluded.updated_at`,
      [
        post.id || crypto.randomUUID(),
        post.facebook_post_id || post.id,
        post.message || "",
        post.permalink_url || "",
        post.published_at || post.created_time || null,
        Number(post.likes_count || post.likes || 0),
        Number(post.comments_count || post.comments || 0),
        Number(post.shares_count || post.shares || 0),
        Number(post.reach_count || post.reach || 0),
        Number(post.link_clicks_count || post.link_clicks || 0),
        Number(post.total_score || post.score || 0),
        now(post.created_at),
        now(post.updated_at)
      ]
    );
  }
  console.log(`Imported facebook_posts: ${posts.length}`);
}

async function importCompetitors(pool) {
  const competitors = readJsonArray("data/competitors.json");
  for (const competitor of competitors) {
    await pool.query(
      `insert into competitors (
        id, name, url, category, followers_count, average_likes, average_comments, average_shares,
        popular_topics, popular_image_types, posting_frequency, notes, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      on conflict (url) do update set
        name = excluded.name,
        category = excluded.category,
        followers_count = excluded.followers_count,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
      [
        competitor.id || crypto.randomUUID(),
        competitor.name,
        competitor.url,
        competitor.category || "Facebook-страница",
        Number(competitor.followers_count || 0),
        Number(competitor.average_likes || 0),
        Number(competitor.average_comments || 0),
        Number(competitor.average_shares || 0),
        JSON.stringify(competitor.popular_topics || []),
        JSON.stringify(competitor.popular_image_types || []),
        competitor.posting_frequency || "",
        competitor.notes || "",
        now(competitor.added_at || competitor.created_at),
        now(competitor.updated_at)
      ]
    );
  }
  console.log(`Imported competitors: ${competitors.length}`);
}

async function importProjectBrain(pool) {
  const brainPath = path.join(root, "data/project_brain.json");
  if (!fs.existsSync(brainPath)) {
    console.log("Imported project_brain: skipped");
    return;
  }
  const brain = JSON.parse(fs.readFileSync(brainPath, "utf8"));
  await pool.query(
    `insert into project_brain (
      id, best_topics, best_images, best_times, work_history, autopilot_runs, recommendations, updated_at
    ) values ('main', $1, $2, $3, $4, $5, $6, now())
    on conflict (id) do update set
      best_topics = excluded.best_topics,
      best_images = excluded.best_images,
      best_times = excluded.best_times,
      work_history = excluded.work_history,
      autopilot_runs = excluded.autopilot_runs,
      recommendations = excluded.recommendations,
      updated_at = now()`,
    [
      JSON.stringify(brain.best_topics || []),
      JSON.stringify(brain.best_images || []),
      JSON.stringify(brain.best_times || []),
      JSON.stringify(brain.work_history || []),
      JSON.stringify(brain.autopilot_runs || []),
      JSON.stringify(brain.recommendations || [])
    ]
  );
  console.log("Imported project_brain: 1");
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Add it to .env or your hosting environment variables.");
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });
  await importStories(pool);
  await importFacebookPosts(pool);
  await importCompetitors(pool);
  await importProjectBrain(pool);
  await pool.end();
  console.log("JSON import complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
