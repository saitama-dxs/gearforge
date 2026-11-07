#!/usr/bin/env node
// forge-core world.mjs — world.json の検証と、プロンプト用の短い文の生成。依存なし。
// このファイルは forge-core から各キットへ sync.mjs でコピーされる。キット側で直接編集しない。
//   node scripts/world.mjs validate <world.json>
//   node scripts/world.mjs brief <world.json>                 分解用の日本語メモ（数行）
//   node scripts/world.mjs lock <world.json> [--for gear|character]   全英語プロンプトの末尾に付ける画風ロック文（1行）
//   node scripts/world.mjs new <id> [out.json]                雛形を作る
// カタログは環境変数 FORGE_CATALOG → 同じフォルダの catalog.json → ../public/catalog.json の順に探す。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CORE_VERSION = "0.3.0";
const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadCatalog(p) {
  const tries = [p, process.env.FORGE_CATALOG, path.join(HERE, "catalog.json"), path.join(HERE, "../public/catalog.json")].filter(Boolean);
  const f = tries.find(x => fs.existsSync(x));
  if (!f) throw new Error("catalog.json が見つからない");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
export const loadWorld = f => JSON.parse(fs.readFileSync(f, "utf8"));

const resolve = (w, c) => ({
  era: c.eras.find(e => e.id === w.era),
  taste: c.tastes.find(t => t.label === w.taste),
  style: (c.artStyles || []).find(s => s.id === w.artStyle),
  prop: (c.proportions || []).find(p => p.id === (w.proportion || "standard")),
});

export function validate(w, c) {
  const e = [], isStr = v => typeof v === "string" && v.length > 0;
  const allowed = ["$schema", "version", "id", "title", "summary", "era", "taste", "artStyle", "proportion", "palette", "motifs", "seed"];
  if (!w || typeof w !== "object" || Array.isArray(w)) return ["world がオブジェクトではない"];
  for (const k of Object.keys(w)) if (!allowed.includes(k)) e.push(`未知のキー: ${k}`);
  if (w.version !== 1) e.push("version は 1");
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(w.id || "")) e.push("id は英小文字・数字・ハイフン（48字以内）");
  if (!isStr(w.title) || w.title.length > 40) e.push("title は1〜40字");
  if (w.summary != null && (typeof w.summary !== "string" || w.summary.length > 200)) e.push("summary は200字以内");
  const r = resolve(w, c);
  if (!r.era) e.push(`era が catalog にない: ${w.era}（${c.eras.map(x => x.id).join("|")}）`);
  if (!r.taste) e.push(`taste が catalog にない: ${w.taste}`);
  else if (r.era && r.taste.eras && !r.taste.eras.includes(w.era)) e.push(`taste「${w.taste}」は era=${w.era} に対応していない`);
  if (!r.style) e.push(`artStyle が catalog にない: ${w.artStyle}（${(c.artStyles || []).map(x => x.id).join("|")}）`);
  if (w.proportion != null && !r.prop) e.push(`proportion が catalog にない: ${w.proportion}`);
  if (w.palette != null) {
    const p = w.palette, lim = { base: 4, accent: 3, avoid: 4 };
    if (typeof p !== "object" || Array.isArray(p)) e.push("palette はオブジェクト");
    else for (const [k, v] of Object.entries(p)) {
      if (!(k in lim)) { e.push(`palette の未知のキー: ${k}`); continue; }
      if (!Array.isArray(v) || v.length > lim[k]) { e.push(`palette.${k} は${lim[k]}個までの配列`); continue; }
      for (const x of v) {
        if (k === "avoid") { if (!isStr(x)) e.push("palette.avoid は英語の文字列"); }
        else if (!x || !isStr(x.en)) e.push(`palette.${k} の各色に en（英語の色名）が必要`);
        else if (x.hex != null && !/^#[0-9a-fA-F]{6}$/.test(x.hex)) e.push(`palette.${k} の hex が不正: ${x.hex}`);
      }
    }
  }
  if (w.motifs != null && (!Array.isArray(w.motifs) || w.motifs.length > 5 || !w.motifs.every(isStr))) e.push("motifs は英語の文字列5個まで");
  if (w.seed != null && !(Number.isInteger(w.seed) && w.seed >= 0)) e.push("seed は0以上の整数");
  return e;
}

// 全プロンプトの末尾に付ける英語の固定文。同じ world なら常に同じ文になる（キャッシュも効く）。
export function styleLock(w, c, kind = "gear") {
  const r = resolve(w, c), p = w.palette || {}, parts = [];
  if (r.style) parts.push(`Art style: ${r.style.lock}`);
  if (r.era || r.taste) parts.push(`Setting: ${[r.era?.en, r.taste?.en].filter(Boolean).join(", ")}`);
  const base = (p.base || []).map(x => x.en), acc = (p.accent || []).map(x => x.en);
  if (base.length || acc.length) parts.push(`Color palette: ${base.join(", ")}${acc.length ? `${base.length ? " with " : ""}${acc.join(", ")} accents` : ""}`);
  if ((p.avoid || []).length) parts.push(`Avoid: ${p.avoid.join(", ")}`);
  if (kind === "character" && r.prop) parts.push(`Body: ${r.prop.en}`);
  if ((w.motifs || []).length) parts.push(`Shared motifs where fitting: ${w.motifs.join(", ")}`);
  return parts.join(". ") + ".";
}

// 分解（設定→項目）用の短い日本語メモ
export function brief(w, c) {
  const r = resolve(w, c), p = w.palette || {}, col = xs => (xs || []).map(x => x.ja || x.en).join("・");
  return [
    `world: ${w.title}（${w.id}）${w.summary ? " — " + w.summary : ""}`,
    `era: ${r.era?.label ?? w.era}（${r.era?.hint ?? ""}） / taste: ${w.taste}（mood=${r.taste?.mood ?? "?"} / material=${r.taste?.material ?? "?"}）`,
    `artStyle: ${r.style?.label ?? w.artStyle}` + (p.base || p.accent ? ` / palette: ${col(p.base)}${p.accent?.length ? " ＋差し色 " + col(p.accent) : ""}` : "") + (p.avoid?.length ? ` / 避ける: ${p.avoid.join(", ")}` : ""),
    ...(w.motifs?.length ? [`motifs: ${w.motifs.join(", ")}`] : []),
  ];
}

export function template(id) {
  return { "$schema": "./world.schema.json", version: 1, id, title: id, summary: "", era: "fantasy", taste: "王道", artStyle: "hand-painted", proportion: "standard",
    palette: { base: [{ ja: "鋼", en: "polished steel", hex: "#A7ADB4" }], accent: [{ ja: "金", en: "gold", hex: "#C9A227" }], avoid: [] }, motifs: [], seed: Math.floor(Math.random() * 1e6) };
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  const die = m => { console.error("error: " + m); process.exit(1); };
  const load = f => { if (!f || !fs.existsSync(f)) die(`world.json が見つからない: ${f}`); try { return loadWorld(f); } catch (e) { die(`JSON が読めない: ${e.message}`); } };
  try {
    switch (cmd) {
      case "validate": { const errs = validate(load(a), loadCatalog()); if (errs.length) die(errs.join("\n")); console.log("ok"); break; }
      case "brief": { const w = load(a), c = loadCatalog(), errs = validate(w, c); if (errs.length) die(errs.join("\n")); console.log(brief(w, c).join("\n")); break; }
      case "lock": { const w = load(a), c = loadCatalog(), errs = validate(w, c); if (errs.length) die(errs.join("\n")); const i = process.argv.indexOf("--for"); console.log(styleLock(w, c, i > 0 ? process.argv[i + 1] : "gear")); break; }
      case "new": { if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(a || "")) die("id は英小文字・数字・ハイフン"); const out = b || `${a}.json`; if (fs.existsSync(out)) die(`既にある: ${out}`); fs.writeFileSync(out, JSON.stringify(template(a), null, 2) + "\n"); console.log(out); break; }
      default: console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).join("\n"));
    }
  } catch (e) { die(e.message); }
}
