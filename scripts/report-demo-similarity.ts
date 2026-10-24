/**
 * Print the current pairwise similarity report for DEMO profiles already in Supabase.
 * This does not call Ollama or rewrite any rows; it only reads stored vectors.
 * Run with: npx tsx scripts/report-demo-similarity.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPool } from "../lib/db";
import { printDemoSimilarityReport } from "./demo-similarity-report";

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const pool = getPool();
  try {
    await printDemoSimilarityReport(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Could not report demo-author similarity:", error instanceof Error ? error.message : error);
  console.error("Check DATABASE_URL, schema migrations 003/004 and that demo profiles have current vectors.");
  process.exitCode = 1;
});
