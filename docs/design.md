# 設計メモ

## 方針
- 人は判断、エージェントは作業。確認地点で必ず止まる。
- 状態は `project.gearforge` 1ファイル。アプリとエージェントの間に直接通信はない。
- アプリは `fs.watch` でプロジェクトフォルダを監視し、SSEでブラウザに通知する。
- Tripoはログイン済みブラウザの Studio 操作が既定（ユーザーのサブスク・クレジットを使い、APIキー不要）。`scripts/tripo.mjs`（API v3）は `TRIPO_API_KEY` がある場合の予備。作者側にコストは発生しない。
- 省トークン：エージェントの入口は `project.mjs next`（数行）。全体読み込み・README・画像閲覧をさせない。書き込みは `apply` で1回、工程完了は `done`。ブラウザはテキストで状態確認し、生成待ちは60秒間隔のボタン確認だけ。GLB回収は `collect.mjs`。
- LLM非依存。Codex / Claude Code のどちらでも同じ依頼文・同じSkillで動く。

## project.gearforge スキーマ (v2)
v1 の `log` 配列は初回読み込み時に `log.jsonl`（1行1JSON: ts / who / msg）へ自動移行する。
```json
{
  "version": 2,
  "name": "gear-01",
  "stage": "reference | prompt | concept | model | export",
  "reference": { "mode": "image | preset | text", "images": [{ "path": "inputs/ref-01.png", "note": "" }], "preset": { "category": "weapon|armor|item", "type": "", "era": "fantasy|modern|future", "taste": "" }, "wish": "" },
  "prompt": {
    "type": "", "shape": "", "material": "", "ornament": "", "mood": "", "state": "",
    "notes": "", "english": "", "approved": false
  },
  "concepts": [{ "id": "c1", "path": "concepts/c1.png", "prompt": "" }],
  "selectedConcept": null,
  "models": [{ "id": "m1", "path": "models/m1.glb", "preview": "models/m1.png", "source": "tripo-studio", "taskId": "" }],
  "selectedModel": null,
  "export": { "outputs": [] }
}
```

## 武器種別（初期5種 + 和風）
剣（片手剣・大剣・刀）、斧、弓、杖、盾。和風は刀・薙刀・手裏剣を強めに。

## 差別化
- 参考画像→項目分解→手直し（自由記述も選ぶだけも不要）
- 単一メッシュで工程が短い（30分で1本）
- Codex / Claude Code 両対応、日本語

## マネタイズ
READMEとアプリ内の「Tripoアカウント作成」リンクにアフィリエイト。

## カタログ（public/catalog.json）
種別・時代・テイストはコードに書かず `public/catalog.json` で管理する。アプリも Skill も同じファイルを読む。
- categories: weapon / armor / item（types は自由に追加）
- eras: fantasy / modern / future
- tastes: 各テイストに mood / material の展開と、対応する eras を持つ。UIは時代で絞って表示する

## 世界設定（world.json, forge-core 0.1.0）
- シリーズ共通。スキーマは `worlds/world.schema.json`。era / taste / artStyle / proportion は catalog の値を参照し、展開（英語）は catalog 側に置く。
- `project.reference.world` に kit ルートからの相対パス。`next` が reference 工程で日本語メモ（brief）、prompt 工程で英語の `styleLock` を出す。styleLock は同じ world なら常に同一文で、全プロンプトの末尾に付ける。
- `scripts/world.mjs`・`public/catalog.json`・`worlds/world.schema.json`・`worlds/examples/` は forge-core の `sync.mjs` で上書きされる。キット側で直接編集しない。
