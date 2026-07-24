const { Pool } = require("pg");

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const schema = `rc1_backup_${stamp}`;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`create schema ${quoteIdentifier(schema)}`);
    const tables = (await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
    )).rows.map((row) => row.table_name);
    let rowsCopied = 0;
    for (const table of tables) {
      await client.query(
        `create table ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (like public.${quoteIdentifier(table)} including all)`
      );
      const result = await client.query(
        `insert into ${quoteIdentifier(schema)}.${quoteIdentifier(table)} select * from public.${quoteIdentifier(table)}`
      );
      rowsCopied += Number(result.rowCount || 0);
    }
    await client.query("commit");
    console.log(JSON.stringify({
      ok: true,
      restore_schema: schema,
      tables_copied: tables.length,
      rows_copied: rowsCopied
    }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
