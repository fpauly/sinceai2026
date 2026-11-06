// One-time setup for a teammate: `npm run setup` (runs npm install first).
// Asks for your lane, writes .env.local, gets a MongoDB running, tests the connection,
// checks the GitHub CLI and tells you what to do next. Safe to run again.

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, def = "") => {
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  return a || def;
};
const sh = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim() };
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? e.message).trim() };
  }
};
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

// ---------- .env.local helpers ----------
const ENV = ".env.local";
function readEnv() {
  return existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
}
function getVar(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
}
function setVar(text, key, value) {
  const line = `${key}=${value}`;
  return new RegExp(`^${key}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${text.trimEnd()}\n${line}\n`;
}

async function main() {
  console.log("\nAjantasa setup\n");

  // Node version
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    console.log(`Node ${process.versions.node} is too old. Install Node 20 or newer (24 recommended) and run again.`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);

  // .env.local
  if (!existsSync(ENV)) {
    copyFileSync(".env.example", ENV);
    ok("created .env.local from .env.example");
  } else {
    ok(".env.local exists (keeping your values)");
  }
  let env = readEnv();

  // Lane
  const argLane = (argv[2] ?? "").toUpperCase();
  let lane = ["A", "B", "C", "D"].includes(argLane) ? argLane : getVar(env, "AJANTASA_LANE").toUpperCase();
  while (!["A", "B", "C", "D"].includes(lane)) {
    lane = (await ask("Your lane? A = AI, B = voice/integration, C = detection/dashboard, D = owner view")).toUpperCase();
  }
  env = setVar(env, "AJANTASA_LANE", lane);
  const db = getVar(env, "MONGODB_DB");
  if (!db || db === "ajantasa_X" || db === "ajantasa") env = setVar(env, "MONGODB_DB", `ajantasa_${lane.toLowerCase()}`);
  ok(`lane ${lane}, database ${getVar(env, "MONGODB_DB")}`);

  // MongoDB URI
  let uri = getVar(env, "MONGODB_URI");
  const answer = await ask(
    "MongoDB URI (paste the Atlas URI from the team chat, or press Enter for local Docker)",
    uri.startsWith("mongodb+srv://") ? "keep current Atlas URI" : "",
  );
  if (answer && answer !== "keep current Atlas URI") uri = answer;
  if (!answer) {
    uri = "mongodb://localhost:27017";
    const docker = sh("docker --version");
    if (!docker.ok) {
      warn("Docker not found. Install Docker, or ask lane B for the Atlas URI and run `npm run setup` again.");
    } else {
      const exists = sh("docker ps -a --filter name=^ajantasa-mongo$ --format {{.Names}}");
      const r = exists.out === "ajantasa-mongo"
        ? sh("docker start ajantasa-mongo")
        : sh("docker run -d --name ajantasa-mongo -p 27017:27017 mongo:7");
      if (r.ok) ok("local MongoDB running in Docker (ajantasa-mongo)");
      else warn(`Docker MongoDB failed: ${r.out.split("\n")[0]}`);
    }
  }
  env = setVar(env, "MONGODB_URI", uri);

  // API keys (only lanes that need them)
  if ((lane === "A" || lane === "B") && !getVar(env, "GEMINI_API_KEY")) {
    const k = await ask("Gemini API key from https://aistudio.google.com/apikey (Enter to skip for now)");
    if (k) env = setVar(env, "GEMINI_API_KEY", k);
  }
  if (lane === "B" && !getVar(env, "ELEVENLABS_API_KEY")) {
    const k = await ask("ElevenLabs API key (Enter to skip for now)");
    if (k) env = setVar(env, "ELEVENLABS_API_KEY", k);
  }
  writeFileSync(ENV, env);
  ok("saved .env.local (never commit it)");

  // Test DB connection
  try {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
    await client.connect();
    await client.db(getVar(env, "MONGODB_DB")).command({ ping: 1 });
    await client.close();
    ok("MongoDB connection works");
  } catch (e) {
    warn(`cannot connect to MongoDB: ${e.message.split("\n")[0]}`);
    warn("Atlas: check the URI and that Network Access allows your IP. Docker: wait a few seconds and run setup again.");
  }

  // Git hooks + GitHub CLI
  sh("git config core.hooksPath .githooks");
  ok("git pre-push checks enabled");
  const gh = sh("gh auth status");
  if (gh.ok) ok("GitHub CLI logged in");
  else warn("GitHub CLI missing or not logged in. Install it (https://cli.github.com) and run `gh auth login`. The AI needs it to open PRs.");

  console.log(`
Next:
  1. npm run dev        then open http://localhost:3000  (progress board)
  2. npm run smoke      (in a second terminal; should be green)
  3. Open your AI in this folder (Claude Code: \`claude\`, OpenCode: \`opencode\`) and type:  next
`);
  rl.close();
}

main();
