# poir-viewer

## Directory Structure

- poir-viewer/
  - .design/
  - .dev/
  - .github/
    - workflows/
      - build.yml
      - build.yml:Zone.Identifier
      - release.yml
      - release.yml:Zone.Identifier
  - .vscode/
  - public/
    - tauri.svg
    - vite.svg
  - src/
    - assets/
      - react.svg
    - App.css
    - App.tsx
    - main.tsx
    - vite-env.d.ts
  - src-tauri/
    - capabilities/
      - default.json
    - gen/
    - icons/
      - 128x128.png
      - 128x128@2x.png
      - 32x32.png
      - Square107x107Logo.png
      - Square142x142Logo.png
      - Square150x150Logo.png
      - Square284x284Logo.png
      - Square30x30Logo.png
      - Square310x310Logo.png
      - Square44x44Logo.png
      - Square71x71Logo.png
      - Square89x89Logo.png
      - StoreLogo.png
      - icon.icns
      - icon.ico
      - icon.png
    - src/
      - lib.rs
      - main.rs
    - .gitignore
    - Cargo.toml
    - build.rs
    - tauri.conf.json
  - index.html
  - package.json
  - resources.json
  - test-claude.json
  - tsconfig.json
  - tsconfig.node.json
  - vite.config.ts

## File Contents

### .design/進捗.md

```
# 進捗

## スタートデモアプリ済み

- dirダイアログから選択したファイルの内容（テキスト）を画面表示する
- "\\wsl.localhost\Ubuntu-24.04\home\wsluser\.claude.json" このファイルの中身を起動時に自動ロード、表示
- 

# NEXT

## 下記ファイルの自動読み込み表示したい

（プロジェクトルート）resources.json

{
    "id": "allviewer-resources",
    "name": "AllViewer画像リソース",
    "filters": {
      "include": [
        "\\\\wsl.localhost\\Ubuntu-24.04\\home\\wsluser\\temp-image\\plugin-viewers-image"
      ],
      "exclude": []
    }
}

```

### .github/workflows/build.yml

```
name: Build Application

on:
  push:
    branches: [ main ]
    # コミットメッセージに [build] タグがあるときのみ実行
    paths-ignore:
      - '**.md'
      - 'docs/**'
    tags-ignore:
      - 'v*'  # タグがプッシュされた場合は実行しない (release.ymlが担当)
  pull_request:
    branches: [ main ]
  # 手動実行のオプション
  workflow_dispatch:
    inputs:
      platform:
        description: 'Build platform (all, windows, macos, linux)'
        required: true
        default: 'all'
        type: choice
        options:
        - all
        - windows
        - macos
        - linux

jobs:
  check-commit-message:
    runs-on: ubuntu-latest
    outputs:
      should-run: ${{ steps.check.outputs.should-run }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # すべてのコミット履歴をフェッチ
      - id: check
        run: |
          echo "GitHub Event: ${{ github.event_name }}"
          COMMIT_MSG=$(git log -1 --pretty=%B)
          echo "Commit Message: $COMMIT_MSG"
          
          # 手動実行の場合は常に実行
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "Manual dispatch - always run"
            echo "should-run=true" >> $GITHUB_OUTPUT
            exit 0
          fi
          
          # コミットメッセージをチェック（大文字小文字を区別しない）
          if [[ "${COMMIT_MSG^^}" == *"[BUILD]"* ]]; then
            echo "Build tag detected"
            echo "should-run=true" >> $GITHUB_OUTPUT
          else
            echo "No build tag"
            echo "should-run=false" >> $GITHUB_OUTPUT
          fi
          
          # 不確定な状態の場合はデフォルトで実行
          if [[ "${{ steps.check.outputs.should-run }}" == "" ]]; then
            echo "Defaulting to run due to uncertain state"
            echo "should-run=true" >> $GITHUB_OUTPUT
          fi
        continue-on-error: true
        
  build:
    needs: check-commit-message
    # check-commit-messageジョブの結果に基づいて実行するかどうかを決定
    if: ${{ needs.check-commit-message.outputs.should-run == 'true' }}
    strategy:
      fail-fast: false
      matrix:
        platform: [windows-latest, macos-latest, ubuntu-latest]
        include:
          - platform: windows-latest
            name: windows
          - platform: macos-latest
            name: macos
          - platform: ubuntu-latest
            name: linux
    
    # 手動実行で特定のプラットフォームが選択された場合のフィルタリング
    # すでにcheck-commit-messageでワークフロー全体の実行可否は判断しているので
    # ここではプラットフォームの選択だけをフィルタリング
    runs-on: ${{ matrix.platform }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Check platform selection
        # 手動実行時のプラットフォーム選択をチェック
        # 選択されたプラットフォームのみを実行
        if: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.platform != 'all' && github.event.inputs.platform != matrix.name }}
        run: |
          echo "Skipping build for ${{ matrix.name }} platform as per selection"
          exit 1
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 10.4.1
          run_install: false
      
      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT
          
      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-
      
      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile
      
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
      
      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
      
      # Windows固有の設定
      - name: Install WebView2
        if: matrix.platform == 'windows-latest'
        run: |
          $installer = "$env:TEMP\MicrosoftEdgeWebView2Setup.exe"
          Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $installer
          Start-Process -FilePath $installer -Args "/silent /install" -Verb RunAs -Wait
      
      # macOS固有の設定
      - name: Install macOS dependencies
        if: matrix.platform == 'macos-latest'
        run: |
          rustup target add aarch64-apple-darwin
          brew install jq
      
      # Linux固有の設定
      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      
      - name: Install Tauri CLI
        run: pnpm add -D @tauri-apps/cli
      
      - name: Show Node.js and pnpm versions
        run: |
          node --version
          pnpm --version
          cat package.json
          cat pnpm-lock.yaml
          
      - name: Build the app
        run: pnpm tauri build
      
      # Windows用アーティファクトのアップロード
      - name: Upload Windows artifacts
        if: matrix.platform == 'windows-latest'
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe
      
      # macOS用アーティファクトのアップロード
      - name: Upload macOS artifacts
        if: matrix.platform == 'macos-latest'
        uses: actions/upload-artifact@v4
        with:
          name: macos-installer
          path: |
            src-tauri/target/release/bundle/dmg/*.dmg
            src-tauri/target/release/bundle/macos/*.app
      
      # Linux用アーティファクトのアップロード
      - name: Upload Linux artifacts
        if: matrix.platform == 'ubuntu-latest'
        uses: actions/upload-artifact@v4
        with:
          name: linux-installer
          path: |
            src-tauri/target/release/bundle/deb/*.deb
            src-tauri/target/release/bundle/appimage/*.AppImage

```

### .github/workflows/release.yml

```
name: Release

on:
  push:
    tags:
      - 'v*'
  # 手動リリース作成のオプション
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g. 1.0.0)'
        required: true
        type: string
      platform:
        description: 'Release platform (all, windows, macos, linux)'
        required: true
        default: 'all'
        type: choice
        options:
        - all
        - windows
        - macos
        - linux

jobs:
  create-release:
    runs-on: ubuntu-latest
    outputs:
      release_id: ${{ steps.create-release.outputs.id }}
      upload_url: ${{ steps.create-release.outputs.upload_url }}
      version: ${{ steps.get-version.outputs.version }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Get version from tag
        id: get-version
        if: startsWith(github.ref, 'refs/tags/')
        run: echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT
      
      - name: Get version from input
        id: get-input-version
        if: github.event_name == 'workflow_dispatch'
        run: echo "version=${{ github.event.inputs.version }}" >> $GITHUB_OUTPUT
      
      - name: Set final version
        id: set-version
        run: |
          if [ "${{ steps.get-version.outputs.version }}" != "" ]; then
            echo "version=${{ steps.get-version.outputs.version }}" >> $GITHUB_OUTPUT
          else
            echo "version=${{ steps.get-input-version.outputs.version }}" >> $GITHUB_OUTPUT
          fi
      
      - name: Create Release
        id: create-release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ steps.set-version.outputs.version }}
          release_name: Release v${{ steps.set-version.outputs.version }}
          draft: true
          prerelease: false

  build-release:
    needs: create-release
    strategy:
      fail-fast: false
      matrix:
        platform: [windows-latest, macos-latest, ubuntu-latest]
        include:
          - platform: windows-latest
            name: windows
            artifact_name: image-viewer_Windows_x64
            binary_path: "src-tauri/target/release/image-viewer.exe"
            asset_name: image-viewer-windows-x64
          - platform: macos-latest
            name: macos
            artifact_name: image-viewer_macOS_x64
            binary_path: "src-tauri/target/release/image-viewer"
            asset_name: image-viewer-macos-x64
          - platform: ubuntu-latest
            name: linux
            artifact_name: image-viewer_Linux_x64
            binary_path: "src-tauri/target/release/image-viewer"
            asset_name: image-viewer-linux-x64
    
    # 手動実行で特定のプラットフォームが選択された場合、その条件に合致するものだけを実行
    if: ${{ github.event.inputs.platform == 'all' || github.event.inputs.platform == matrix.name }}
    
    runs-on: ${{ matrix.platform }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 10.4.1
          run_install: false
      
      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT
          
      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
      
      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
      
      # Windows固有の設定
      - name: Install WebView2
        if: matrix.platform == 'windows-latest'
        run: |
          $installer = "$env:TEMP\MicrosoftEdgeWebView2Setup.exe"
          Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $installer
          Start-Process -FilePath $installer -Args "/silent /install" -Verb RunAs -Wait
      
      # macOS固有の設定
      - name: Install macOS dependencies
        if: matrix.platform == 'macos-latest'
        run: |
          rustup target add aarch64-apple-darwin
          brew install jq
      
      # Linux固有の設定
      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
      
      - name: Install Tauri CLI
        run: pnpm add -D @tauri-apps/cli
      
      - name: Build the app
        env:
          TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
        run: pnpm tauri build
      
      - name: Create release archives
        shell: bash
        run: |
          mkdir -p release-archives
          
          if [ "${{ matrix.platform }}" = "windows-latest" ]; then
            # Windows インストーラーを移動
            cp src-tauri/target/release/bundle/msi/*.msi release-archives/${{ matrix.asset_name }}.msi
            cp src-tauri/target/release/bundle/nsis/*.exe release-archives/${{ matrix.asset_name }}-setup.exe
          elif [ "${{ matrix.platform }}" = "macos-latest" ]; then
            # macOS バンドルを移動
            cp -r src-tauri/target/release/bundle/dmg/*.dmg release-archives/${{ matrix.asset_name }}.dmg
            # Universal Binary ビルド結果を移動 (もし設定していれば)
            if [ -d "src-tauri/target/universal-apple-darwin/release/bundle/dmg" ]; then
              cp -r src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg release-archives/${{ matrix.asset_name }}-universal.dmg
            fi
          elif [ "${{ matrix.platform }}" = "ubuntu-latest" ]; then
            # Linux パッケージを移動
            cp src-tauri/target/release/bundle/deb/*.deb release-archives/${{ matrix.asset_name }}.deb
            cp src-tauri/target/release/bundle/appimage/*.AppImage release-archives/${{ matrix.asset_name }}.AppImage
          fi
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: release-archives
      
  publish-release:
    needs: [create-release, build-release]
    runs-on: ubuntu-latest
    
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          
      - name: Prepare release assets
        run: |
          mkdir -p release-assets
          find artifacts -type f -exec cp {} release-assets/ \;
          ls -la release-assets/
      
      - name: Publish release assets
        uses: softprops/action-gh-release@v1
        with:
          files: release-assets/*
          tag_name: v${{ needs.create-release.outputs.version }}
          draft: true
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

```

### src/App.css

```
.logo.vite:hover {
  filter: drop-shadow(0 0 2em #747bff);
}

.logo.react:hover {
  filter: drop-shadow(0 0 2em #61dafb);
}
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;

  color: #0f0f0f;
  background-color: #f6f6f6;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

.container {
  margin: 0;
  padding-top: 10vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: 0.75s;
}

.logo.tauri:hover {
  filter: drop-shadow(0 0 2em #24c8db);
}

.row {
  display: flex;
  justify-content: center;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

h1 {
  text-align: center;
}

input,
button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  color: #0f0f0f;
  background-color: #ffffff;
  transition: border-color 0.25s;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
}

button {
  cursor: pointer;
}

button:hover {
  border-color: #396cd8;
}
button:active {
  border-color: #396cd8;
  background-color: #e8e8e8;
}

input,
button {
  outline: none;
}

#greet-input {
  margin-right: 5px;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #2f2f2f;
  }

  a:hover {
    color: #24c8db;
  }

  input,
  button {
    color: #ffffff;
    background-color: #0f0f0f98;
  }
  button:active {
    background-color: #0f0f0f69;
  }
}

```

### src/App.tsx

```
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  const [fileContent, setFileContent] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");
  
  // フロントエンド側でClaudeのJSONファイルパスを定義
  const claudeJsonPath = "/home/wsluser/.claude.json";

  // アプリ起動時に自動的にClaudeのJSONファイルを読み込む
  useEffect(() => {
    loadClaudeJson();
  }, []);

  async function loadClaudeJson() {
    try {
      // 定義したパスをRust側に渡す
      const content = await invoke<string>("read_file_content", { 
        filePath: claudeJsonPath
      });
      setFileContent(content);
      setLoadError("");
    } catch (error) {
      console.error("Error loading Claude JSON:", error);
      setLoadError(String(error));
    }
  }

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  const handleFileOpen = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });

      if (selected && typeof selected === "string") {
        const content = await readTextFile(selected);
        setFileContent(content);
        setLoadError("");
      }
    } catch (error) {
      console.error("Error has occured when read file: ", error);
      setLoadError(String(error));
    }
  };

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>Hello, {greetMsg}</p>

      <div>
        <button onClick={handleFileOpen}>Select File</button>
        <button onClick={loadClaudeJson}>Reload Claude JSON</button>
        
        {loadError && (
          <div style={{ color: "red", marginTop: "10px" }}>
            <h3>エラー:</h3>
            <p>{loadError}</p>
          </div>
        )}
        
        {fileContent && (
          <div>
            <h3>FileContent:</h3>
            <pre>{fileContent}</pre>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;

```

### src/main.tsx

```
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

```

### src/vite-env.d.ts

```
/// <reference types="vite/client" />

```

### src-tauri/capabilities/default.json

```
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "fs:default",
    {
      "identifier": "fs:allow-read-file",
      "allow": [{ "path": "\\\\wsl.localhost\\Ubuntu-24.04\\home\\wsluser\\.claude.json" }]
    }
  ]
}

```

### src-tauri/src/lib.rs

```
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// パスを受け取るように変更したコマンド
#[tauri::command]
async fn read_file_content(file_path: String) -> Result<String, String> {
    use std::fs;
    
    // 受け取ったパスでファイルを読み込む
    match fs::read_to_string(&file_path) {
        Ok(content) => Ok(content),
        Err(e) => {
            // エラーの詳細を返す
            Err(format!("Failed to read file: {} - {}", file_path, e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, read_file_content])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        let result = greet("Tauri");
        assert_eq!(result, "Hello, Tauri! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_empty_name() {
        let result = greet("");
        assert_eq!(result, "Hello, ! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_special_characters() {
        let result = greet("123!@#");
        assert_eq!(result, "Hello, 123!@#! You've been greeted from Rust!");
    }
}

```

### src-tauri/src/main.rs

```
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_app_lib::run()
}

```

### src-tauri/.gitignore

```
# Generated by Cargo
# will have compiled files and executables
/target/

# Generated by Tauri
# will have schema files for capabilities auto-completion
/gen/schemas

```

### src-tauri/Cargo.toml

```
[package]
name = "tauri-app"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
edition = "2021"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[lib]
# The `_lib` suffix may seem redundant but it is necessary
# to make the lib name unique and wouldn't conflict with the bin name.
# This seems to be only an issue on Windows, see https://github.com/rust-lang/cargo/issues/8519
name = "tauri_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
dirs = "5.0.1"

```

### src-tauri/build.rs

```
fn main() {
    tauri_build::build()
}

```

### src-tauri/tauri.conf.json

```
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "tauri-app",
  "version": "0.1.0",
  "identifier": "com.tauri-app.app",
  "build": {
    "beforeDevCommand": "yarn dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "yarn build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "tauri-app",
        "width": 800,
        "height": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}

```

### README.md

```
# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

```

### index.html

```
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tauri + React + Typescript</title>
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

### package.json

```
{
  "name": "poir-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-fs": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.6.2",
    "vite": "^6.0.3"
  },
  "pnpm": {
    "ignoredBuiltDependencies": [
      "esbuild"
    ],
    "onlyBuiltDependencies": [
      "esbuild"
    ]
  }
}

```

### resources.json

```
{
    "id": "allviewer-resources",
    "name": "AllViewer画像リソース",
    "filters": {
      "include": [
        "\\\\wsl.localhost\\Ubuntu-24.04\\home\\wsluser\\temp-image\\plugin-viewers-image"
      ],
      "exclude": []
    }
}

```

### test-claude.json

```
{
    "test": "/home/wsluser/output/poir-viewer/test-claude.json"
}

```

### tsconfig.json

```
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}

```

### tsconfig.node.json

```
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}

```

### vite.config.ts

```
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

```

