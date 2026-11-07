---
name: tripo-gear-generate
description: 選ばれた概念画像から Tripo Studio（ログイン済みブラウザ）で3D候補を作り、GLBを回収・登録する。stage=concept（意匠選択済み）で使う。
---

# tripo-gear-generate（Tripo Studio）

クレジット：1本 約55（H3.1 最高品質、2026-11 実測）。標準2本・約120以内は見積もりを1行伝えて続行。超える場合は事前に了承を得る。
ブラウザは **ファイルをアップロードできるもの**（Codex 内蔵ブラウザ、Claude in Chrome など）で、ユーザーが Tripo にログイン済みのものを使う。

## 画面の扱い（トークン節約）
- 状態確認は **テキスト（要素検索・ページ本文）** で行う。スクリーンショットはボタンが見つからない時だけ、縮小（0.5）で1枚。
- 待つときは画面を見ない。ページ内 JS で本文を数秒おきに調べるループを **1回40秒以内** で回す（45秒で打ち切られるため）。
- サムネイルは撮らない。GLB も画像も開いて見ない。

## 手順（2026-11 の画面）
1. `https://studio.tripo3d.ai/` を開く。右上にクレジット数とアバターがあればログイン済み。無ければユーザーに任せて待つ。
2. ホームの「画像からすばやく生成」カードにある **file input** を要素検索で探し、`projects/<name>/concepts/<selected>.png` をアップロード（ボタンはクリックしない）。
3. 「生成 ◯◯」ボタン（◯◯＝消費クレジット）を押す。アクセシビリティツリーに名前が出ないことがあるので、見つからなければ縮小スクリーンショット1枚で位置を取る。
4. 画面が `/workspace/generate/<taskId>` に移る。**URL末尾が taskId。** すぐ記録：
   `node scripts/collect.mjs <name> start m1=<taskId>`（2本目も同じ手順で生成し m2 を足す）
5. 完了待ち：本文に「生成中」が無くなるまで（目安2分）。
6. 「エクスポート」→ ダイアログ（形式 GLB が既定、テクスチャ 4k）→ ダイアログ内の「エクスポート」。クレジットは減らない。
   ゲーム用で軽くしたい時はテクスチャ解像度を 2k に下げる（4k は1本 約70MB）。
7. 押したら **すぐ** `node scripts/collect.mjs <name> m1`。ダウンロードフォルダから拾って検証・登録し、1行だけ返す（数秒）。
8. `node scripts/collect.mjs <name> finish` → 「アプリで回して選んでください。消費は約Nクレジット」と伝えて止まる。

## 切れたとき（生成し直さない）
- `node scripts/project.mjs summary <name>` のログの taskId で `https://studio.tripo3d.ai/ja/workspace/generate/<taskId>` を開き、手順6から再開。
- `collect.mjs` が「新しい .glb が無い」→ ブラウザのダウンロード一覧で保存先を確認。既定以外なら `GEARFORGE_DOWNLOADS=<フォルダ>` を付けて再実行。
- JS 実行がタイムアウト → ループを短くして呼び直す（生成は止まっていない）。
- GLB 未取得のまま `finish` しない（コマンドも拒否する）。

## redo
`model redo` は設定を変えて追加生成（「きれいなトポロジー」、面数、別の意匠）。id は m3, m4… と続ける。

## 予備：API経路
ユーザーが API を使うと明示し、`TRIPO_API_KEY` が設定済みのときだけ `node scripts/tripo.mjs generate <name> --dry-run` → `generate`。
