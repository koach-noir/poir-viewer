#!/bin/bash

# プロジェクトのルートディレクトリに移動
cd ~/projects/image-viewer

# Rustサイド（src-tauri/src/内）のディレクトリとファイル作成
mkdir -p src-tauri/src/core
mkdir -p src-tauri/src/plugins

# コアモジュールファイル作成
touch src-tauri/src/core/mod.rs
touch src-tauri/src/core/resource_manager.rs
touch src-tauri/src/core/image_collection.rs
touch src-tauri/src/core/plugin_manager.rs
touch src-tauri/src/core/event_bus.rs

# プラグインモジュールファイル作成
touch src-tauri/src/plugins/mod.rs
touch src-tauri/src/plugins/plugin_trait.rs
touch src-tauri/src/plugins/registry.rs

# 汎用ユーティリティファイル作成
touch src-tauri/src/utils.rs

# フロントエンドサイド（src/内）のディレクトリとファイル作成
mkdir -p src/core
mkdir -p src/plugins
mkdir -p src/components/common
mkdir -p src/config

# TypeScriptコアコンポーネントファイル作成
touch src/core/ImageManager.ts
touch src/core/PluginRegistry.ts
touch src/core/EventSystem.ts

# TypeScriptプラグイン関連ファイル作成
touch src/plugins/PluginInterface.ts
touch src/plugins/PluginLoader.ts

# UIコンポーネントファイル作成
touch src/components/PluginContainer.tsx
touch src/components/common/ImageViewer.tsx
touch src/components/common/ThumbnailGrid.tsx

# 設定管理ファイル作成
touch src/config/ConfigManager.ts

echo "コアコンポーネント用のファイル構造を作成しました。"
