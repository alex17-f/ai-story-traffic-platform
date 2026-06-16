const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || !clean.includes("=")) continue;
    const [key, ...valueParts] = clean.split("=");
    if (!process.env[key]) process.env[key] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
  }
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
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
  }
  await pool.end();
  console.log("Migrations complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
