# GearForge — エージェント向け入口

人はローカルアプリ（`npm start` → http://127.0.0.1:8767）で確認・選択・承認だけ行う。エージェントは作業する。共有するのは `projects/<name>/project.gearforge` だけ。
**README.md と docs/ は人向け。読まない。** JSONを直接開かない・編集しない。

## `gearforge begin <name> <stage> [redo]` を受け取ったら

1. `node scripts/project.mjs next <name>` — 工程・入力・読むSkill・やることが数行で返る。`wait:` なら、その内容をユーザーに伝えて止まる。
2. 返ってきた `skill:` の SKILL.md **1つだけ**を読み、作業する。
3. 最後は `node scripts/project.mjs done <name> <次のstage> "<1行の結果>"`（collect.mjs finish / export.mjs は自動で進める）。

状態の確認は `summary <name>`（数行）。`get <name>` で全体を読まない。複数項目の書き込みは `apply <name> -`（JSONを標準入力で1回）。

## 守ること

- **確認地点で止まる。** 選択と承認はユーザーが行う。代わりに決めない。
- **クレジット。** 標準2本・合計120クレジット以内は見積もりを1行伝えて続行。超える場合は事前に了承を得る。
- **著作物・キャラ・ブランド名をプロンプトに入れない。** 「〇〇風」は色調・素材・装飾・時代に翻訳する。
- **Tripo はログイン済みブラウザの Studio を使う。** APIキーをチャットで聞かない（API は `TRIPO_API_KEY` がありユーザーが望んだ時だけ）。
- **画像は原則見ない。** 人がアプリで見る。見るのは参考画像（最大3枚）と、差し戻し時の1枚だけ。ブラウザの状態確認もテキストで行い、スクリーンショットは最後の手段。
- **ファイルを消さない。** 不要なものは `projects/<name>/_trash/` へ。
- `redo` は同じ工程のやり直し。前の成果物は `_trash/` へ。
