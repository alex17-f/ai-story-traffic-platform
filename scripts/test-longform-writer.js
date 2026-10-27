"use strict";
const assert = require("node:assert/strict");
const { validateLongformDraft, readResponseText, generateLongformDraft } = require("../lib/longform-writer");

function goodStory() {
  // Fictional, synthetic fixtures; no real or copyrighted text.
  const paragraphs = [];
  for (let i = 0; i < 26; i += 1) {
    paragraphs.push(
      "Сцена " + (i + 1) + ". Вечером Мария вернулась в дом и увидела на столе старую тетрадь. " +
      "Она вспомнила разговор с братом, после которого оба перестали приезжать к матери. " +
      "Теперь ей предстояло разобраться, что было решено без неё, и услышать ответ, которого прежде боялась. " +
      "Соседка рассказала о том, как менялись планы, пока Мария пыталась сохранить работу и помочь семье. " +
      "На этот раз героиня решила задать конкретный вопрос и не подменять ответ собственной догадкой."
    );
  }
  return { title: "Мария вернулась в старый дом, чтобы закончить давний разговор", full_story: paragraphs.join("\n\n"), moral: "" };
}

async function main() {
  const good = goodStory();
  const pass = validateLongformDraft(good);
  assert.equal(pass.ok, true, JSON.stringify(pass));
  assert.equal(validateLongformDraft({ ...good, full_story: "Короткий шаблон." }).ok, false);
  assert.equal(validateLongformDraft({ ...good, full_story: "A".repeat(9000) }).ok, false);
  assert.equal(validateLongformDraft({ ...good, full_story: good.full_story.split("\n\n")[0].repeat(40) }).ok, false);
  assert.equal(readResponseText({ status: "incomplete", output: [] }), "");
  const body = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(good) }] }] };
  let requests = 0;
  const fakeFetch = async (url, init) => {
    requests += 1;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.method, "POST");
    const sent = JSON.parse(init.body);
    assert.equal(sent.store, false);
    assert.equal(sent.text.format.type, "json_object");
    assert.ok(sent.instructions.includes("8000"));
    return { ok: true, json: async () => body };
  };
  const missingKey = await generateLongformDraft({ fetchImpl: fakeFetch });
  assert.equal(missingKey.code, "story_text_api_key_missing");
  assert.equal(requests, 0);
  const result = await generateLongformDraft({ apiKey: "fake-test-key", model: "test-model", emotion: "сочувствие", fetchImpl: fakeFetch });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.draft.full_story, good.full_story);
  assert.equal(result.provider, "openai_responses");
  assert.equal(requests, 1);
  const short = await generateLongformDraft({ apiKey: "fake-test-key", fetchImpl: async () => ({
    ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ ...good, full_story: "Коротко." }) }] }] })
  }) });
  assert.equal(short.code, "story_text_quality_gate_failed");
  console.log("Longform writer: mock tests passed; no real API requests made.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });