const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = source.indexOf("async function telegramStart");
const end = source.indexOf("let telegramOffset", start);

if (start < 0 || end < 0) {
  throw new Error("Telegram handler section was not found.");
}

const handlers = source.slice(start, end);
const forbidden = [
  "AI Page Analyzer",
  "Posts analyzed",
  "Best themes",
  "Best hooks",
  "Project Brain updated",
  "Audience Analyst",
  "Competitor Analyst",
  "AI Autopilot",
  "Data Layer:",
  "Story Generator",
  "Generated Images",
  "Approved draft",
  "Rejected draft",
  "Draft not found",
  "Nothing was published",
  "No Facebook posting",
  "No publishing",
  "No autopublishing",
  "JSON backup mode",
  "environment variables",
  "Project Brain v2",
  "Story DNA:",
  "Confidence score:",
  "Facebook imported:",
  "Generated imported:",
  "Research imported:",
  "Style Brain",
  "Human Emotion Engine",
  "Emotion Engine",
  "Hook strength:",
  "Boring risk:",
  "Best curve:",
  "Ideal peak:",
  "ready package",
  "Status: needs",
  "Editorial:",
  "Safety:",
  "Visual Quality:",
  "Readiness:"
];

const failures = forbidden.filter((phrase) => handlers.includes(phrase));
if (failures.length) {
  console.error(`Найдены непереведённые Telegram-фразы:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Telegram Russian audit passed (${forbidden.length} known phrases checked).`);
