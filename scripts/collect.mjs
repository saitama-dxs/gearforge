#!/usr/bin/env node
// GearForge Studio経路の回収CLI — ブラウザで落としたGLBをダウンロードフォルダから拾って登録する。
// エージェントはダウンロードイベントや画面を見張らず、このコマンドの1行だけ読む。
//   node scripts/collect.mjs <name> start <id>=<taskId> [...]   生成開始を記録（taskIdをログ、開始時刻を保存）
//   node scripts/collect.mjs <name> <id> [--wait 120]            開始時刻以降の新しい .glb を models/<id>.glb へ移して登録
//   node scripts/collect.mjs <name> finish                        回収済み本数を書いて stage=model に進める
// ダウンロードフォルダは環境変数 GEARFORGE_DOWNLOADS（既定 ~/Downloads）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/project.mjs");
const DL = process.env.GEARFORGE_DOWNLOADS || path.join(os.homedir(), "Downloads");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [name, sub, ...rest] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--wait");
const project = (...a) => execFileSync(process.execPath, [CLI, ...a], { encoding: "utf8" }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function die(m) { console.error("error: " + m); process.exit(1); }
if (!name || !sub) die("usage: collect.mjs <name> start <id>=<taskId>... | <id> | finish");

const p = JSON.parse(project("get", name));
const dir = path.join(ROOT, "projects", name);

if (sub === "start") {
  const pairs = rest.filter(x => /^[\w-]+=.+$/.test(x)); if (!pairs.length) die("start には <id>=<taskId> が必要");
  const studio = { startedAt: new Date().toISOString(), tasks: Object.fromEntries(pairs.map(x => x.split("="))), used: p.studio?.used || [] };
  project("set", name, "studio", JSON.stringify(studio));
  project("log", name, `studio 生成開始 ${pairs.join(" ")}`);
  console.log(`ok started ${pairs.length} (downloads=${DL})`);
} else if (sub === "finish") {
  const n = p.models.filter(m => m.source === "tripo-studio").length;
  if (!n) die("回収済みのモデルが無い。GLB未取得のまま進めない");
  console.log(project("done", name, "model", `Tripo候補${n}本生成（経路: studio）`));
} else {
  const id = sub; if (!/^[\w-]+$/.test(id)) die("bad id");
  const since = Date.parse(p.studio?.startedAt || "") || Date.now() - 60 * 60 * 1000;
  const used = new Set(p.studio?.used || []), deadline = Date.now() + Number(opt("--wait", 120)) * 1000;
  let pick = null;
  for (;;) {
    const cands = fs.existsSync(DL) ? fs.readdirSync(DL).filter(f => /\.glb$/i.test(f) && !used.has(f))
      .map(f => ({ f, st: fs.statSync(path.join(DL, f)) })).filter(x => x.st.mtimeMs >= since).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs) : [];
    if (cands.length) { // サイズが落ち着く（書き込み完了）まで待つ
      const c = cands[0], s1 = c.st.size; await sleep(1500);
      if (fs.statSync(path.join(DL, c.f)).size === s1 && s1 > 0) { pick = c.f; break; }
    }
    if (Date.now() > deadline) die(`${DL} に開始後の新しい .glb が無い（ブラウザのダウンロード一覧を確認。生成し直さない）`);
    await sleep(2000);
  }
  const src = path.join(DL, pick), head = Buffer.alloc(4); const fd = fs.openSync(src, "r"); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
  if (head.toString() !== "glTF") die(`${pick} はGLBではない`);
  const rel = `models/${id}.glb`; fs.mkdirSync(path.join(dir, "models"), { recursive: true });
  fs.copyFileSync(src, path.join(dir, rel)); // ダウンロード元は消さない（studio.used で二重取りを防ぐ）
  project("set", name, "studio.used", JSON.stringify([...used, pick]));
  project("add-model", name, id, rel, "", "tripo-studio", p.studio?.tasks?.[id] || "");
  console.log(`ok ${id} ${rel} ${(fs.statSync(path.join(dir, rel)).size / 1048576).toFixed(1)}MB from ${pick}`);
}
