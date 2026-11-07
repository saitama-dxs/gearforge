const STAGES = [["reference","素材庫"],["prompt","設計図"],["concept","意匠"],["model","鍛造"],["export","納品"]];
let CATALOG = { categories: [], eras: [], tastes: [] }, WORLDS = [];
const FIELDS = [["type","種別"],["shape","形状"],["material","素材"],["ornament","装飾"],["mood","雰囲気"],["state","状態"],["notes","メモ"]];
const $ = s => document.querySelector(s);
let cur = localStorage.getItem("wg.project") || "", proj = null;

async function api(path, opt) { const r = await fetch(path, opt); if (!r.ok) throw new Error(await r.text()); return r.json(); }
const post = (op, args) => api(`/api/project/${encodeURIComponent(cur)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, args }) });

async function loadProjects() {
  const list = await api("/api/projects");
  const sel = $("#projSel"); sel.innerHTML = list.map(p => `<option value="${p.name}">${p.name}（${p.stage}）</option>`).join("");
  if (!list.some(p => p.name === cur)) cur = list[0]?.name || "";
  sel.value = cur; localStorage.setItem("wg.project", cur);
  $("#projectList").innerHTML = list.map(p => `<article class="project-entry"><a class="project-open" href="#work/${encodeURIComponent(p.name)}"><span class="eyebrow">${esc(STAGES.find(s => s[0] === p.stage)?.[1] || p.stage)}</span><h3>${esc(p.name)}</h3><span class="hint">${p.stage === "export" ? "完成品を確認する" : "制作を続ける"} →</span></a><button class="ghost delete-project" data-trash="${esc(p.name)}" aria-label="${esc(p.name)}を削除">削除</button></article>`).join("") || `<div class="card empty-state"><h2>最初の一振りを鍛えよう</h2><p>「新しい一振りを作る」から始められます。</p></div>`;
  if (cur) { proj = await api(`/api/project/${encodeURIComponent(cur)}`); render(); } else { $("#view").innerHTML = `<div class="card empty-state"><h2>工房へようこそ</h2><p>「＋ 新しい一振り」から、最初の武器づくりを始めましょう。</p></div>`; }
  $("#workTitle").textContent = cur;
  const trash = await api("/api/projects?trash=1");
  $("#trashCount").textContent = `（${trash.length}）`;
  $("#trashList").innerHTML = trash.map(p => `<div class="trash-row"><span>${esc(p.name)}</span><button class="ghost" data-restore="${esc(p.name)}">復元</button></div>`).join("") || '<p class="hint">ゴミ箱は空です。</p>';
}
$("#projSel").onchange = e => { location.hash = `work/${encodeURIComponent(e.target.value)}`; };
$("#newProj").onclick = async () => {
  try {
    const [active, trash] = await Promise.all([api("/api/projects"), api("/api/projects?trash=1")]);
    const used = new Set([...active, ...trash].map(p => p.name.toLowerCase()));
    let index = 1;
    while (used.has(`gear-${String(index).padStart(2, "0")}`)) index++;
    let suggestion = `gear-${String(index).padStart(2, "0")}`;
    while (true) {
      const input = prompt("新しい武器の名前（英数字・ハイフン・アンダースコア）", suggestion);
      if (input === null) return;
      const name = input.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) {
        alert("英数字・ハイフン・アンダースコアで名前を入力してください。予約名は使用できません。");
        continue;
      }
      if (used.has(name.toLowerCase())) {
        alert(trash.some(p => p.name.toLowerCase() === name.toLowerCase())
          ? "この名前の武器はゴミ箱にあります。新しく作る場合は別の名前を、元の武器を使う場合はゴミ箱の「復元」を選んでください。"
          : "この名前の武器はすでにあります。別の名前を入力してください。");
        continue;
      }
      await api(`/api/project/${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "init", args: [] }) });
      cur = name;
      localStorage.setItem("wg.project", name);
      location.hash = `work/${encodeURIComponent(name)}`;
      return;
    }
  } catch (e) { alert(`新しい武器を作成できませんでした：${e.message}`); }
};
async function changeProjectState(name, op, button) {
  if (op === "trash" && !confirm(`「${name}」を削除しますか？\n一覧から外してゴミ箱へ移します。画像・3Dモデルは保持され、後から復元できます。`)) return;
  button.disabled = true;
  try {
    await api(`/api/project/${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, args: [] }) });
    if (op === "trash" && cur === name) { cur = ""; proj = null; localStorage.removeItem("wg.project"); }
    await loadProjects();
    $("#projectNotice").textContent = op === "trash" ? `「${name}」をゴミ箱へ移しました。` : `「${name}」を復元しました。`;
  } catch (e) { $("#projectNotice").textContent = `操作できませんでした：${e.message}`; button.disabled = false; }
}
$("#projectList").addEventListener("click", e => { const b = e.target.closest("[data-trash]"); if (b) changeProjectState(b.dataset.trash, "trash", b); });
$("#trashList").addEventListener("click", e => { const b = e.target.closest("[data-restore]"); if (b) changeProjectState(b.dataset.restore, "restore", b); });
$("#homeNew").onclick = () => $("#newProj").click();

async function route() {
  const match = location.hash.match(/^#work\/(.+)$/);
  document.body.dataset.page = match ? "work" : "home";
  $("#ask").classList.add("hidden");
  if (match) { try { const n = decodeURIComponent(match[1]); if (n !== cur) exportNote = ""; cur = n; } catch { location.hash = "home"; return; } }
  await loadProjects();
  if (match && (!cur || cur !== decodeURIComponent(match[1]))) { location.hash = "home"; return; }
  document.title = match ? `${cur} — GearForge 製造工程` : "GearForge — 装備精錬所";
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function ask(stage) { $("#askText").textContent = `gearforge begin ${cur} ${stage}`; $("#ask").classList.remove("hidden"); }
$("#copyBtn").onclick = () => navigator.clipboard.writeText($("#askText").textContent).then(() => { $("#copyBtn").textContent = "コピーしました"; setTimeout(() => $("#copyBtn").textContent = "コピー", 1500); });
$("#closeAsk").onclick = () => $("#ask").classList.add("hidden");
const f = rel => `/files/${encodeURIComponent(cur)}/${rel}`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 書き出し（GLB は常に。FBX / STL は Blender で変換）
let exportNote = "", exportBusy = false; const exportFmts = new Set(["fbx"]);
const exportRow = (enabled, label) => `<div class="row export-row"><span class="hint">形式：GLB</span>
  <label class="hint"><input type="checkbox" data-fmt="fbx" ${exportFmts.has("fbx") ? "checked" : ""}> FBX</label><label class="hint"><input type="checkbox" data-fmt="stl" ${exportFmts.has("stl") ? "checked" : ""}> STL（3Dプリント）</label>
  <button id="doExport" ${enabled && !exportBusy ? "" : "disabled"}>${exportBusy ? "書き出し中…" : label}</button><span class="hint" id="exportState">${esc(exportNote)}</span></div>`;

function render() {
  const si = STAGES.findIndex(s => s[0] === proj.stage);
  $("#steps").innerHTML = STAGES.map((s, i) => `<span class="${i === si ? "on" : i < si ? "done" : ""}"><b>${String(i + 1).padStart(2, "0")}</b>${s[1]}</span>`).join("");
  $("#log").innerHTML = proj.log.slice(-30).reverse().map(l => `<li>${esc(l.ts.slice(5, 16))} [${l.who}] ${esc(l.msg)}</li>`).join("");
  const v = $("#view"); const p = proj;
  if (p.stage === "reference") { const r = p.reference, mode = r.mode || "image"; v.innerHTML = `

    <div class="card"><h2>素材庫 — 何を鍛える？</h2>
    <div class="fields world-pick"><label for="worldSel">世界設定（任意）</label><select id="worldSel"><option value="">なし（この一振りだけで決める）</option>${WORLDS.map(w => `<option value="${esc(w.path)}" ${r.world === w.path ? "selected" : ""}>${esc(w.title)}${w.example ? "（例）" : ""}</option>`).join("")}</select>
    <p class="hint">選ぶと、時代・テイスト・画風・配色がその世界にそろいます。世界は <code>worlds/</code> に置いた world.json です。</p></div>
    <div class="row tabs">${[["image","参考画像から"],["preset","種別とテイストを選ぶ"],["text","テキストで伝える"]].map(([k,l]) => `<button class="${mode===k?"":"ghost"}" data-mode="${k}">${l}</button>`).join("")}</div>
    <div id="m-image" class="${mode==="image"?"":"hidden"}">
      <p class="hint">ゲームのスクショ、イラスト、実物の写真など。自分が使ってよい画像だけを。</p>
      <input type="file" id="up" accept="image/*" multiple>
      <div class="grid" style="margin-top:12px">${r.images.map(i => `<div class="item"><img src="${f(i.path)}"><div class="cap">${esc(i.path)}</div></div>`).join("")}</div>
    </div>
    <div id="m-preset" class="fields ${mode==="preset"?"":"hidden"}">
      <label>カテゴリ</label><select id="pCat">${CATALOG.categories.map(c => `<option value="${c.id}" ${(r.preset?.category||"weapon")===c.id?"selected":""}>${c.label}</option>`).join("")}</select>
      <label>種別</label><select id="pType"></select>
      <label>時代</label><select id="pEra">${CATALOG.eras.map(e => `<option value="${e.id}" ${(r.preset?.era||"fantasy")===e.id?"selected":""}>${e.label}</option>`).join("")}</select>
      <label>テイスト</label><select id="pTaste"></select>
    </div>
    <div id="m-text" class="${mode==="text"?"":"hidden"}"><p class="hint">自由に。「マグロの形をしたハンマー」「錆びた海賊のカトラス」など一言でOK。</p></div>
    <div class="fields" style="margin-top:12px"><label>補足（任意）</label><textarea id="wish" placeholder="例：もっと細身で、刃に炎の模様">${esc(r.wish)}</textarea></div>
    <div class="row"><button id="next">設計図を引いてもらう</button></div></div>`; }
  else if (p.stage === "prompt") v.innerHTML = `
    <div class="card"><h2>設計図 — 仕様を書き込む</h2>
    <p class="hint">日本語でOK。直したい項目だけ書き換えて「承認」。英語への変換はエージェントが行います。</p>
    <div class="fields">${FIELDS.map(([k, l]) => `<label>${l}</label><input data-k="${k}" value="${esc(p.prompt[k])}">`).join("")}
    <label>英語（参考）</label><textarea readonly>${esc(p.prompt.english)}</textarea></div>
    <div class="row"><button id="savePrompt" class="ghost">保存</button><button id="redo" class="ghost">引き直してもらう</button><button id="approve">承認して意匠を4案描かせる</button></div></div>`;
  else if (p.stage === "concept") v.innerHTML = `
    <div class="card"><h2>意匠 — 一つを選ぶ</h2><p class="hint">気に入った1枚をクリック。どれも違うなら「描き直し」を頼めます。</p>
    <div class="grid">${p.concepts.map(c => `<div class="item ${p.selectedConcept === c.id ? "sel" : ""}" data-id="${c.id}"><img src="${f(c.path)}"><div class="cap">${esc(c.id)}</div></div>`).join("") || "<p class='hint'>鍛冶師が意匠を描いています…</p>"}</div>
    <div class="row"><label class="ghost filebtn">手元の画像を候補に加える<input type="file" id="addAsset" data-kind="concept" accept="image/png,image/jpeg,image/webp" hidden></label><button id="redo" class="ghost">描き直させる</button><button id="next" ${p.selectedConcept ? "" : "disabled"}>この意匠で鍛造する（Tripoのクレジットを使います）</button></div></div>`;
  else if (p.stage === "model") v.innerHTML = `
    <div class="card"><h2>鍛造 — 仕上がりを選ぶ</h2><p class="hint">ドラッグで回して見比べてください。</p>
    <div class="grid">${p.models.map(m => `<div class="item ${p.selectedModel === m.id ? "sel" : ""}" data-id="${m.id}"><model-viewer src="${f(m.path)}" camera-controls auto-rotate shadow-intensity="1"></model-viewer><div class="cap">${esc(m.id)} · ${esc(m.source)}</div></div>`).join("") || "<p class='hint'>炉で鍛造中です。しばらくお待ちください…</p>"}</div>
    <div class="row"><label class="ghost filebtn">手元の GLB を候補に加える<input type="file" id="addAsset" data-kind="model" accept=".glb" hidden></label><button id="redo" class="ghost">打ち直させる</button></div>
    ${exportRow(p.selectedModel, "この一振りを納品する（書き出し）")}</div>`;
  else v.innerHTML = `
    <div class="card big"><h2>納品 — 完成</h2>${(() => { const m = p.models.find(x => x.id === p.selectedModel); return m ? `<model-viewer src="${f(m.path)}" camera-controls auto-rotate></model-viewer>` : ""; })()}
    <ul>${p.export.outputs.map(o => `<li><a href="${f(o)}" download>${esc(o)}</a></li>`).join("") || "<li class='hint'>納品準備中…</li>"}</ul>
    ${exportRow(true, "形式を変えて書き出し直す")}
    <div class="row"><button id="openOut" class="ghost">出力フォルダを開く</button><button id="again" class="ghost">もう一振り鍛える</button></div></div>`;

  $("#up")?.addEventListener("change", async e => { for (const file of e.target.files) await fetch(`/api/upload/${encodeURIComponent(cur)}?file=${encodeURIComponent(file.name)}`, { method: "POST", body: file }); });
    $("#savePrompt")?.addEventListener("click", async () => { for (const i of document.querySelectorAll("[data-k]")) await post("set", [`prompt.${i.dataset.k}`, i.value]); await post("log", ["prompt edited by user", "user"]); });
  $("#approve")?.addEventListener("click", async () => { for (const i of document.querySelectorAll("[data-k]")) await post("set", [`prompt.${i.dataset.k}`, i.value]); await post("set", ["prompt.approved", "true"]); ask("prompt"); });
  $("#worldSel")?.addEventListener("change", e => post("set", ["reference.world", e.target.value]));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => post("set", ["reference.mode", b.dataset.mode])));
  if ($("#pCat")) {
    const fillPreset = () => {
      const cat = CATALOG.categories.find(c => c.id === $("#pCat").value) || CATALOG.categories[0];
      $("#pType").innerHTML = (cat?.types || []).map(t => `<option ${p.reference.preset?.type===t?"selected":""}>${t}</option>`).join("");
      const era = $("#pEra").value;
      $("#pTaste").innerHTML = CATALOG.tastes.filter(t => !t.eras || t.eras.includes(era)).map(t => `<option ${p.reference.preset?.taste===t.label?"selected":""}>${t.label}</option>`).join("");
    };
    $("#pCat").addEventListener("change", fillPreset); $("#pEra").addEventListener("change", fillPreset); fillPreset();
  }
  $("#next")?.addEventListener("click", async () => {
    if (p.stage === "reference") {
      const mode = p.reference.mode || "image", w = $("#wish").value.trim();
      if (mode === "image" && !p.reference.images.length) return alert("参考画像を1枚以上入れてください");
      if (mode === "text" && !w) return alert("補足欄に、作りたい武器を一言で書いてください");
      if (mode === "preset") await post("set", ["reference.preset", JSON.stringify({ category: $("#pCat").value, type: $("#pType").value, era: $("#pEra").value, taste: $("#pTaste").value })]);
      await post("set", ["reference.wish", w]);
    }
    ask(p.stage); });
  $("#redo")?.addEventListener("click", async () => { await post("log", ["user requested redo", "user"]); ask(p.stage + " redo"); });
  $("#again")?.addEventListener("click", () => $("#newProj").click());
  $("#addAsset")?.addEventListener("change", async e => { const file = e.target.files[0]; if (!file) return;
    const r = await fetch(`/api/asset/${encodeURIComponent(cur)}?kind=${e.target.dataset.kind}&file=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
    if (!r.ok) alert((await r.json().catch(() => ({}))).error || "追加できませんでした"); });
  $("#openOut")?.addEventListener("click", () => fetch(`/api/open/${encodeURIComponent(cur)}`, { method: "POST" }));
  document.querySelectorAll("[data-fmt]").forEach(c => c.onchange = () => c.checked ? exportFmts.add(c.dataset.fmt) : exportFmts.delete(c.dataset.fmt));
  $("#doExport")?.addEventListener("click", async () => {
    const formats = ["glb", ...[...document.querySelectorAll("[data-fmt]:checked")].map(x => x.dataset.fmt)];
    exportBusy = true; exportNote = formats.some(x => x !== "glb") ? "Blender で変換しています（数十秒〜数分）" : ""; render();
    const r = await fetch(`/api/export/${encodeURIComponent(cur)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ formats }) });
    const j = await r.json().catch(() => ({})); exportBusy = false;
    exportNote = r.ok ? "完了：" + j.out.split("\n").filter(l => !l.startsWith("ok ")).join(" ／ ") : "失敗：" + (j.error || r.statusText);
    loadProjects(); });
  document.querySelectorAll(".item[data-id]").forEach(el => el.addEventListener("click", () => post("select", [p.stage === "concept" ? "concept" : "model", el.dataset.id])));
}

Promise.all([fetch("/catalog.json").then(r => r.json()), fetch("/api/worlds").then(r => r.json()).catch(() => [])])
  .then(([c, w]) => { CATALOG = c; WORLDS = w; loadProjects(); }).catch(() => {});
new EventSource("/api/events").onmessage = e => { if (e.data === "changed") loadProjects(); };
route();
{ const u = window.GEARFORGE_CONFIG?.TRIPO_URL; const a = document.getElementById("tripoLink"); if (u && a) a.href = u; }
