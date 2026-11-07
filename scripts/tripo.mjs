#!/usr/bin/env node
// GearForge Tripo API (v3) CLI — アップロード→生成→ポーリング→保存→登録までを1コマンドで行う。
// エージェントは最後の数行だけ読めばよい（途中経過は出さない）。
//   node scripts/tripo.mjs balance
//   node scripts/tripo.mjs generate <name> [--count 2] [--low-poly] [--face-limit N] [--no-texture] [--dry-run] [--yes]
//   node scripts/tripo.mjs resume <name> <id>=<taskId> [<id>=<taskId> ...]   生成済みタスクから保存だけやり直す
// 環境変数: TRIPO_API_KEY（必須） TRIPO_API_BASE TRIPO_MODEL（既定 v3.1-20260211） TRIPO_CREDITS_PER_MODEL（見積もり用、既定55）
// 仕様: https://developers.tripo3d.ai/en/docs （POST /files, POST /generation/image-to-model, GET /tasks/{id}, GET /account/balance）
// 上限: 見積もり合計120クレジットを超える生成は --yes が無いと実行しない。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/project.mjs");
const BASE = (process.env.TRIPO_API_BASE || "https://openapi.tripo3d.ai/v3").replace(/\/$/, "");
const MODEL = process.env.TRIPO_MODEL || "v3.1-20260211";
const PER_MODEL = Number(process.env.TRIPO_CREDITS_PER_MODEL || 55);
const CAP = 120, POLL_MS = 5000, TIMEOUT_MS = 15 * 60 * 1000;
const TERMINAL_FAIL = ["failed", "cancelled", "banned", "expired"];

const argv = process.argv.slice(2);
const VALUED = ["--count", "--face-limit"];
const flags = new Set(argv.filter(a => a.startsWith("--")));
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && VALUED.includes(argv[i - 1])));
const [cmd, name, ...rest] = pos;

function die(m) { console.error("error: " + m); process.exit(1); }
const project = (...a) => execFileSync(process.execPath, [CLI, ...a], { encoding: "utf8" }).trim();
const projDir = n => path.join(ROOT, "projects", n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function key() {
  const k = process.env.TRIPO_API_KEY;
  if (!k) die("TRIPO_API_KEY が未設定。ユーザーに環境変数で設定してもらう（チャットで聞かない）。通常は Tripo Studio 経路（skills/tripo-gear-generate/SKILL.md）を使う");
  return k;
}
async function api(method, p, body) {
  const init = { method, headers: { Authorization: `Bearer ${key()}` } };
  if (body instanceof FormData) init.body = body;
  else if (body) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const res = await fetch(BASE + p, init);
  const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch {}
  if (!res.ok || !j || j.code !== 0) die(`Tripo API ${method} ${p} → HTTP ${res.status} code=${j?.code ?? "-"} ${(j?.message || text).slice(0, 200)}`);
  return j.data;
}
const balance = async () => Number((await api("GET", "/account/balance")).balance ?? 0);

async function upload(file) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(file)], { type: /\.png$/i.test(file) ? "image/png" : "image/jpeg" }), path.basename(file));
  return (await api("POST", "/files", fd)).file_token || die("upload: file_token が返らない");
}
async function poll(taskId) {
  const t0 = Date.now();
  for (;;) {
    const d = await api("GET", `/tasks/${taskId}`);
    if (d.status === "success") return d;
    if (TERMINAL_FAIL.includes(d.status)) die(`task ${taskId} ${d.status} ${d.error_code ?? ""} ${d.error_message ?? ""}`);
    if (Date.now() - t0 > TIMEOUT_MS) die(`task ${taskId} timeout（生成し直さない: node scripts/tripo.mjs resume ${name} <id>=${taskId}）`);
    await sleep(POLL_MS);
  }
}
async function download(url, dest) {
  const res = await fetch(url); if (!res.ok) die(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(dest, buf); return buf;
}
// タスク完了を待ち、GLBとプレビューを保存して add-model まで行う
async function save(n, id, taskId) {
  const d = await poll(taskId), o = d.output || {};
  const glbUrl = o.model_url || o.pbr_model_url || o.base_model_url;
  if (!glbUrl) die(`task ${taskId}: output に model_url が無い（keys: ${Object.keys(o).join(",")}）`);
  const glbRel = `models/${id}.glb`, buf = await download(glbUrl, path.join(projDir(n), glbRel));
  if (buf.subarray(0, 4).toString() !== "glTF") die(`${glbRel}: GLBではない（${buf.length} bytes）`);
  let prevRel = "";
  if (o.rendered_image_url) {
    const ext = (new URL(o.rendered_image_url).pathname.match(/\.(png|webp|jpe?g)$/i)?.[1] || "webp").toLowerCase();
    prevRel = `models/${id}.${ext}`; await download(o.rendered_image_url, path.join(projDir(n), prevRel));
  }
  project("add-model", n, id, glbRel, prevRel, "tripo-api", taskId);
  const credits = Number(d.credits_consumed);
  return { line: `${id} ${glbRel} ${(buf.length / 1048576).toFixed(1)}MB task=${taskId} credits=${Number.isFinite(credits) ? credits : "?"}`, credits };
}
const sum = rs => { const v = rs.reduce((a, r) => a + r.credits, 0); return Number.isFinite(v) ? v : "?"; };

switch (cmd) {
  case "balance": console.log(`balance=${await balance()}`); break;

  case "generate": {
    if (!name) die("name required");
    const p = JSON.parse(project("get", name));
    const c = p.concepts.find(x => x.id === p.selectedConcept); if (!c) die("意匠が未選択（selectedConcept なし）");
    const count = Math.max(1, Number(opt("--count", 2)) || 2), est = count * PER_MODEL;
    const used = new Set(p.models.map(m => m.id)), ids = [];
    for (let i = 1; ids.length < count; i++) if (!used.has(`m${i}`)) ids.push(`m${i}`);
    const plan = `plan: ${count}本 (${ids.join(",")}) 約${est}クレジット model=${MODEL} 入力=${c.path}`;
    if (flags.has("--dry-run")) { console.log(plan + " [dry-run]"); break; }
    if (est > CAP && !flags.has("--yes")) die(`${plan} は上限${CAP}を超える。ユーザーの了承を得てから --yes を付ける`);
    const before = await balance();
    if (before < est) die(`残高${before} < 見積もり${est}`);
    const body = { input: await upload(path.join(projDir(name), c.path)), model: MODEL, texture: !flags.has("--no-texture"), pbr: !flags.has("--no-texture") };
    if (flags.has("--low-poly")) body.smart_low_poly = true;
    if (opt("--face-limit")) body.face_limit = Number(opt("--face-limit"));
    const tasks = [];
    for (const id of ids) tasks.push([id, (await api("POST", "/generation/image-to-model", { ...body, model_seed: Math.floor(Math.random() * 1e9) })).task_id]);
    project("log", name, `tripo-api 生成開始 ${tasks.map(([i, t]) => `${i}=${t}`).join(" ")}`); // 切れても resume で戻れる
    const res = [];
    for (const [id, t] of tasks) res.push(await save(name, id, t));
    const after = await balance().catch(() => "?");
    project("done", name, "model", `Tripo候補${tasks.length}本生成（経路: api, model=${MODEL}, 消費${sum(res)}クレジット）`);
    console.log([...res.map(r => r.line), `ok stage=model credits_used=${sum(res)} balance=${after}`].join("\n"));
    break;
  }

  case "resume": {
    if (!name || !rest.length) die("usage: resume <name> <id>=<taskId> ...");
    const res = [];
    for (const pair of rest) { const [id, t] = pair.split("="); if (!id || !t) die("bad pair: " + pair); res.push(await save(name, id, t)); }
    project("done", name, "model", `Tripo候補を再取得: ${rest.join(" ")}`);
    console.log([...res.map(r => r.line), `ok stage=model credits_used=${sum(res)}`].join("\n"));
    break;
  }

  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).join("\n"));
}
