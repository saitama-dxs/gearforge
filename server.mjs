// GearForge ローカルアプリ — 依存なし。public/ を配信し、projects/ を監視してSSEで通知する。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PROJECTS = path.join(ROOT, "projects");
const PORT = Number(process.env.PORT || 8767);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".fbx": "application/octet-stream", ".stl": "model/stl", ".obj": "text/plain" };

fs.mkdirSync(PROJECTS, { recursive: true });
const clients = new Set();
let timer = null;
function broadcast() { clearTimeout(timer); timer = setTimeout(() => { for (const r of clients) r.write("data: changed\n\n"); }, 150); }
try { fs.watch(PROJECTS, { recursive: true }, broadcast); } catch { setInterval(broadcast, 2000); }

function safe(base, rel) { const p = path.normalize(path.join(base, rel)); return p.startsWith(base) ? p : null; }
function send(res, code, body, type = "application/json") { res.writeHead(code, { "content-type": type }); res.end(typeof body === "string" ? body : JSON.stringify(body)); }
function cli(args) { return new Promise((ok, ng) => execFile(process.execPath, [path.join(ROOT, "scripts/project.mjs"), ...args], (e, out, err) => e ? ng(new Error(err || e.message)) : ok(out.trim()))); }
function readBody(req) { return new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => r(b)); }); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write("data: hello\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return;
    }
    if (p === "/api/worlds") { // worlds/*.json と worlds/examples/*.json（スキーマ以外）
      const out = [];
      for (const d of ["worlds", "worlds/examples"]) {
        const dir = path.join(ROOT, d); if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "world.schema.json")) {
          try { const w = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); out.push({ path: `${d}/${f}`, id: w.id, title: w.title, example: d.endsWith("examples") }); } catch {}
        }
      }
      return send(res, 200, out);
    }
    if (p === "/api/projects") return send(res, 200, await cli([url.searchParams.has("trash") ? "list-trash" : "list"]));
    if (p.startsWith("/api/project/")) {
      const name = decodeURIComponent(p.split("/")[3]);
      if (req.method === "GET") return send(res, 200, await cli(["app-get", name]));
      if (req.method === "POST") { // {op:"set"|"select"|"stage"|"log"|"init", args:[...]}
        const { op, args = [] } = JSON.parse(await readBody(req) || "{}");
        if (!["set", "select", "stage", "log", "init", "trash", "restore"].includes(op)) return send(res, 400, { error: "bad op" });
        return send(res, 200, { out: await cli(op === "init" ? ["init", name] : [op, name, ...args]) });
      }
    }
    if (p.startsWith("/api/upload/")) { // POST raw body, ?file=ref-01.png  → projects/<name>/inputs/
      const name = decodeURIComponent(p.split("/")[3]); const fname = path.basename(url.searchParams.get("file") || "ref.png");
      const dest = safe(path.join(PROJECTS, name, "inputs"), fname); if (!dest) return send(res, 400, { error: "bad path" });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await new Promise(r => req.pipe(fs.createWriteStream(dest)).on("finish", r));
      const proj = JSON.parse(await cli(["get", name])); const rel = "inputs/" + fname;
      if (!proj.reference.images.some(i => i.path === rel)) proj.reference.images.push({ path: rel, note: "" });
      await cli(["set", name, "reference.images", JSON.stringify(proj.reference.images)]);
      return send(res, 200, { path: rel });
    }
    if (p.startsWith("/api/export/") && req.method === "POST") { // {formats:["glb","fbx","stl"]} → scripts/export.mjs（Blender でFBX/STL）
      const name = decodeURIComponent(p.split("/")[3]); const { formats = ["glb", "fbx"] } = JSON.parse(await readBody(req) || "{}");
      const fm = formats.filter(x => ["glb", "fbx", "stl"].includes(x)); if (!fm.length) fm.push("glb");
      const out = await new Promise((ok, ng) => execFile(process.execPath, [path.join(ROOT, "scripts/export.mjs"), name, fm.join(",")], { timeout: 11 * 60 * 1000 }, (e, o, err) => e ? ng(new Error((err || e.message).replace(/^error: /, "").trim())) : ok(o.trim())));
      return send(res, 200, { out });
    }
    if (p.startsWith("/api/asset/") && req.method === "POST") { // ?kind=concept|model&file=x.png → 手元の画像／GLB を候補に加える
      const name = decodeURIComponent(p.split("/")[3]), kind = url.searchParams.get("kind");
      if (!["concept", "model"].includes(kind)) return send(res, 400, { error: "bad kind" });
      const ext = path.extname(url.searchParams.get("file") || "").toLowerCase();
      if (kind === "model" ? ext !== ".glb" : ![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return send(res, 400, { error: kind === "model" ? "GLB を選んでください" : "PNG / JPG / WebP を選んでください" });
      const sub = kind === "model" ? "models" : "concepts", d = path.join(PROJECTS, name, sub); if (!safe(PROJECTS, path.join(name, sub))) return send(res, 400, { error: "bad path" });
      fs.mkdirSync(d, { recursive: true }); let n = 1; while (fs.readdirSync(d).some(f => f.startsWith(`user-${n}.`))) n++;
      const id = `user-${n}`, rel = `${sub}/${id}${ext}`;
      await new Promise(r => req.pipe(fs.createWriteStream(path.join(PROJECTS, name, rel))).on("finish", r));
      await cli(kind === "model" ? ["add-model", name, id, rel, "", "user"] : ["add-concept", name, id, rel, "user upload"]);
      await cli(["log", name, `${kind === "model" ? "GLB" : "意匠画像"}を追加: ${rel}`, "user"]);
      return send(res, 200, { id, path: rel });
    }
    if (p.startsWith("/api/open/") && req.method === "POST") { // 出力フォルダをOSで開く
      const name = decodeURIComponent(p.split("/")[3]), d = safe(PROJECTS, path.join(name, "exports")); if (!d || !fs.existsSync(d)) return send(res, 404, { error: "まだ書き出していません" });
      execFile(process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open", [d], () => {}); return send(res, 200, { ok: true });
    }
    if (p.startsWith("/files/")) { // /files/<name>/<rel>
      const [, , name, ...rel] = p.split("/"); const f = safe(path.join(PROJECTS, decodeURIComponent(name)), rel.map(decodeURIComponent).join("/"));
      if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, "not found", "text/plain");
      res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" }); return fs.createReadStream(f).pipe(res);
    }
    const f = safe(PUBLIC, p === "/" ? "index.html" : p);
    if (f && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" }); return fs.createReadStream(f).pipe(res); }
    send(res, 404, "not found", "text/plain");
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, "127.0.0.1", () => console.log(`GearForge: http://127.0.0.1:${PORT}`));
