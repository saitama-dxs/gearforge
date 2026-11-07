---
name: gear-prompt-decompose
description: 参考画像・プリセット・一言から、装備の6項目（種別・形状・素材・装飾・雰囲気・状態）を作る。stage=reference で使う。
---

# gear-prompt-decompose

入力は `next` の出力にすべて出ている（`catalog.json` は読まない）。
- `mode=image`：`images:` の画像を見て6項目を読み取る（最大3枚）。`wish` は上書き指示として優先。
- `mode=preset`：`preset` / `era.hint` / `taste`（mood・material）を6項目に展開。`category.note` は `notes` に書く。
- `mode=text`：`wish` から種別を決め、書かれていない項目はテイストに合う提案で埋める。
- `world:` 行があれば **世界設定が基調**。素材・装飾・雰囲気は era / taste / palette / motifs に合わせ、`wish` や preset はその上での個別指定として扱う。画風・配色の英語は後工程で自動付与されるので、6項目に画風名は書かない。

## ルール
- 1項目1行、短く（ユーザーが1行差し替えで直せる粒度）。日本語。
- `wish` を反映したら `notes` に「希望を反映：…」。
- 作品名・キャラ名・ブランド名を書かない（構成要素に翻訳）。
- 画像に複数の装備があれば主役を1つ決め、理由を `notes` に。
- Tripo向けに単一メッシュ・細すぎない・穴が少ない形へ寄せる。極細の鎖や紐は `notes` に「3D化時は省略」。
- `english` は空のまま。

## 書き込み（1回で）
```
node scripts/project.mjs apply <name> - <<'EOF'
{"prompt":{"type":"…","shape":"…","material":"…","ornament":"…","mood":"…","state":"…","notes":"…","approved":false}}
EOF
node scripts/project.mjs done <name> prompt "分解プロンプト作成（type=…）"
```
「アプリで手直しして承認してください」と伝えて止まる。
