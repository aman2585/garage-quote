// Fails the build if any AI SDK, AI provider or AI API key appears in this app.
// Runs automatically before every `npm run build` (the "prebuild" script).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BANNED = [
  "openai", "anthropic", "@ai-sdk", "ai-sdk", "gemini", "generative-ai", "generativeai",
  "cohere", "mistral", "groq", "langchain", "llamaindex", "ollama", "replicate", "huggingface",
  "together-ai", "perplexity", "deepseek", "bedrock", "vertexai",
];
const pattern = new RegExp(`(${BANNED.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}@]/g, "\\$&")).join("|")})`, "i");
const SELF = relative(ROOT, new URL(import.meta.url).pathname);
const SCAN_DIRS = ["app", "lib", "scripts", "public"];
const SCAN_FILES = ["package.json", "package-lock.json", "next.config.ts", ".env", ".env.local", ".env.production"];

const hits = [];

function scanFile(path) {
  const rel = relative(ROOT, path);
  if (rel === SELF) return;
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return; }
  text.split("\n").forEach((line, i) => {
    const m = line.match(pattern);
    if (m) hits.push(`${rel}:${i + 1}: "${m[1]}"`);
  });
}

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else scanFile(p);
  }
}

SCAN_DIRS.forEach((d) => walk(join(ROOT, d)));
SCAN_FILES.forEach((f) => scanFile(join(ROOT, f)));

// Environment: no AI provider keys, and nothing beyond the variables this app needs.
for (const key of Object.keys(process.env)) {
  if (pattern.test(key) || /(^|_)(OPENAI|ANTHROPIC|GEMINI|CLAUDE|GPT|LLM)(_|$)/i.test(key)) hits.push(`env: ${key}`);
}

if (hits.length) {
  console.error("No-AI check FAILED. Found:\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log("No-AI check passed: no AI SDKs, providers or keys found.");
