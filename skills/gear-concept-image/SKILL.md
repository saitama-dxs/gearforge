---
name: gear-concept-image
description: 承認済みの6項目を英語プロンプトにし、概念画像を4案生成して登録する。stage=prompt（承認済み）で使う。
---

# gear-concept-image

6項目は `next` の出力にある。

## 英語プロンプト
```
A single {type}, {shape}, made of {material}, {ornament}, {mood} style, {state}.
Isolated on plain neutral gray background, centered, full view of the whole object,
side view, studio lighting, no hands, no character, no text, no watermark, game asset concept art.
```
自然な英語に訳す。固有名詞を混ぜない。背景無地・1つだけ・全体・横向きは必須。
`styleLock:` 行があれば、その文を **そのまま末尾に付ける**（訳し直さない・4案すべて同じ）。シリーズ全体の画風と配色をそろえるための固定文。

## 生成（4案）
- 2枚は同じプロンプトでシード違い、2枚は `mood` か `ornament` を少し振る。
- エージェント環境の画像生成機能を使う。無ければ「画像生成ができる環境で実行してください」と伝えて止まる。
- 保存先 `projects/<name>/concepts/c1.png … c4.png`（1024px以上）。**生成した画像を見直さない**（選ぶのは人）。

## 書き込み
```
node scripts/project.mjs apply <name> - <<'EOF'
{"prompt":{"english":"…"}}
EOF
node scripts/project.mjs add-concept <name> c1 concepts/c1.png "<差分があればその点だけ>"   # c2〜c4 も同様
node scripts/project.mjs done <name> concept "概念画像4案生成"
```
「アプリで1枚選んでください」と伝えて止まる。`redo` なら不満点を聞いてから、前の画像を `_trash/` へ移して作り直す。
