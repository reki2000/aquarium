# 実装計画

## 決定事項（2026-09-26）

| 項目 | 決定 |
|---|---|
| 主役 | チェリーシュリンプ（Neocaridina davidi） |
| ターゲット | デスクトップ優先（WebGPU、WebGL2 フォールバック。モバイルは低品質ティアで動けば可） |
| 用途 | 鑑賞用（オービット／マクロ追従カメラ） |
| エビモデル | ユーザーが glb を用意 → `docs/shrimp-model-spec.md` の仕様で差し込み。届くまでは手続き生成のプレースホルダー |

## 技術スタック

- three.js r186 `WebGPURenderer` + TSL（`three` は Vite で WebGPU ビルドにエイリアス）
- Vite + TypeScript、lil-gui
- 外部アセットゼロで動く（手続きテクスチャ・手続きジオメトリ）。差し替え可能なアセットは `public/assets/`

## 表現の要点と実装箇所

| 要素 | 手法 | 場所 |
|---|---|---|
| 水の色・濁り | カメラ→フラグメントの光線が水の直方体内を通る距離で Beer–Lambert 減衰＋散乱（`scene.fogNode`） | `src/materials/water.ts` |
| コースティクス | 上面 SpotLight の `colorNode` に TSL の手続きコースティクス（RGB を少しずらして分散） — 影付き | `src/materials/water.ts`, `src/scene/lighting.ts` |
| ガラス・水面 | transmission を使わない反射専用オーバーレイ（加算＋わずかな減衰）。ガラス端面は緑 | `src/materials/water.ts`, `src/scene/tank.ts` |
| ソイル・石・流木 | TSL 手続きマテリアル（Worley 粒、石目、木目）＋手続きジオメトリ | `src/materials/hardscape.ts`, `src/scene/hardscape.ts` |
| 浮遊物 | インスタンス化したスプライトを TSL でドリフト | `src/entities/particles.ts` |
| エビ | 剛体節の階層（外骨格なのでスキン不要）、SSS マテリアル、手続きアニメーション、行動ステートマシン | `src/entities/shrimp/` |
| ポスト | GTAO → Bloom → TRAA → DOF（品質ティアで切り替え） | `src/post/pipeline.ts` |

## フェーズ

| # | 内容 | 状態 |
|---|---|---|
| 0 | 土台（Vite/TS/three WebGPU、GUI、品質ティア、スクリーンショット検証スクリプト） | ✅ |
| 1 | 水槽と光（ガラス、水中の減衰、水面、コースティクス、照明、ポスト） | ✅ 初版 |
| 2 | レイアウト（ソイル、石組み、流木） | ✅ 初版（手続き） |
| 3 | 水草（ウィローモス、アヌビアス・ナナ、有茎草、揺れシェーダー） | 次 |
| 4 | エビ（静的な見た目） | ✅ プレースホルダー / ⏳ glb 待ち |
| 5 | リグとアニメーション（歩脚 IK で接地、石の上を歩く） | 🔶 FK 版のみ |
| 6 | 行動 AI（付着物マップ、脱皮殻、群れ密度） | 🔶 基本ステートマシン |
| 7 | 仕上げ（気泡、ゴッドレイ、水面下の全反射、HDRI の部屋） | 未 |
| 8 | 最適化（エビのドローコール統合、LOD、パストレーサー静止画モード） | 未 |

## 既知の課題

- 手続き生成のエビは1匹あたり約 80 メッシュ（14匹で約 1,100 ドローコール＋影）。glb 移行時に 1 SkinnedMesh になる予定
- ヘッドレス Chromium（SwiftShader）では WebGPU キャンバスがスクリーンショットに写らないため、自動検証は `backend=webgl` で行う
- 石・流木の上はエビが歩けない（障害物扱い）→ フェーズ 5 で高さ場を統合
