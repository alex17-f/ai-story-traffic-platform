const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-story-rc1-"));
const port = 43173 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let child = null;

function startServer() {
  child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      LOAD_LOCAL_ENV: "false",
      DATABASE_URL: "",
      BOT_TOKEN: "",
      CHAT_ID: "",
      META_APP_ID: "",
      META_APP_SECRET: "",
      FACEBOOK_PAGE_ID: "",
      FACEBOOK_PAGE_ACCESS_TOKEN: "",
      TAVILY_API_KEY: "",
      OPENAI_API_KEY: "",
      ENABLE_OPENAI_IMAGES: "false",
      PUBLIC_BASE_URL: baseUrl
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/storage-status`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("RC-1 smoke server did not start.");
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { status: response.status, data };
}

async function post(pathname, body) {
  return request(pathname, { method: "POST", body: JSON.stringify(body || {}) });
}

async function stopServer() {
  if (!child || child.killed) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
  child = null;
}

async function run() {
  const checks = [];
  const check = (name, condition, details = "") => {
    assert.ok(condition, `${name}${details ? `: ${details}` : ""}`);
    checks.push(name);
  };

  startServer();
  await waitForServer();

  const storage = await request("/api/storage-status");
  check("explicit local JSON fallback", storage.data.storage_mode === "json_local_fallback");
  check("production publishing disabled", storage.data.safety?.publishing_enabled === false);

  const generated = await post("/api/autopilot/v1/generate-story", {
    category: "betrayal",
    emotion: "hope",
    length: "medium",
    count: 1
  });
  check("story generation", generated.status === 200 && generated.data.ok && generated.data.story?.id);
  const draftId = generated.data.story.id;

  const editorial = await post("/api/editorial-board/review", { draft_id: draftId });
  check("editorial review", editorial.data.ok && editorial.data.review?.id);

  const safety = await post("/api/content-safety/v1/check-draft", { draft_id: draftId });
  check("content safety", safety.data.ok && safety.data.review?.id);

  const visuals = await post("/api/visual-intelligence/v1/concepts", { draft_id: draftId });
  check("visual intelligence", visuals.data.ok && visuals.data.concepts?.length === 5);
  const conceptId = visuals.data.concepts[0].id;

  const selected = await post("/api/visual-intelligence/v1/select", { visual_concept_id: conceptId });
  check("visual selection", selected.data.ok && selected.data.selected_concept?.status === "selected");

  const visualQuality = await post("/api/visual-quality/v1/check", { visual_concept_id: conceptId });
  check("visual quality", visualQuality.status === 200 && visualQuality.data.review?.id);
  const visualReviewId = visualQuality.data.review.id;

  const visualReview = await request(`/api/visual-quality/v1/review/${encodeURIComponent(visualReviewId)}`);
  check("visual quality lookup", visualReview.status === 200 && visualReview.data.review?.id === visualReviewId);

  const missingVisual = await request("/api/visual-quality/v1/review/does-not-exist");
  check("visual quality missing lookup", missingVisual.status === 404 && missingVisual.data.code === "visual_quality_review_not_found");

  const emptyVisual = await post("/api/visual-quality/v1/check", {});
  check("visual quality empty body", emptyVisual.status === 400 && emptyVisual.data.code === "visual_concept_reference_required");

  const imagePrompts = await post("/api/autopilot/v1/image-prompts", { draft_id: draftId });
  check("image prompts", imagePrompts.data.ok && imagePrompts.data.prompts?.length === 3);
  const imagePromptId = imagePrompts.data.prompts[0].id;

  const approvedImage = await post("/api/autopilot/v1/image-status", {
    image_prompt_id: imagePromptId,
    status: "approved"
  });
  check("image prompt approval", approvedImage.data.ok && approvedImage.data.image_prompt?.status === "approved");

  const schedule = await post("/api/autopilot/v1/schedule-draft", {
    draft_id: draftId,
    day: "tomorrow",
    time: "19:00"
  });
  check("scheduler", schedule.data.ok && schedule.data.schedule?.id);

  const packageResult = await post("/api/autopilot/v1/packages", { draft_id: draftId });
  check("approval package", packageResult.data.ok && packageResult.data.package?.id);
  const packageId = packageResult.data.package.id;
  check("tracked first comment", /\/s\//.test(packageResult.data.package.comment_text || ""));
  check("Facebook fragment has no link", !/https?:\/\//i.test(packageResult.data.package.facebook_fragment || ""));

  const packageApproval = await post("/api/autopilot/v1/package-status", {
    package: packageId,
    status: "approved"
  });
  check("package approval remains manual", packageApproval.data.package?.publish_allowed === false);

  const readiness = await post("/api/readiness-gate/v1/check-package", { package_id: packageId });
  check("readiness gate", readiness.data.ok && readiness.data.package_id === packageId);

  const preview = await post("/api/prepublish/v1/preview-package", { package_id: packageId });
  check("prepublish simulator responds", preview.status === 200 && typeof preview.data.ok === "boolean");

  const storyPreview = await fetch(`${baseUrl}/story-preview/${encodeURIComponent(packageId)}`);
  check("website preview", storyPreview.status === 200);

  const firstUpdate = await post("/api/telegram/webhook", {
    update_id: 910000001,
    message: { chat: { id: 1 }, text: "/status" }
  });
  const duplicateUpdate = await post("/api/telegram/webhook", {
    update_id: 910000001,
    message: { chat: { id: 1 }, text: "/status" }
  });
  check("Telegram update handled", firstUpdate.data.ok && firstUpdate.data.duplicate === false);
  check("Telegram update idempotency", duplicateUpdate.data.ok && duplicateUpdate.data.duplicate === true);

  const imageGeneration = await post("/api/images/v3/generate", { image_prompt_id: imagePromptId });
  check("OpenAI Images disabled", imageGeneration.data.code === "image_generation_disabled");

  await stopServer();
  startServer();
  await waitForServer();

  const packagesAfterRestart = await request("/api/autopilot/v1/packages");
  const reviewsAfterRestart = await request("/api/visual-quality/v1/reviews");
  check("package persistence after restart", packagesAfterRestart.data.packages?.some((item) => item.id === packageId));
  check("visual review persistence after restart", reviewsAfterRestart.data.latest_reviews?.some((item) => item.id === visualReviewId));

  console.log(JSON.stringify({
    ok: true,
    checks,
    package_id: packageId,
    readiness_status: readiness.data.status,
    readiness_score: readiness.data.readiness_score,
    temp_data_dir: dataDir,
    publishing_enabled: false
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
  });
