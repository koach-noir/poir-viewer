# プラグインディレクトリを作成
mkdir -p src-tauri/src/plugins/allviewer
mkdir -p src-tauri/src/plugins/findme

# Rust側のプラグインファイルを作成
touch src-tauri/src/plugins/allviewer/mod.rs
touch src-tauri/src/plugins/allviewer/ui.rs
touch src-tauri/src/plugins/findme/mod.rs
touch src-tauri/src/plugins/findme/ui.rs

# フロントエンド側のプラグインディレクトリを作成
mkdir -p src/plugins/allviewer
mkdir -p src/plugins/findme

# フロントエンド側のプラグインファイルを作成
touch src/plugins/allviewer/AllViewerPlugin.ts
touch src/plugins/allviewer/AllViewerUI.tsx
touch src/plugins/findme/FindMePlugin.ts
touch src/plugins/findme/FindMeUI.tsx

# 設定管理用の拡張ファイルを作成
mkdir -p src/config
touch src/config/ResourceDefinition.ts
