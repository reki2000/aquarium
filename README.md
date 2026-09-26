# Aqualium

ブラウザで動くフォトリアルなヌマエビ（チェリーシュリンプ）水槽。three.js WebGPU + TSL。

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # 型チェック + 本番ビルド
```

## URL パラメータ

| パラメータ | 値 | 説明 |
|---|---|---|
| `quality` | `high`（既定）/ `medium` / `low` | 影解像度・AO・DOF・Bloom・パーティクル数 |
| `backend` | `webgl` | WebGL2 バックエンドを強制 |
| `shrimp` | 数値 | エビの数（既定 14） |
| `post` | `off` | ポストプロセスを無効化 |

右上の GUI でカメラ（オービット／エビ追従）、水の濁り・吸収、コースティクス、照明を調整できます。

## エビモデルの差し替え

`public/assets/shrimp/cherry.glb` を置くと自動で使われます。関節名・向きの仕様は [docs/shrimp-model-spec.md](docs/shrimp-model-spec.md)。

## スクリーンショット検証

```sh
npm run build && npx vite preview --port 5198 &
SHOT_QUERY="backend=webgl&quality=medium" CHROME_PATH=<chromium> npm run shot -- http://localhost:5198/ screenshots
```

計画と進捗は [docs/plan.md](docs/plan.md)。
