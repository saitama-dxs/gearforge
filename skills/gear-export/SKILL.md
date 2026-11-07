---
name: gear-export
description: 選ばれた3D候補を GLB / FBX / STL で exports/ に書き出す（scripts/export.mjs、Blenderヘッドレス）。stage=model（候補選択済み）で使う。
---

# gear-export

用途を聞いていなければ既定（GLB＋FBX）。3Dプリント用途なら STL を足す。
```
node scripts/export.mjs <name>               # glb,fbx
node scripts/export.mjs <name> glb,fbx,stl
```
出力は1〜3行。`note:` に「Blenderが見つからない」とあれば GLB のみで完了している。Blender の場所が分かるなら環境変数 `BLENDER` に入れて再実行してもよい。
ステージは自動で export に進む。「アプリの⑤から保存できます」と伝えて止まる。
