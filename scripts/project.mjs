#!/usr/bin/env node
// GearForge プロジェクトCLI — エージェントは project.gearforge をこのCLI経由でだけ更新する。
// エージェント向け（出力は数行）:
//   node scripts/project.mjs next <name>                 工程・不足入力・読むSkill・やること
//   node scripts/project.mjs summary <name>              件数と直近ログ5行
//   node scripts/project.mjs apply <name> <file.json|->  JSONを一括マージ（配列は置き換え）
//   node scripts/project.mjs done <name> <stage> <message>  stage を進めてログを1行残す
// 個別操作:
//   node scripts/project.mjs init <name>
//   node scripts/project.mjs get <name> [dot.path]       （log は含まない。log は log.jsonl）
//   node scripts/project.mjs set <name> <dot.path> <value|json>
//   node scripts/project.mjs stage <name> <reference|prompt|concept|model|export>
//   node scripts/project.mjs add-concept <name> <id> <relpath> [promptText]
//   node scripts/project.mjs add-model <name> <id> <relpath> [previewRelpath] [source] [taskId]
//   node scripts/project.mjs select <name> <concept|model> <id>
//   node scripts/project.mjs log <name> <message> [agent|user]
//   node scripts/project.mjs list | list-trash | trash <name> | restore <name>
// アプリ用: app-get <name>（log の直近30件を付けて返す）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as world from "./world.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = path.join(ROOT, "projects");
const STAGES = ["reference", "prompt", "concept", "model", "export"];
const FIELDS = ["type", "shape", "material", "ornament", "mood", "state"];
const CREDIT_CAP = 120;

const [cmd, name, ...rest] = process.argv.slice(2);

function dir(n) {
  if (!n || !/^[a-zA-Z0-9_-]+$/.test(n) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(n)) die("invalid project name");
  const target = path.resolve(PROJECTS, n);
  if (path.dirname(target) !== PROJECTS) die("invalid project path");
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) die("linked project directory is not supported");
  return target;
}
function trashFile(n) {
  const target = path.join(dir(n), "_trash");
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) die("linked trash directory is not supported");
  return path.join(target, "project.gearforge");
}
function file(n) {
  return path.join(dir(n), "project.gearforge");
}
const logFile = n => path.join(dir(n), "log.jsonl");
function load(n) {
  const f = file(n);
  if (!fs.existsSync(f)) die(`project not found: ${n} (run: init ${n})`);
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  if (Array.isArray(p.log)) { // v1 → ログを log.jsonl に分離
    if (p.log.length) fs.appendFileSync(logFile(n), p.log.map(l => JSON.stringify(l)).join("\n") + "\n");
    delete p.log; p.version = 2; save(n, p);
  }
  return p;
}
function save(n, p) {
  const tmp = file(n) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2) + "\n");
  fs.renameSync(tmp, file(n));
}
function die(m) { console.error("error: " + m); process.exit(1); }
function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split("."); let cur = o;
  for (const k of ks.slice(0, -1)) { if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; }
  cur[ks[ks.length - 1]] = v;
}
function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) merge(dst[k], v);
    else dst[k] = v;
  }
}
function parseVal(s) { try { return JSON.parse(s); } catch { return s; } }
function addLog(n, msg, who = "agent") { fs.appendFileSync(logFile(n), JSON.stringify({ ts: new Date().toISOString(), who, msg }) + "\n"); }
function readLog(n, last) {
  if (!fs.existsSync(logFile(n))) return [];
  const lines = fs.readFileSync(logFile(n), "utf8").split("\n").filter(Boolean);
  return lines.slice(-last).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const clip = (s, n = 60) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };

function blank(n) {
  return {
    version: 2, name: n, stage: "reference",
    reference: { mode: "image", images: [], preset: { category: "weapon", type: "", era: "fantasy", taste: "" }, wish: "", world: "" },
    prompt: { type: "", shape: "", material: "", ornament: "", mood: "", state: "", notes: "", english: "", approved: false },
    concepts: [], selectedConcept: null,
    models: [], selectedModel: null,
    export: { outputs: [] },
  };
}

// プリセットに必要なカタログの該当行だけを返す（catalog.json 全体を読ませない）
function catalogSlice(preset) {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, "public/catalog.json"), "utf8"));
  const cat = c.categories.find(x => x.id === preset.category), era = c.eras.find(x => x.id === preset.era), taste = c.tastes.find(x => x.label === preset.taste);
  const out = [`preset: ${cat?.label ?? preset.category} / ${preset.type || "(種別未選択)"} / ${era?.label ?? preset.era} / ${preset.taste || "(テイスト未選択)"}`];
  if (era) out.push(`era.hint: ${era.hint}`);
  if (taste) out.push(`taste: mood=${taste.mood} / material=${taste.material}`);
  if (cat?.note) out.push(`category.note: ${cat.note}`);
  return out;
}

// 世界設定（world.json）。未設定なら null、壊れていれば { errors }
function loadWorld(p) {
  const rel = p.reference?.world; if (!rel) return null;
  const f = path.resolve(ROOT, rel);
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f)) return { errors: [`world が見つからない: ${rel}`] };
  let w; try { w = world.loadWorld(f); } catch (e) { return { errors: [`world の JSON が読めない: ${e.message}`] }; }
  const c = world.loadCatalog(path.join(ROOT, "public/catalog.json")), errors = world.validate(w, c);
  return errors.length ? { errors } : { w, c };
}

function next(n, p) {
  const L = [`project=${n} stage=${p.stage}`], skill = s => L.push(`skill: skills/${s}/SKILL.md`);
  const wait = m => { L.push(`wait: ${m}`); return L; };
  const W = loadWorld(p);
  if (W?.errors && ["reference", "prompt"].includes(p.stage)) return wait(`世界設定が不正（node scripts/world.mjs validate ${p.reference.world}）: ${W.errors.join(" / ")}`);
  switch (p.stage) {
    case "reference": {
      const r = p.reference, mode = r.mode || (r.images.length ? "image" : "text");
      L.push(`mode=${mode}` + (r.wish ? ` wish="${r.wish}"` : ""));
      if (W?.w) L.push(...world.brief(W.w, W.c));
      if (mode === "image") { if (!r.images.length) return wait("参考画像が0枚。アプリで登録してもらう"); L.push(`images: ${r.images.slice(0, 3).map(i => i.path).join(" ")}` + (r.images.length > 3 ? ` (+${r.images.length - 3}枚は見ない)` : "")); }
      if (mode === "preset") L.push(...catalogSlice(r.preset));
      if (mode === "text" && !r.wish) return wait("一言の希望が空。アプリの補足欄に書いてもらう");
      skill("gear-prompt-decompose");
      L.push("do: 6項目に分解 → apply → done prompt");
      break;
    }
    case "prompt": {
      if (!p.prompt.approved) return wait("プロンプト未承認。アプリで承認してもらう");
      for (const k of [...FIELDS, "notes"]) if (p.prompt[k]) L.push(`${k}: ${p.prompt[k]}`);
      if (W?.w) L.push(`styleLock: ${world.styleLock(W.w, W.c, "gear")}`);
      skill("gear-concept-image");
      L.push("do: 英語化して apply → 概念画像4案 → add-concept ×4 → done concept");
      break;
    }
    case "concept": {
      const c = p.concepts.find(x => x.id === p.selectedConcept);
      if (!c) return wait("意匠が未選択。アプリで1枚選んでもらう");
      L.push(`selected: ${c.id} ${c.path}`);
      skill("tripo-gear-generate");
      L.push(`do: Tripo Studio で2本（上限${CREDIT_CAP}クレジット）→ collect.mjs start / <id> / finish`);
      break;
    }
    case "model": {
      const m = p.models.find(x => x.id === p.selectedModel);
      if (!m) return wait("3D候補が未選択。アプリで選んでもらう");
      L.push(`selected: ${m.id} ${m.path}`);
      skill("gear-export");
      L.push(`do: node scripts/export.mjs ${n} [glb,fbx,stl] → 成功なら自動で stage=export`);
      break;
    }
    case "export":
      L.push(`outputs: ${p.export.outputs.join(" ") || "(なし)"}`);
      L.push("do: なし（完成）。ユーザーにアプリの⑤から保存できると伝える");
  }
  return L;
}

function stageTo(n, p, s) { if (!STAGES.includes(s)) die("stage must be one of " + STAGES.join("|")); p.stage = s; }

switch (cmd) {
  case "init": {
    if (!name) die("name required");
    if (fs.existsSync(file(name)) || fs.existsSync(trashFile(name))) die("already exists (restore from trash if deleted)");
    for (const d of ["inputs", "concepts", "models", "exports", "_trash"]) fs.mkdirSync(path.join(dir(name), d), { recursive: true });
    save(name, blank(name)); addLog(name, "project created");
    console.log(file(name)); break;
  }
  case "list": {
    if (!fs.existsSync(PROJECTS)) { console.log("[]"); break; }
    const out = fs.readdirSync(PROJECTS).filter(n => /^[a-zA-Z0-9_-]+$/.test(n) && fs.existsSync(file(n))).map(n => ({ name: n, stage: load(n).stage }));
    console.log(JSON.stringify(out)); break;
  }
  case "list-trash": {
    const out = fs.existsSync(PROJECTS) ? fs.readdirSync(PROJECTS).filter(n => /^[a-zA-Z0-9_-]+$/.test(n) && fs.existsSync(trashFile(n))).map(n => ({ name: n })) : [];
    console.log(JSON.stringify(out)); break;
  }
  case "trash": {
    load(name); const target = trashFile(name);
    if (fs.existsSync(target)) die("trash entry already exists");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    addLog(name, "project moved to trash; assets retained", "user");
    fs.renameSync(file(name), target);
    console.log("ok"); break;
  }
  case "restore": {
    const source = trashFile(name);
    if (!fs.existsSync(source)) die("trash entry not found");
    if (fs.existsSync(file(name))) die("active project already exists");
    fs.renameSync(source, file(name)); load(name);
    addLog(name, "project restored from trash", "user");
    console.log("ok"); break;
  }
  case "next": console.log(next(name, load(name)).join("\n")); break;
  case "summary": {
    const p = load(name);
    console.log([
      `project=${name} stage=${p.stage} approved=${p.prompt.approved}`,
      `refs=${p.reference.images.length} concepts=${p.concepts.length} selectedConcept=${p.selectedConcept ?? "-"} models=${p.models.length} selectedModel=${p.selectedModel ?? "-"} outputs=${p.export.outputs.length}`,
      ...readLog(name, 5).map(l => `${l.ts.slice(5, 16)} [${l.who}] ${clip(l.msg, 80)}`),
    ].join("\n")); break;
  }
  case "apply": {
    const p = load(name), src = rest[0]; if (!src) die("file.json or - required");
    const patch = JSON.parse(src === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(src), "utf8"));
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) die("patch must be a JSON object");
    for (const k of ["name", "version", "log"]) if (k in patch) die(`cannot apply key: ${k}`);
    if ("stage" in patch) stageTo(name, p, patch.stage), delete patch.stage;
    merge(p, patch); save(name, p);
    addLog(name, `apply: ${Object.keys(patch).join(",")}`);
    console.log("ok"); break;
  }
  case "done": {
    const p = load(name), [s, ...m] = rest; stageTo(name, p, s); save(name, p);
    addLog(name, m.join(" ") || `stage -> ${s}`);
    console.log(`ok stage=${s}`); break;
  }
  case "get": {
    const p = load(name); const v = rest[0] ? getPath(p, rest[0]) : p;
    console.log(typeof v === "string" ? v : JSON.stringify(v, null, rest[0] ? 0 : 2)); break;
  }
  case "app-get": {
    const p = load(name); p.log = readLog(name, 30);
    console.log(JSON.stringify(p)); break;
  }
  case "set": {
    const p = load(name); const [k, ...vs] = rest; if (!k) die("path required");
    if (k === "log" || k.startsWith("log.")) die("log is append-only: use the log command");
    setPath(p, k, parseVal(vs.join(" "))); save(name, p); console.log("ok"); break;
  }
  case "stage": {
    const p = load(name); stageTo(name, p, rest[0]); save(name, p); addLog(name, `stage -> ${rest[0]}`); console.log("ok"); break;
  }
  case "add-concept": {
    const p = load(name); const [id, rel, ...pt] = rest; if (!id || !rel) die("id and relpath required");
    if (!fs.existsSync(path.join(dir(name), rel))) die("file not found: " + rel);
    p.concepts = p.concepts.filter(c => c.id !== id); p.concepts.push({ id, path: rel, prompt: pt.join(" ") });
    save(name, p); console.log("ok"); break;
  }
  case "add-model": {
    const p = load(name); const [id, rel, preview = "", source = "tripo-studio", taskId = ""] = rest; if (!id || !rel) die("id and relpath required");
    if (!fs.existsSync(path.join(dir(name), rel))) die("file not found: " + rel);
    p.models = p.models.filter(m => m.id !== id); p.models.push({ id, path: rel, preview, source, taskId });
    save(name, p); console.log("ok"); break;
  }
  case "select": {
    const p = load(name); const [kind, id] = rest;
    if (kind === "concept") { if (!p.concepts.some(c => c.id === id)) die("no such concept"); p.selectedConcept = id; }
    else if (kind === "model") { if (!p.models.some(m => m.id === id)) die("no such model"); p.selectedModel = id; }
    else die("kind must be concept|model");
    save(name, p); addLog(name, `selected ${kind}: ${id}`, "user"); console.log("ok"); break;
  }
  case "log": {
    load(name); const who = ["agent", "user"].includes(rest[rest.length - 1]) ? rest.pop() : "agent";
    addLog(name, rest.join(" "), who); console.log("ok"); break;
  }
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).join("\n"));
}
