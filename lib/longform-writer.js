"use strict";

// Implementation detail of the existing Story Generator v2, not a new publishing pipeline.
// Disabled unless STORY_TEXT_PROVIDER=openai. Never silently replace an AI failure with templates.
const MIN_CHARS = 8000;
const MAX_CHARS = 20000;

function validateLongformDraft(draft) {
  const issues = [];
  const title = String(draft && draft.title || "").trim();
  const fullStory = String(draft && draft.full_story || "").trim();
  const moral = String(draft && draft.moral || "").trim();
  const paragraphs = fullStory.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (title.length < 12 || title.length > 160) issues.push("title_length");
  if (fullStory.length < MIN_CHARS || fullStory.length > MAX_CHARS) issues.push("story_length_8000_20000");
  if (paragraphs.length < 14) issues.push("too_few_paragraphs");
  const letters = fullStory.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  const cyrillic = fullStory.match(/[А-Яа-яЁё]/g) || [];
  if (!letters.length || cyrillic.length / letters.length < 0.75) issues.push("not_russian");
  const beginnings = paragraphs.map((p) => p.toLowerCase().replace(/\s+/g, " ").slice(0, 90));
  if (new Set(beginnings).size !== beginnings.length) issues.push("duplicate_paragraph_openings");
  const seen = new Set();
  for (const paragraph of paragraphs) {
    const normalized = paragraph.toLowerCase().replace(/[^а-яёa-z0-9]/g, "");
    if (normalized.length < 100) continue;
    const fingerprint = normalized.slice(0, 150);
    if (seen.has(fingerprint)) { issues.push("repeated_paragraph"); break; }
    seen.add(fingerprint);
  }
  if (/^(?:финал|мораль|вывод|урок истории)\s*:/im.test(fullStory)) issues.push("explicit_moralizing");
  if (moral.length > 240) issues.push("oversized_moral");
  return { ok: issues.length === 0, issues, chars: fullStory.length, paragraphs: paragraphs.length };
}

function readResponseText(data) {
  if (!data || data.status === "incomplete" || data.status === "failed") return "";
  const chunks = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

function compactGuidance(source, keys) {
  const out = {};
  for (const key of keys) {
    const v = source && source[key];
    if (typeof v === "string" || typeof v === "number") out[key] = String(v).slice(0, 220);
  }
  return out;
}

async function generateLongformDraft(options = {}) {
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) return { ok: false, code: "story_text_api_key_missing" };
  const model = String(options.model || "gpt-6.1-sol").trim();
  const sourceSignals = (options.researchSignals || []).slice(0, 4).map((signal) => ({
    theme: String(signal.category || signal.main_theme || signal.emotional_angle || "").slice(0, 130),
    emotion: String(signal.emotion || "").slice(0, 90),
    conflict: String(signal.conflict_type || "").slice(0, 90)
  }));
  const instructions = [
    "Ты — литературный автор и редактор оригинальных русскоязычных жизненных историй для сайта.",
    "Создай ОДНУ действительно новую художественную историю, а не пересказ, замену имён или шаблон.",
    "Объём полного текста строго 8000–20000 символов с пробелами. Не сокращай сюжет до аннотации.",
    "Структура: HOOK → CHARACTER → SITUATION → CONFLICT → ESCALATION → EMOTIONAL DEVELOPMENT → TURN → PAYOFF → ENDING.",
    "Начни с конкретной сцены и выразительной первой строки. Персонажи должны иметь разные голоса, мотивы и противоречия.",
    "Покажи поступки и последствия, а не повторяй объяснения эмоций. Развивай конфликт причинно-следственно.",
    "Добавь один заслуженный поворот, который переосмысляет предыдущее, но не нарушает правдоподобия.",
    "Не используй готовые истории, материалы конкурентов, чужие цитаты или узнаваемые сюжеты. Источники — только общие тематические сигналы.",
    "Избегай навязчивой морали, клише, одинаковых семейных тайн, совпадений ради поворота, повторов и искусственного растягивания.",
    "Эмоциональный финал должен следовать из решений героя. Не добавляй мета-комментариев про качество текста.",
    "Верни только JSON-объект: title (заголовок), full_story (весь текст по абзацам), moral (необязательная короткая мысль).",
    "Язык всех трёх полей — русский. Не пиши markdown-ограждений вокруг JSON."
  ].join("\n");
  const assignment = {
    category: String(options.category || "family").slice(0, 80),
    emotion: String(options.emotion || "сложные человеческие отношения").slice(0, 120),
    narrative_variation: String(options.diversity && options.diversity.frame_id || "original").slice(0, 80),
    unique_seed: String(options.seed || "").slice(0, 100),
    story_dna_signals: sourceSignals,
    style_brain: compactGuidance(options.styleGuidance, ["opening_style", "dialogue_density", "paragraph_rhythm"]),
    emotion_engine: compactGuidance(options.emotionGuidance, ["rhythm", "peak_position", "ending_emotion"]),
    originality_rule: "Develop an independent situation and resolution, not a rewrite of research materials."
  };
  let response;
  try {
    const request = {
      model,
      instructions,
      input: JSON.stringify(assignment),
      text: { format: { type: "json_object" } },
      max_output_tokens: 14000,
      store: false
    };
    const doFetch = options.fetchImpl || fetch;
    response = await doFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(27000)
    });
  } catch (error) {
    return { ok: false, code: "story_text_transport_error" };
  }
  if (!response.ok) return { ok: false, code: "story_text_provider_http_" + response.status };
  let body;
  try { body = await response.json(); } catch { return { ok: false, code: "story_text_invalid_provider_response" }; }
  let parsed;
  try { parsed = JSON.parse(readResponseText(body)); }
  catch { return { ok: false, code: "story_text_invalid_json" }; }
  const quality = validateLongformDraft(parsed);
  if (!quality.ok) return { ok: false, code: "story_text_quality_gate_failed", issues: quality.issues, chars: quality.chars };
  const fullStory = parsed.full_story.trim();
  const firstParagraph = fullStory.split(/\n\s*\n/)[0];
  return {
    ok: true,
    draft: {
      title: parsed.title.trim(),
      hook: firstParagraph.slice(0, 420),
      full_story: fullStory,
      moral: String(parsed.moral || "").trim(),
      target_length: "8000–20000 characters",
      keyword_note: "",
      emotion: String(options.emotion || "")
    },
    quality,
    provider: "openai_responses",
    model
  };
}

module.exports = { MIN_CHARS, MAX_CHARS, validateLongformDraft, readResponseText, generateLongformDraft };