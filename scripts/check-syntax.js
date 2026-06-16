const { spawnSync } = require("child_process");

const files = ["server.js", "public/admin.js", "api/index.js"];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("Syntax check passed.");
