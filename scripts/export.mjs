#!/usr/bin/env node
// GearForge 書き出しCLI — 選ばれた GLB を exports/ にコピーし、Blender（ヘッドレス）で FBX / STL に変換する。
//   node scripts/export.mjs <name> [glb,fbx,stl]     既定 glb,fbx
// Blender は環境変数 BLENDER → PATH → 既定のインストール先 の順に探す。無ければ GLB のみで完了する。
// 成功すると export.outputs を設定し stage=export に進める。出力は1〜2行。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/project.mjs");
const [name, fmtArg = "glb,fbx"] = process.argv.slice(2);
const project = (...a) => execFileSync(process.execPath, [CLI, ...a], { encoding: "utf8" }).trim();
function die(m) { console.error("error: " + m); process.exit(1); }

function findBlender() {
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const exe = process.platform === "win32" ? "blender.exe" : "blender";
  for (const d of (process.env.PATH || "").split(path.delimiter)) if (d && fs.existsSync(path.join(d, exe))) return path.join(d, exe);
  const roots = process.platform === "win32" ? [path.join(process.env.ProgramFiles || "C:\\Program Files", "Blender Foundation")]
    : process.platform === "darwin" ? ["/Applications"] : [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const hits = fs.readdirSync(r).filter(d => /blender/i.test(d)).sort().reverse()
      .map(d => process.platform === "darwin" ? path.join(r, d, "Contents/MacOS/Blender") : path.join(r, d, exe));
    const hit = hits.find(fs.existsSync); if (hit) return hit;
  }
  return null;
}

// Blender 側のスクリプト：GLB を読み、指定形式で書き出す（4.x / 5.x の STL 演算子差を吸収）
const PY = `
import bpy, sys
args = sys.argv[sys.argv.index("--") + 1:]
src, outs = args[0], args[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in outs:
    if o.endswith(".fbx"):
        bpy.ops.export_scene.fbx(filepath=o, path_mode="COPY", embed_textures=True)
    elif o.endswith(".stl"):
        if hasattr(bpy.ops.wm, "stl_export"): bpy.ops.wm.stl_export(filepath=o)
        else: bpy.ops.export_mesh.stl(filepath=o)
    print("GF_OK " + o)
`;

if (!name) die("usage: export.mjs <name> [glb,fbx,stl]");
const p = JSON.parse(project("get", name));
const m = p.models.find(x => x.id === p.selectedModel); if (!m) die("3D候補が未選択（selectedModel なし）");
const dir = path.join(ROOT, "projects", name), fmts = fmtArg.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
fs.mkdirSync(path.join(dir, "exports"), { recursive: true });
const outputs = [], notes = [];
const glbRel = `exports/${name}.glb`;
fs.copyFileSync(path.join(dir, m.path), path.join(dir, glbRel)); outputs.push(glbRel);

const conv = fmts.filter(f => f === "fbx" || f === "stl").map(f => `exports/${name}.${f}`);
if (conv.length) {
  const blender = findBlender();
  if (!blender) notes.push("Blenderが見つからないため GLB のみ（BLENDER 環境変数で指定可）");
  else {
    const py = path.join(os.tmpdir(), `gearforge-export-${process.pid}.py`); fs.writeFileSync(py, PY);
    const r = spawnSync(blender, ["-b", "--factory-startup", "--python", py, "--", path.join(dir, glbRel), ...conv.map(c => path.join(dir, c))], { encoding: "utf8", timeout: 10 * 60 * 1000 });
    fs.rmSync(py, { force: true });
    for (const c of conv) {
      const f = path.join(dir, c);
      if ((r.stdout || "").includes("GF_OK " + f) && fs.existsSync(f) && fs.statSync(f).size > 0) outputs.push(c);
      else notes.push(`${path.extname(c).slice(1).toUpperCase()}変換失敗`);
    }
    if (notes.length) notes.push(((r.stderr || "") + (r.stdout || "")).trim().split("\n").filter(l => /error/i.test(l)).slice(-2).join(" / "));
  }
}

const sizes = outputs.map(o => `${o} ${(fs.statSync(path.join(dir, o)).size / 1048576).toFixed(1)}MB`);
project("set", name, "export.outputs", JSON.stringify(outputs));
project("done", name, "export", `書き出し完了: ${outputs.join(", ")}${notes.length ? "（" + notes.filter(Boolean).join("; ") + "）" : ""}`);
console.log(sizes.join(" | ") + (notes.length ? `\nnote: ${notes.filter(Boolean).join("; ")}` : "") + "\nok stage=export");
