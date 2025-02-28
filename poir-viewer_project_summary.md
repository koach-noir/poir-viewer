# poir-viewer

## Directory Structure

- poir-viewer/
  - .design/
  - .dev/
  - .github/
    - workflows/
      - build.yml
      - release.yml
  - .vscode/
  - public/
    - tauri.svg
    - vite.svg
  - src/
    - assets/
      - react.svg
    - components/
      - ImageThumbnail.tsx
      - ImageViewer.tsx
      - ResourcesConfig.tsx
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
      - config.rs
      - image.rs
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
- "~\.claude.json" このファイルの中身を起動時に自動ロード、表示
- resources.json を設定ファイルとして扱う
- resources.json から画像を読み込み表示する

# NEXT

## 
```

### .github/workflows/build.yml

```
name: Build Application

# 環境変数の定義
env:
  NODE_VERSION: '20.x'
  PNPM_VERSION: '10.4.1'
  RUST_TOOLCHAIN: 'stable'

# トリガー条件
on:
  push:
    branches: [ main ]
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
  # ビルド実行の判断
  check-commit-message:
    runs-on: ubuntu-latest
    outputs:
      should-run: ${{ steps.check.outputs.should-run }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2  # 直前のコミットを取得するために必要

      - name: Check commit message for build tag
        id: check
        run: |
          echo "GitHub Event: ${{ github.event_name }}"
          
          # 手動実行の場合は常に実行
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "Manual dispatch - always run"
            echo "should-run=true" >> $GITHUB_OUTPUT
            exit 0
          fi
          
          # コミットメッセージをチェック
          COMMIT_MSG=$(git log -1 --pretty=%B)
          echo "Commit Message: $COMMIT_MSG"
          
          if [[ "${COMMIT_MSG^^}" == *"[BUILD]"* ]]; then
            echo "Build tag detected"
            echo "should-run=true" >> $GITHUB_OUTPUT
          else
            echo "No build tag found"
            echo "should-run=false" >> $GITHUB_OUTPUT
          fi
  
  # アプリケーションビルド
  build:
    needs: check-commit-message
    if: ${{ needs.check-commit-message.outputs.should-run == 'true' }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            name: windows
          - platform: macos-latest
            name: macos
          - platform: ubuntu-latest
            name: linux
    
    runs-on: ${{ matrix.platform }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Check platform selection
        id: platform-check
        if: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.platform != 'all' && github.event.inputs.platform != matrix.name }}
        run: |
          echo "Skipping build for ${{ matrix.name }} platform as per selection"
          exit 0
      
      # Node.js環境の設定
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      # pnpmのインストールと設定
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}
          run_install: false
      
      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT
          
      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-
      
      - name: Install dependencies
        run: pnpm install
      
      # Rust環境の設定
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: ${{ env.RUST_TOOLCHAIN }}
      
      - name: Setup Rust cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
      
      # Windows固有の設定
      - name: Install WebView2 (Windows)
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
      
      # Tauri CLIのインストール
      - name: Install Tauri CLI
        run: pnpm add -D @tauri-apps/cli
      
      - name: Show environment info
        run: |
          node --version
          pnpm --version
          rustc --version
          cargo --version
          
      # アプリのビルド
      - name: Build the app
        id: build
        run: pnpm tauri build
        continue-on-error: false
      
      # Windows用アーティファクトのアップロード
      - name: Upload Windows artifacts
        if: matrix.platform == 'windows-latest' && steps.build.outcome == 'success'
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe
          retention-days: 7
      
      # macOS用アーティファクトのアップロード
      - name: Upload macOS artifacts
        if: matrix.platform == 'macos-latest' && steps.build.outcome == 'success'
        uses: actions/upload-artifact@v4
        with:
          name: macos-installer
          path: |
            src-tauri/target/release/bundle/dmg/*.dmg
            src-tauri/target/release/bundle/macos/*.app
          retention-days: 7
      
      # Linux用アーティファクトのアップロード
      - name: Upload Linux artifacts
        if: matrix.platform == 'ubuntu-latest' && steps.build.outcome == 'success'
        uses: actions/upload-artifact@v4
        with:
          name: linux-installer
          path: |
            src-tauri/target/release/bundle/deb/*.deb
            src-tauri/target/release/bundle/appimage/*.AppImage
          retention-days: 7

      # ビルド結果の通知（Slackやメール通知などを追加可能）
      - name: Notify build status
        if: always()
        run: |
          if [[ "${{ steps.build.outcome }}" == "success" ]]; then
            echo "✅ Build successful for ${{ matrix.name }}"
          else
            echo "❌ Build failed for ${{ matrix.name }}"
          fi

```

### .github/workflows/release.yml

```
name: Release

# 環境変数の定義
env:
  NODE_VERSION: '20.x'
  PNPM_VERSION: '10.4.1'
  RUST_TOOLCHAIN: 'stable'
  DRAFT_RELEASE: true  # リリースをドラフトとして作成するかどうか
  PRERELEASE: false    # プレリリースとしてマークするかどうか

# トリガー条件
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
  # リリース作成ジョブ
  create-release:
    runs-on: ubuntu-latest
    outputs:
      release_id: ${{ steps.create-release.outputs.id }}
      upload_url: ${{ steps.create-release.outputs.upload_url }}
      version: ${{ steps.set-version.outputs.version }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      # タグからバージョンを取得
      - name: Get version from tag
        id: get-version
        if: startsWith(github.ref, 'refs/tags/')
        run: echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT
      
      # 手動入力からバージョンを取得
      - name: Get version from input
        id: get-input-version
        if: github.event_name == 'workflow_dispatch'
        run: echo "version=${{ github.event.inputs.version }}" >> $GITHUB_OUTPUT
      
      # 最終バージョンを設定
      - name: Set final version
        id: set-version
        run: |
          if [ "${{ steps.get-version.outputs.version }}" != "" ]; then
            echo "version=${{ steps.get-version.outputs.version }}" >> $GITHUB_OUTPUT
          else
            echo "version=${{ steps.get-input-version.outputs.version }}" >> $GITHUB_OUTPUT
          fi
      
      # リリース作成（GitHub Scriptを使用した最新の方法）
      - name: Create GitHub Release
        id: create-release
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const { data } = await github.rest.repos.createRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              tag_name: `v${process.env.VERSION}`,
              name: `Release v${process.env.VERSION}`,
              draft: ${{ env.DRAFT_RELEASE }},
              prerelease: ${{ env.PRERELEASE }},
              generate_release_notes: true
            });
            
            core.setOutput('id', data.id);
            core.setOutput('upload_url', data.upload_url);
            return data;
        env:
          VERSION: ${{ steps.set-version.outputs.version }}

  # ビルドとリリースアセット作成ジョブ
  build-release:
    needs: create-release
    strategy:
      fail-fast: false
      matrix:
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
    if: ${{ github.event.inputs.platform == 'all' || github.event.inputs.platform == matrix.name || github.event_name == 'push' }}
    
    runs-on: ${{ matrix.platform }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      # Node.js環境の設定
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      # pnpmのインストールと設定
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}
          run_install: false
      
      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT
          
      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-
      
      - name: Install dependencies
        run: pnpm install
      
      # Rust環境の設定
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: ${{ env.RUST_TOOLCHAIN }}
      
      - name: Setup Rust cache
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
      
      # Windows固有の設定
      - name: Install WebView2 (Windows)
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
      
      # Tauri CLIのインストール
      - name: Install Tauri CLI
        run: pnpm add -D @tauri-apps/cli
      
      # アプリのビルドと署名
      - name: Build the app
        id: build
        env:
          TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
          # バージョン情報を環境変数として設定
          APP_VERSION: ${{ needs.create-release.outputs.version }}
        run: |
          echo "Building version $APP_VERSION for ${{ matrix.name }}"
          pnpm tauri build
      
      # リリースアーカイブの作成
      - name: Create release archives
        id: create-archives
        shell: bash
        run: |
          mkdir -p release-archives
          
          # プラットフォームに応じたファイル処理
          if [ "${{ matrix.platform }}" = "windows-latest" ]; then
            # Windows インストーラーを移動
            cp src-tauri/target/release/bundle/msi/*.msi release-archives/${{ matrix.asset_name }}.msi
            cp src-tauri/target/release/bundle/nsis/*.exe release-archives/${{ matrix.asset_name }}-setup.exe
            echo "Created Windows installers"
          elif [ "${{ matrix.platform }}" = "macos-latest" ]; then
            # macOS バンドルを移動
            cp -r src-tauri/target/release/bundle/dmg/*.dmg release-archives/${{ matrix.asset_name }}.dmg
            echo "Created macOS DMG"
            
            # Universal Binary ビルド結果を移動 (もし設定していれば)
            if [ -d "src-tauri/target/universal-apple-darwin/release/bundle/dmg" ]; then
              cp -r src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg release-archives/${{ matrix.asset_name }}-universal.dmg
              echo "Created Universal macOS DMG"
            fi
          elif [ "${{ matrix.platform }}" = "ubuntu-latest" ]; then
            # Linux パッケージを移動
            cp src-tauri/target/release/bundle/deb/*.deb release-archives/${{ matrix.asset_name }}.deb
            cp src-tauri/target/release/bundle/appimage/*.AppImage release-archives/${{ matrix.asset_name }}.AppImage
            echo "Created Linux packages"
          fi
          
          # ファイル一覧を表示
          echo "Created files:"
          ls -la release-archives/
      
      # アーティファクトのアップロード
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: release-archives
          retention-days: 7

  # リリースアセットの公開ジョブ
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
          echo "Prepared release assets:"
          ls -la release-assets/
      
      # GitHub Scriptを使用してリリースアセットをアップロード
      - name: Upload release assets
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const path = require('path');
            
            // リリースアセットのディレクトリ
            const assetDir = 'release-assets';
            const files = fs.readdirSync(assetDir);
            
            // 各ファイルをリリースにアップロード
            for (const file of files) {
              const filePath = path.join(assetDir, file);
              
              console.log(`Uploading ${filePath}...`);
              
              // ファイルをリリースにアップロード
              await github.rest.repos.uploadReleaseAsset({
                owner: context.repo.owner,
                repo: context.repo.repo,
                release_id: ${{ needs.create-release.outputs.release_id }},
                name: file,
                data: fs.readFileSync(filePath)
              });
            }
            
            console.log('All assets uploaded successfully!');

      # リリース結果の通知
      - name: Notify release completion
        run: |
          echo "✅ Release v${{ needs.create-release.outputs.version }} has been published!"
          echo "Release URL: https://github.com/${{ github.repository }}/releases/tag/v${{ needs.create-release.outputs.version }}"
          
          if [[ "${{ env.DRAFT_RELEASE }}" == "true" ]]; then
            echo "This is a draft release. Please review and publish it manually."
          fi

```

### src/components/ImageThumbnail.tsx

```
import _React, { useState } from 'react';
import { convertFileSrc } from "@tauri-apps/api/core";

// 画像情報の型定義
export interface ImageInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
  extension: string;
}

interface ImageThumbnailProps {
  image: ImageInfo;
  selected: boolean;
  onClick: (image: ImageInfo) => void;
  size?: 'small' | 'medium' | 'large';
}

/**
 * 画像サムネイルを表示するコンポーネント
 */
export function ImageThumbnail({ image, selected, onClick, size = 'medium' }: ImageThumbnailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 画像のローカルパスをassetプロトコルに変換
  const imageUrl = convertFileSrc(image.path);

  // サイズに応じたスタイル
  const sizeStyles = {
    small: { width: '100px', height: '100px' },
    medium: { width: '150px', height: '150px' },
    large: { width: '200px', height: '200px' },
  };

  // 画像ロード完了時のハンドラ
  const handleImageLoad = () => {
    setLoading(false);
    setError(false);
  };

  // 画像ロードエラー時のハンドラ
  const handleImageError = () => {
    setLoading(false);
    setError(true);
  };

  // ファイル名を短縮表示（長すぎる場合）
  const displayName = () => {
    if (image.name.length > 20) {
      return image.name.substring(0, 17) + '...';
    }
    return image.name;
  };

  // 日付をフォーマット
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  return (
    <div 
      className={`image-thumbnail ${selected ? 'selected' : ''}`}
      onClick={() => onClick(image)}
      title={`${image.name}\n${formatDate(image.modified)}\n${(image.size / 1024).toFixed(1)} KB`}
    >
      <div className="thumbnail-container" style={sizeStyles[size]}>
        {loading && (
          <div className="loading-indicator">
            <span>読み込み中...</span>
          </div>
        )}
        
        {error ? (
          <div className="error-indicator">
            <span>!</span>
          </div>
        ) : (
          <img 
            src={imageUrl} 
            alt={image.name}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: loading ? 'none' : 'block' }}
          />
        )}
      </div>
      
      <div className="thumbnail-info">
        <span className="thumbnail-name">{displayName()}</span>
        <span className="thumbnail-date">{formatDate(image.modified)}</span>
      </div>

      <style>{`
        .image-thumbnail {
          display: flex;
          flex-direction: column;
          margin: 8px;
          border-radius: 4px;
          overflow: hidden;
          cursor: pointer;
          background-color: #f5f5f5;
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }
        
        .image-thumbnail:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        
        .image-thumbnail.selected {
          border-color: #2196f3;
          box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
        }
        
        .thumbnail-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background-color: #e0e0e0;
        }
        
        .thumbnail-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .loading-indicator,
        .error-indicator {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .loading-indicator {
          background-color: rgba(0, 0, 0, 0.1);
          color: #555;
        }
        
        .error-indicator {
          background-color: rgba(244, 67, 54, 0.1);
          color: #f44336;
          font-size: 32px;
          font-weight: bold;
        }
        
        .thumbnail-info {
          padding: 4px 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .thumbnail-name {
          font-size: 14px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .thumbnail-date {
          font-size: 12px;
          color: #777;
        }
        
        @media (prefers-color-scheme: dark) {
          .image-thumbnail {
            background-color: #333;
          }
          
          .thumbnail-container {
            background-color: #222;
          }
          
          .loading-indicator {
            background-color: rgba(255, 255, 255, 0.1);
            color: #bbb;
          }
          
          .thumbnail-name {
            color: #e0e0e0;
          }
          
          .thumbnail-date {
            color: #999;
          }
        }
      `}</style>
    </div>
  );
}

export default ImageThumbnail;

```

### src/components/ImageViewer.tsx

```
import _React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ImageThumbnail, { ImageInfo } from './ImageThumbnail';

// 画像リスト取得結果の型
interface ImageListResult {
  images: ImageInfo[];
  total: number;
  folders: string[];
}

// ビューモード
type ViewMode = 'grid' | 'detail';

// 表示サイズ
type ThumbnailSize = 'small' | 'medium' | 'large';

// ImageViewerコンポーネントのプロップス
interface ImageViewerProps {
  resourceConfig?: {
    id: string;
    name: string;
    filters: {
      include: string[];
      exclude: string[];
    };
  } | null;
}

/**
 * 画像ビューアーコンポーネント
 */
export function ImageViewer({ resourceConfig }: ImageViewerProps) {
  // 状態管理
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [totalImages, setTotalImages] = useState<number>(0);
  const [loadedFolders, setLoadedFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>('medium');
  
  // ページネーション
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [itemsPerPage, _setItemsPerPage] = useState<number>(50);

  // 初期ロード
  useEffect(() => {
    loadImages();
    
    // イベントリスナーを設定
    const unlistenError = listen<string>("image-error", (event) => {
      setError(event.payload);
    });
    
    return () => {
      // クリーンアップ
      unlistenError.then(fn => fn());
    };
  }, [resourceConfig]);
  
  // ページ変更時の画像読み込み
  useEffect(() => {
    loadPagedImages(currentPage);
  }, [currentPage, itemsPerPage]);

  // 画像リストを読み込む
  const loadImages = async () => {
    if (!resourceConfig || resourceConfig.filters.include.length === 0) {
      setError("有効なリソースフォルダが設定されていません");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // 最初のページをロード
      await loadPagedImages(0);
    } catch (err) {
      console.error("画像読み込みエラー:", err);
      setError(`画像の読み込みに失敗しました: ${err}`);
      setLoading(false);
    }
  };
  
  // ページングされた画像を読み込む
  const loadPagedImages = async (page: number) => {
    try {
      setLoading(true);
      
      const result = await invoke<ImageListResult>("get_paginated_images", {
        page,
        itemsPerPage
      });
      
      setImages(result.images);
      setTotalImages(result.total);
      setLoadedFolders(result.folders);
      
      if (result.images.length > 0 && !selectedImage) {
        setSelectedImage(result.images[0]);
      }
    } catch (err) {
      console.error("画像ページング読み込みエラー:", err);
      setError(`画像の読み込みに失敗しました: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // サムネイルクリック時のハンドラ
  const handleThumbnailClick = (image: ImageInfo) => {
    setSelectedImage(image);
    setViewMode('detail');
  };

  // 前の画像に移動
  const goToPreviousImage = () => {
    if (!selectedImage || images.length === 0) return;
    
    const currentIndex = images.findIndex(img => img.path === selectedImage.path);
    if (currentIndex > 0) {
      setSelectedImage(images[currentIndex - 1]);
    } else if (currentPage > 0) {
      // 前のページの最後の画像に移動
      setCurrentPage(currentPage - 1);
      // ページロード後に最後の画像を選択する処理は別途必要
    }
  };

  // 次の画像に移動
  const goToNextImage = () => {
    if (!selectedImage || images.length === 0) return;
    
    const currentIndex = images.findIndex(img => img.path === selectedImage.path);
    if (currentIndex < images.length - 1) {
      setSelectedImage(images[currentIndex + 1]);
    } else if ((currentPage + 1) * itemsPerPage < totalImages) {
      // 次のページの最初の画像に移動
      setCurrentPage(currentPage + 1);
      // ページロード後に最初の画像を選択する処理は別途必要
    }
  };

  // グリッド表示に戻る
  const backToGrid = () => {
    setViewMode('grid');
  };

  // サムネイルサイズを変更
  const changeThumbnailSize = (size: ThumbnailSize) => {
    setThumbnailSize(size);
  };
  
  // 総ページ数を計算
  const totalPages = Math.ceil(totalImages / itemsPerPage);
  
  // ページを変更
  const changePage = (page: number) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  };

  // 詳細表示モード
  const renderDetailView = () => {
    if (!selectedImage) return null;
    
    const imageUrl = convertFileSrc(selectedImage.path);
    
    return (
      <div className="detail-view">
        <div className="detail-header">
          <button onClick={backToGrid} className="back-button">
            ← グリッドに戻る
          </button>
          <div className="image-navigation">
            <button 
              onClick={goToPreviousImage} 
              disabled={currentPage === 0 && images.indexOf(selectedImage) === 0}
            >
              前の画像
            </button>
            <span className="image-counter">
              {images.indexOf(selectedImage) + 1 + (currentPage * itemsPerPage)} / {totalImages}
            </span>
            <button 
              onClick={goToNextImage} 
              disabled={(currentPage + 1) * itemsPerPage >= totalImages && 
                images.indexOf(selectedImage) === images.length - 1}
            >
              次の画像
            </button>
          </div>
        </div>
        
        <div className="detail-content">
          <img src={imageUrl} alt={selectedImage.name} className="detail-image" />
        </div>
        
        <div className="detail-info">
          <h3>{selectedImage.name}</h3>
          <p>サイズ: {(selectedImage.size / 1024).toFixed(1)} KB</p>
          <p>更新日: {new Date(selectedImage.modified * 1000).toLocaleDateString()}</p>
          <p>タイプ: {selectedImage.extension.toUpperCase()}</p>
        </div>
      </div>
    );
  };

  // グリッド表示モード
  const renderGridView = () => {
    return (
      <div className="grid-view">
        <div className="grid-header">
          <div className="grid-info">
            <h2>画像ギャラリー</h2>
            <span>{totalImages} 画像 ({loadedFolders.length} フォルダ)</span>
          </div>
          
          <div className="grid-controls">
            <div className="size-controls">
              <button 
                onClick={() => changeThumbnailSize('small')} 
                className={thumbnailSize === 'small' ? 'active' : ''}
              >
                小
              </button>
              <button 
                onClick={() => changeThumbnailSize('medium')} 
                className={thumbnailSize === 'medium' ? 'active' : ''}
              >
                中
              </button>
              <button 
                onClick={() => changeThumbnailSize('large')} 
                className={thumbnailSize === 'large' ? 'active' : ''}
              >
                大
              </button>
            </div>
            
            <div className="pagination-controls">
              <button 
                onClick={() => changePage(0)} 
                disabled={currentPage === 0}
              >
                &#171; 最初
              </button>
              <button 
                onClick={() => changePage(currentPage - 1)} 
                disabled={currentPage === 0}
              >
                &#8249; 前へ
              </button>
              <span>ページ {currentPage + 1} / {totalPages}</span>
              <button 
                onClick={() => changePage(currentPage + 1)} 
                disabled={currentPage >= totalPages - 1}
              >
                次へ &#8250;
              </button>
              <button 
                onClick={() => changePage(totalPages - 1)} 
                disabled={currentPage >= totalPages - 1}
              >
                最後 &#187;
              </button>
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="loading-container">
            <p>画像を読み込み中...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <p>{error}</p>
            <button onClick={loadImages}>再試行</button>
          </div>
        ) : images.length === 0 ? (
          <div className="empty-container">
            <p>画像が見つかりませんでした</p>
          </div>
        ) : (
          <div className={`image-grid size-${thumbnailSize}`}>
            {images.map((image) => (
              <ImageThumbnail
                key={image.path}
                image={image}
                selected={selectedImage?.path === image.path}
                onClick={handleThumbnailClick}
                size={thumbnailSize}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="image-viewer">
      {viewMode === 'grid' ? renderGridView() : renderDetailView()}
      
      <style>{`
        .image-viewer {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        /* Grid View Styles */
        .grid-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .grid-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background-color: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .grid-info h2 {
          margin: 0;
          margin-bottom: 4px;
        }
        
        .grid-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .size-controls,
        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .image-grid {
          display: flex;
          flex-wrap: wrap;
          padding: 10px;
          overflow-y: auto;
          justify-content: flex-start;
          align-content: flex-start;
        }
        
        .image-grid.size-small {
          gap: 4px;
        }
        
        .image-grid.size-medium {
          gap: 8px;
        }
        
        .image-grid.size-large {
          gap: 12px;
        }
        
        .loading-container,
        .error-container,
        .empty-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }
        
        .error-container {
          color: #f44336;
        }
        
        /* Detail View Styles */
        .detail-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background-color: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .image-navigation {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .image-counter {
          margin: 0 10px;
        }
        
        .detail-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #222;
          overflow: auto;
        }
        
        .detail-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        
        .detail-info {
          padding: 10px;
          background-color: #f5f5f5;
          border-top: 1px solid #e0e0e0;
        }
        
        .detail-info h3 {
          margin-top: 0;
          margin-bottom: 8px;
        }
        
        .detail-info p {
          margin: 4px 0;
        }
        
        button {
          padding: 6px 12px;
          border: 1px solid #ccc;
          background-color: #fff;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        button:hover:not(:disabled) {
          background-color: #f0f0f0;
        }
        
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        button.active {
          background-color: #2196f3;
          color: white;
          border-color: #1976d2;
        }
        
        @media (prefers-color-scheme: dark) {
          .grid-header, .detail-header, .detail-info {
            background-color: #333;
            border-color: #444;
          }
          
          .detail-content {
            background-color: #111;
          }
          
          button {
            background-color: #444;
            border-color: #555;
            color: #e0e0e0;
          }
          
          button:hover:not(:disabled) {
            background-color: #555;
          }
          
          button.active {
            background-color: #2196f3;
            color: white;
          }
        }
      `}</style>
    </div>
  );
}

export default ImageViewer;
```

### src/components/ResourcesConfig.tsx

```
import { useState, useEffect, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// 設定ファイルの型定義
interface ResourceConfig {
  id: string;
  name: string;
  filters: {
    include: string[];
    exclude: string[];
  };
}

// 初期設定
const defaultConfig: ResourceConfig = {
  id: "allviewer-resources",
  name: "AllViewer画像リソース",
  filters: {
    include: [],
    exclude: []
  }
};

export function ResourcesConfig() {
  // 状態管理
  const [config, setConfig] = useState<ResourceConfig>(defaultConfig);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [pathStatus, setPathStatus] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConfigValid, setIsConfigValid] = useState<boolean>(false);
  
  // 直接パス入力のための状態
  const [inputPath, setInputPath] = useState<string>("");
  const [isInputPathValid, setIsInputPathValid] = useState<boolean>(true);
  const [inputPathError, setInputPathError] = useState<string>("");

  // 初期ロード
  useEffect(() => {
    loadConfig();
  }, []);

  // 設定の有効性チェックを依存関係として追加
  useEffect(() => {
    validateConfig();
  }, [config]);

  // 設定ファイルをロードする
  async function loadConfig() {
    try {
      setLoading(true);
      setError("");
      
      // バックエンドから設定をロード
      const loadedConfig = await invoke<ResourceConfig>("load_resource_config");
      setConfig(loadedConfig);
      
      // 設定の有効性をチェック
      validateConfig(loadedConfig);
    } catch (err) {
      setError(`設定ファイルのロードに失敗しました: ${err}`);
      console.error("Config load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // 設定の有効性をチェック
  async function validateConfig(configToValidate?: ResourceConfig) {
    const configToCheck = configToValidate || config;
    try {
      if (configToCheck.filters.include.length === 0) {
        setPathStatus("リソースフォルダが設定されていません。");
        setIsConfigValid(false);
        return;
      }

      // すべてのパスを検証
      const results = await Promise.all(
        configToCheck.filters.include.map(path => 
          invoke<boolean>("validate_resource_path", { path })
        )
      );

      const isValid = results.every(result => result === true);
      setIsConfigValid(isValid);
      
      if (isValid) {
        setPathStatus("有効なリソースフォルダが設定されています。");
      } else {
        setPathStatus("一部のフォルダにアクセスできません。");
      }
    } catch (err) {
      setError(`設定の検証に失敗しました: ${err}`);
      setIsConfigValid(false);
    }
  }

  // フォルダ選択ダイアログを表示
  async function handleSelectFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "リソースフォルダを選択"
      });

      if (selected && typeof selected === "string") {
        addPath(selected);
      }
    } catch (err) {
      setError(`フォルダの選択に失敗しました: ${err}`);
    }
  }

  // 入力パスの検証
  async function validateInputPath(path: string): Promise<boolean> {
    if (!path.trim()) {
      setInputPathError("パスを入力してください");
      setIsInputPathValid(false);
      return false;
    }

    try {
      const isValid = await invoke<boolean>("validate_resource_path", { path });
      setIsInputPathValid(isValid);
      
      if (!isValid) {
        setInputPathError("無効なパスです。読み取り可能なディレクトリを指定してください。");
      } else {
        setInputPathError("");
      }
      
      return isValid;
    } catch (err) {
      setInputPathError(`パスの検証中にエラーが発生しました: ${err}`);
      setIsInputPathValid(false);
      return false;
    }
  }

  // 入力パスの変更ハンドラ
  async function handleInputPathChange(e: React.ChangeEvent<HTMLInputElement>) {
    const path = e.target.value;
    setInputPath(path);
    
    // 入力が空の場合はエラーをクリア
    if (!path.trim()) {
      setInputPathError("");
      setIsInputPathValid(true);
      return;
    }
    
    // 短いディレイを入れて、ユーザーが入力を完了するまで検証を遅らせる
    setTimeout(() => {
      validateInputPath(path);
    }, 500);
  }

  // フォームのサブミットハンドラ
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inputPath.trim()) return;
    
    const isValid = await validateInputPath(inputPath);
    if (isValid) {
      addPath(inputPath);
      setInputPath(""); // 入力をクリア
    }
  }

  // パスを追加する共通関数
  async function addPath(path: string) {
    // 既に存在するパスなら何もしない
    if (config.filters.include.includes(path)) {
      setError("このパスは既に追加されています。");
      return;
    }

    // 選択したパスを検証
    const isValid = await invoke<boolean>("validate_resource_path", { path });
    
    if (isValid) {
      // 設定を更新
      const updatedConfig = {
        ...config,
        filters: {
          ...config.filters,
          include: [...config.filters.include, path]
        }
      };
      
      setConfig(updatedConfig);
      
      // 更新された設定を保存
      await saveConfig(updatedConfig);
    } else {
      setError("選択したフォルダは無効です。");
    }
  }

  // パスを削除
  function handleRemovePath(pathToRemove: string) {
    const updatedConfig = {
      ...config,
      filters: {
        ...config.filters,
        include: config.filters.include.filter(path => path !== pathToRemove)
      }
    };
    
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
  }

  // 設定を保存
  async function saveConfig(configToSave?: ResourceConfig) {
    try {
      setIsSaving(true);
      setError("");
      
      const configToUpdate = configToSave || config;
      
      // バックエンドに保存
      await invoke("save_resource_config", { config: configToUpdate });
      
      setPathStatus("設定を保存しました。");
    } catch (err) {
      setError(`設定の保存に失敗しました: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }

  // サポート関数：パスを短く表示
  function getDisplayPath(path: string): string {
    const maxLength = 50;
    if (path.length <= maxLength) return path;
    
    // パスの先頭と末尾を表示し、中間を省略
    const start = path.substring(0, 20);
    const end = path.substring(path.length - 27);
    return `${start}...${end}`;
  }

  return (
    <div className="resource-config">
      <h2>リソース設定</h2>
      
      {loading ? (
        <p>設定を読み込み中...</p>
      ) : (
        <>
          <div className="config-status">
            <div className={`status-indicator ${isConfigValid ? 'valid' : 'invalid'}`}>
              {isConfigValid ? '✓' : '⚠'}
            </div>
            <span>{pathStatus}</span>
          </div>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={() => setError("")}>閉じる</button>
            </div>
          )}
          
          <div className="resource-folders">
            <h3>リソースフォルダ</h3>
            
            {/* 新しいパス入力フォーム */}
            <form onSubmit={handleSubmit} className="path-input-form">
              <div className="input-group">
                <label htmlFor="path-input">フォルダパス:</label>
                <div className="path-input-container">
                  <input
                    id="path-input"
                    type="text"
                    value={inputPath}
                    onChange={handleInputPathChange}
                    placeholder="パスを入力または選択してください"
                    className={!isInputPathValid ? "invalid" : ""}
                  />
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    disabled={isSaving}
                    className="browse-button"
                  >
                    参照...
                  </button>
                </div>
              </div>
              
              {inputPathError && (
                <div className="input-error">{inputPathError}</div>
              )}
              
              <button 
                type="submit"
                disabled={isSaving || !isInputPathValid || !inputPath.trim()}
                className="add-path-button"
              >
                追加
              </button>
            </form>
            
            {config.filters.include.length === 0 ? (
              <p>リソースフォルダが設定されていません。上のフォームからフォルダを追加してください。</p>
            ) : (
              <ul className="folder-list">
                {config.filters.include.map((path, index) => (
                  <li key={index} className="folder-item">
                    <span title={path}>{getDisplayPath(path)}</span>
                    <button 
                      onClick={() => handleRemovePath(path)}
                      disabled={isSaving}
                      className="remove-btn"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
            
            <div className="actions">
              <button 
                onClick={() => saveConfig()} 
                disabled={isSaving || config.filters.include.length === 0}
                className="save-btn"
              >
                設定を保存
              </button>
            </div>
          </div>
        </>
      )}
      
      <style>{`
        .resource-config {
          padding: 1rem;
          border-radius: 8px;
          background-color: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin-bottom: 1rem;
        }
        
        .config-status {
          display: flex;
          align-items: center;
          margin-bottom: 1rem;
          padding: 0.5rem;
          border-radius: 4px;
          background-color: #f5f5f5;
        }
        
        .status-indicator {
          display: inline-flex;
          justify-content: center;
          align-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          margin-right: 0.5rem;
          font-weight: bold;
        }
        
        .valid {
          background-color: #4caf50;
          color: white;
        }
        
        .invalid {
          background-color: #ff9800;
          color: white;
        }
        
        .error-message {
          padding: 0.5rem;
          border-radius: 4px;
          background-color: #ffebee;
          color: #d32f2f;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .path-input-form {
          margin-bottom: 1.5rem;
          background-color: #f9f9f9;
          padding: 1rem;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
        }
        
        .input-group {
          margin-bottom: 0.5rem;
        }
        
        .path-input-container {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        
        label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 500;
        }
        
        input[type="text"] {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 1rem;
        }
        
        input[type="text"].invalid {
          border-color: #f44336;
        }
        
        .input-error {
          color: #f44336;
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
        }
        
        .browse-button {
          white-space: nowrap;
          padding: 0.5rem 1rem;
          background-color: #f5f5f5;
          border: 1px solid #ccc;
        }
        
        .add-path-button {
          padding: 0.5rem 1rem;
          background-color: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
        }
        
        .folder-list {
          list-style: none;
          padding: 0;
          margin: 0 0 1rem 0;
        }
        
        .folder-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          border-radius: 4px;
          background-color: #f5f5f5;
          margin-bottom: 0.5rem;
        }
        
        .actions {
          display: flex;
          gap: 0.5rem;
        }
        
        button {
          border-radius: 4px;
          border: none;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .save-btn {
          background-color: #4caf50;
          color: white;
        }
        
        .remove-btn {
          background-color: #f44336;
          color: white;
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        button:hover:not(:disabled) {
          opacity: 0.9;
        }
        
        @media (prefers-color-scheme: dark) {
          .resource-config {
            background-color: #333;
            color: #f5f5f5;
          }
          
          .config-status, .folder-item {
            background-color: #444;
            color: #f5f5f5;
          }
          
          .error-message {
            background-color: #4a1c1c;
            color: #ffcdd2;
          }
          
          .path-input-form {
            background-color: #3a3a3a;
            border-color: #555;
          }
          
          input[type="text"] {
            background-color: #444;
            color: #fff;
            border-color: #555;
          }
          
          .browse-button {
            background-color: #555;
            color: #fff;
            border-color: #666;
          }
        }
      `}</style>
    </div>
  );
}

export default ResourcesConfig;
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
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import ResourcesConfig from "./components/ResourcesConfig";
import ImageViewer from "./components/ImageViewer";
import "./App.css";

// ResourceConfigの型定義
interface ResourceConfig {
  id: string;
  name: string;
  filters: {
    include: string[];
    exclude: string[];
  };
}

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [fileContent, setFileContent] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");
  const [showResourceConfig, setShowResourceConfig] = useState(false);
  const [resourceConfig, setResourceConfig] = useState<ResourceConfig | null>(null);
  const [configValid, setConfigValid] = useState<boolean>(false);
  const [showImageViewer, setShowImageViewer] = useState<boolean>(false);
  const [resourcesJsonPath, setResourcesJsonPath] = useState<string>("");
  const [isLoadingPath, setIsLoadingPath] = useState<boolean>(true);

  // アプリ起動時の処理
  useEffect(() => {
    // 設定ファイルパスの取得
    async function fetchConfigPath() {
      try {
        setIsLoadingPath(true);
        // Rust側の関数を呼び出して設定ファイルのパスを取得
        const configPath = await invoke<string>("get_config_path");
        setResourcesJsonPath(configPath);
        console.log("設定ファイルパス:", configPath);
      } catch (error) {
        console.error("設定ファイルパスの取得に失敗:", error);
        setLoadError(`設定ファイルパスの取得に失敗: ${error}`);
      } finally {
        setIsLoadingPath(false);
      }
    }

    // パスを取得してから設定を初期化
    fetchConfigPath().then(() => {
    // 設定の初期化と状態の確認
    initializeConfig();
    });
    
    // Rust側からのイベントリスナーを設定
    const unlisten1 = listen<boolean>("config-status", (event) => {
      setConfigValid(event.payload);
    });
    
    const unlisten2 = listen<boolean>("config-required", (event) => {
      if (event.payload) {
        setShowResourceConfig(true);
      }
    });
    
    const unlisten3 = listen<string>("config-error", (event) => {
      setLoadError(event.payload);
    });
    
    // クリーンアップ時にリスナーを解除
    return () => {
      unlisten1.then(fn => fn());
      unlisten2.then(fn => fn());
      unlisten3.then(fn => fn());
    };
  }, []);

  // 設定の初期化
  async function initializeConfig() {
    try {
      const mainWindow = getCurrentWebviewWindow();
      const config = await invoke<ResourceConfig>("initialize_config", {
        window: mainWindow
      });
      
      setResourceConfig(config);
      
      // 設定が有効であれば設定画面を表示しない
      if (config.filters.include.length > 0) {
        const allValid = await Promise.all(
          config.filters.include.map(path => 
            invoke<boolean>("validate_resource_path", { path })
          )
        ).then(results => results.every(r => r));
        
        setConfigValid(allValid);
        setShowResourceConfig(!allValid);
        
        // 設定が有効であれば画像ビューアを表示する
        setShowImageViewer(allValid);
      } else {
        setConfigValid(false);
        setShowResourceConfig(true);
        setShowImageViewer(false);
      }
      
      // 設定ファイルパスが取得できていれば読み込み処理を実行
      if (resourcesJsonPath) {
      loadClaudeJson();
      }
    } catch (error) {
      console.error("設定の初期化に失敗:", error);
      setLoadError(String(error));
      setShowResourceConfig(true);
    }
  }

  async function loadClaudeJson() {
    try {
      if (!resourcesJsonPath) {
        console.warn("設定ファイルパスが未設定です");
        return;
      }

      // 定義したパスをRust側に渡す
      const content = await invoke<string>("read_file_content", { 
        filePath: resourcesJsonPath
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

  // リソース設定画面の表示・非表示を切り替える
  const toggleResourceConfig = () => {
    setShowResourceConfig(!showResourceConfig);
  };

  // 画像ビューアの表示・非表示を切り替える
  const toggleImageViewer = () => {
    setShowImageViewer(!showImageViewer);
  };

  // リソースフォルダの情報を表示
  const renderResourceInfo = () => {
    if (!resourceConfig || !configValid) {
      return <p>有効なリソースフォルダが設定されていません。</p>;
    }
    
    return (
      <div className="resource-info">
        <h3>リソースフォルダ定義:</h3>
        <p><strong>名前:</strong> {resourceConfig.name}</p>
        <p><strong>フォルダ:</strong></p>
        <ul>
          {resourceConfig.filters.include.map((path, index) => (
            <li key={index}>{path}</li>
          ))}
        </ul>
        <button 
          onClick={toggleImageViewer} 
          className="view-images-button"
        >
          {showImageViewer ? "画像ビューアを閉じる" : "画像ビューアを開く"}
        </button>
      </div>
    );
  };

  return (
    <main className="container">
      <h1>Poir Viewer</h1>
      
      {/* 設定状態バナー */}
      <div className={`config-banner ${configValid ? 'valid' : 'invalid'}`}>
        <span>
          {isLoadingPath 
            ? "設定ファイルパスを読み込み中..." 
            : configValid 
            ? "✓ リソース設定は有効です" 
            : "⚠ リソース設定が必要です"}
        </span>
        <button onClick={toggleResourceConfig} disabled={isLoadingPath}>
          {showResourceConfig ? "設定を閉じる" : "設定を開く"}
        </button>
      </div>
      
      {/* 設定ファイルパス情報の表示 */}
      {resourcesJsonPath && (
        <div className="path-info">
          <p>設定ファイルのパス: <code>{resourcesJsonPath}</code></p>
        </div>
      )}
      
      {/* リソース設定コンポーネント */}
      {showResourceConfig && <ResourcesConfig />}
      
      {/* リソース情報表示 */}
      {!showResourceConfig && configValid && renderResourceInfo()}
      
      {/* 画像ビューアコンポーネント */}
      {showImageViewer && configValid && (
        <div className="image-viewer-container">
          <ImageViewer resourceConfig={resourceConfig} />
        </div>
      )}
      
      {/* 既存の機能 - 画像ビューアが表示されていない場合のみ表示 */}
      {!showImageViewer && (
        <>
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
            <button onClick={loadClaudeJson} disabled={!resourcesJsonPath || isLoadingPath}>
              Reload Fixed File
            </button>
            
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
        </>
      )}
      
      <style>{`
        .config-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
        
        .config-banner.valid {
          background-color: rgba(76, 175, 80, 0.2);
          border: 1px solid #4caf50;
        }
        
        .config-banner.invalid {
          background-color: rgba(255, 152, 0, 0.2);
          border: 1px solid #ff9800;
        }
        
        .path-info {
          background-color: #f5f5f5;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
          font-size: 0.9rem;
        }
        
        .path-info code {
          background-color: #e0e0e0;
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
          font-family: monospace;
          word-break: break-all;
        }
        
        .resource-info {
          background-color: #f5f5f5;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
        
        .resource-info ul {
          margin: 0;
          padding-left: 1.5rem;
        }
        
        .view-images-button {
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background-color: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .view-images-button:hover {
          background-color: #1976d2;
        }
        
        .image-viewer-container {
          width: 100%;
          height: calc(100vh - 200px);
          margin-bottom: 1rem;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }
        
        @media (prefers-color-scheme: dark) {
          .config-banner.valid {
            background-color: rgba(76, 175, 80, 0.1);
          }
          
          .config-banner.invalid {
            background-color: rgba(255, 152, 0, 0.1);
          }
          
          .path-info {
            background-color: #333;
          }
          
          .path-info code {
            background-color: #444;
            color: #e0e0e0;
          }
          
          .resource-info {
            background-color: #333;
          }
          
          .image-viewer-container {
            border-color: #444;
          }
        }
      `}</style>
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
      "allow": [
        { "path": "\\\\wsl.localhost\\Ubuntu-24.04\\home\\wsluser\\.claude.json" },
        { "path": "/Users/yutakakoach/.claude.json" }
      ]
    },
    {
      "identifier": "fs:allow-read-file",
      "allow": [
        { "path": "$RESOURCE/resources.json" }
      ]
    },
    {
      "identifier": "fs:allow-write-file",
      "allow": [
        { "path": "$RESOURCE/resources.json" }
      ]
    },
    {
      "identifier": "core:event:allow-listen",
      "allow": [
        "config-status",
        "config-required",
        "config-error",
        "image-loaded",
        "image-error"
      ]
    },
    {
      "identifier": "core:event:allow-emit",
      "allow": [
        "config-status",
        "config-required",
        "config-error",
        "image-loaded",
        "image-error"
      ]
    }
  ]
}
```

### src-tauri/src/config.rs

```
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// resources.jsonの内容を表す構造体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResourceConfig {
    pub id: String,
    pub name: String,
    pub filters: Filters,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Filters {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}

impl Default for ResourceConfig {
    fn default() -> Self {
        Self {
            id: "allviewer-resources".to_string(),
            name: "AllViewer画像リソース".to_string(),
            filters: Filters {
                include: Vec::new(),
                exclude: Vec::new(),
            },
        }
    }
}

impl ResourceConfig {
    // 設定ファイルのパスを取得
    pub fn get_config_path(app_handle: &AppHandle) -> PathBuf {
        let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| {
            // アプリディレクトリが取得できない場合は実行ファイルのディレクトリを使用
            let exe_dir = std::env::current_exe()
                .unwrap_or_default()
                .parent()
                .unwrap_or(Path::new("."))
                .to_path_buf();
            exe_dir
        });
        app_dir.join("resources.json")
    }

    // 設定ファイルの存在確認、なければデフォルト作成
    pub fn ensure_config_exists(app_handle: &AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle);
        
        // ディレクトリが存在するか確認し、存在しない場合は作成する
        if let Some(parent_dir) = config_path.parent() {
            if !parent_dir.exists() {
                fs::create_dir_all(parent_dir)
                    .map_err(|e| format!("ディレクトリの作成に失敗 ({}): {}", parent_dir.display(), e))?;
                println!("アプリディレクトリを作成しました: {}", parent_dir.display());
            }
        }
        
        if !config_path.exists() {
            let default_config = Self::default();
            let config_json = serde_json::to_string_pretty(&default_config)
                .map_err(|e| format!("デフォルト設定のシリアライズに失敗: {}", e))?;
            
            fs::write(&config_path, config_json)
                .map_err(|e| format!("設定ファイルの作成に失敗 ({}): {}", config_path.display(), e))?;
            
            println!("デフォルト設定ファイルを作成しました: {}", config_path.display());
        }
        
        Ok(())
    }

    // 設定ファイルを読み込む
    pub fn load(app_handle: &AppHandle) -> Result<Self, String> {
        Self::ensure_config_exists(app_handle)?;
        
        let config_path = Self::get_config_path(app_handle);
        let config_str = fs::read_to_string(&config_path)
            .map_err(|e| format!("設定ファイルの読み込みに失敗: {}", e))?;
            
        let config: ResourceConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("JSONのパースに失敗: {}", e))?;
            
        Ok(config)
    }

    // 設定ファイルを保存する
    pub fn save(&self, app_handle: &AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle);
        let config_json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("設定のシリアライズに失敗: {}", e))?;
            
        fs::write(&config_path, config_json)
            .map_err(|e| format!("設定ファイルの保存に失敗: {}", e))?;
            
        Ok(())
    }

    // パスの有効性チェック
    pub fn validate_path(path: &str) -> Result<(), String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("パスが存在しません: {}", path.display()));
        }
        
        if !path.is_dir() {
            return Err(format!("パスはディレクトリではありません: {}", path.display()));
        }
        
        // 読み取り権限チェック (ディレクトリの内容リストを取得してみる)
        match fs::read_dir(path) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("ディレクトリにアクセスできません: {}", e)),
        }
    }

    // // パスを追加する (バリデーション付き)
    // pub fn add_include_path(&mut self, path: String) -> Result<(), String> {
    //     Self::validate_path(&path)?;
        
    //     // 重複チェック
    //     if !self.filters.include.contains(&path) {
    //         self.filters.include.push(path);
    //     }
        
    //     Ok(())
    // }

    // 設定の有効性チェック
    pub fn is_valid(&self) -> bool {
        !self.filters.include.is_empty() && 
        self.filters.include.iter().all(|path| {
            Self::validate_path(path).is_ok()
        })
    }
}
```

### src-tauri/src/image.rs

```
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tauri::AppHandle;
use crate::config::ResourceConfig;

/// 画像ファイルに関する情報を格納する構造体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageInfo {
    /// ファイルの絶対パス
    pub path: String,
    /// ファイル名
    pub name: String,
    /// ファイルサイズ（バイト）
    pub size: u64,
    /// 最終更新日時（Unix時間）
    pub modified: u64,
    /// 画像の種類（拡張子）
    pub extension: String,
}

/// 画像一覧の取得結果
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageListResult {
    /// 取得された画像一覧
    pub images: Vec<ImageInfo>,
    /// 総画像数
    pub total: usize,
    /// 処理されたフォルダ
    pub folders: Vec<String>,
}

/// 画像ファイルのフィルタリング条件
const IMAGE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/// 与えられたパスが画像ファイルかどうかを判定する
fn is_image_file(path: &Path) -> bool {
    if let Some(extension) = path.extension() {
        if let Some(ext_str) = extension.to_str() {
            return IMAGE_EXTENSIONS.contains(&ext_str.to_lowercase().as_str());
        }
    }
    false
}

/// 指定されたディレクトリから画像ファイルを再帰的に取得する
fn get_images_from_directory(dir_path: &Path, max_depth: usize, current_depth: usize) -> Result<Vec<ImageInfo>, String> {
    if current_depth > max_depth {
        return Ok(Vec::new());
    }

    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("指定されたパスはディレクトリではありません: {}", dir_path.display()));
    }

    let mut images = Vec::new();

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("ディレクトリの読み取りに失敗: {} - {}", dir_path.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("エントリの読み取りに失敗: {}", e))?;
        let path = entry.path();

        if path.is_dir() && current_depth < max_depth {
            // 再帰的にサブディレクトリを処理
            match get_images_from_directory(&path, max_depth, current_depth + 1) {
                Ok(sub_images) => images.extend(sub_images),
                Err(e) => eprintln!("サブディレクトリの処理中にエラー: {}", e),
            }
        } else if path.is_file() && is_image_file(&path) {
            // 画像ファイルの情報を取得
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("ファイルのメタデータ取得に失敗: {} - {}", path.display(), e))?;
            
            let modified = metadata.modified()
                .map_err(|e| format!("更新日時の取得に失敗: {}", e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("時間変換エラー: {}", e))?
                .as_secs();
            
            let extension = path.extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            let name = path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_string();
            
            images.push(ImageInfo {
                path: path.to_string_lossy().to_string(),
                name,
                size: metadata.len(),
                modified,
                extension,
            });
        }
    }

    Ok(images)
}

/// resources.jsonの設定から画像ファイルのリストを取得する
#[tauri::command]
pub async fn get_image_list(app_handle: AppHandle, max_depth: Option<usize>) -> Result<ImageListResult, String> {
    // 設定ファイルを読み込む
    let config = ResourceConfig::load(&app_handle)?;
    
    // 設定が有効かチェック
    if config.filters.include.is_empty() {
        return Err("画像フォルダが設定されていません".to_string());
    }
    
    let max_search_depth = max_depth.unwrap_or(3); // デフォルトの深さを3に設定
    let mut all_images = Vec::new();
    let mut processed_folders = Vec::new();
    
    // includeに含まれる各ディレクトリを処理
    for dir in &config.filters.include {
        let dir_path = PathBuf::from(dir);
        if !dir_path.exists() || !dir_path.is_dir() {
            eprintln!("ディレクトリが存在しません: {}", dir);
            continue;
        }
        
        match get_images_from_directory(&dir_path, max_search_depth, 0) {
            Ok(images) => {
                all_images.extend(images);
                processed_folders.push(dir.clone());
            },
            Err(e) => {
                eprintln!("画像リストの取得中にエラー: {}", e);
            }
        }
    }
    
    // 結果を日付順にソート（新しい順）
    all_images.sort_by(|a, b| b.modified.cmp(&a.modified));
    
    Ok(ImageListResult {
        images: all_images.clone(),
        total: all_images.len(),
        folders: processed_folders,
    })
}

/// 指定された画像ファイルのパスが有効かどうかを検証する
#[tauri::command]
pub fn validate_image_path(path: String) -> bool {
    let file_path = Path::new(&path);
    file_path.exists() && file_path.is_file() && is_image_file(file_path)
}

/// 画像リストをページング処理して返す
#[tauri::command]
pub async fn get_paginated_images(
    app_handle: AppHandle, 
    page: usize, 
    items_per_page: usize
) -> Result<ImageListResult, String> {
    let full_list = get_image_list(app_handle, Some(3)).await?;
    
    let start_index = page * items_per_page;
    let end_index = std::cmp::min(start_index + items_per_page, full_list.images.len());
    
    if start_index >= full_list.images.len() {
        return Ok(ImageListResult {
            images: Vec::new(),
            total: full_list.total,
            folders: full_list.folders,
        });
    }
    
    Ok(ImageListResult {
        images: full_list.images[start_index..end_index].to_vec(),
        total: full_list.total,
        folders: full_list.folders,
    })
}
```

### src-tauri/src/lib.rs

```
mod config;
mod image;

use config::ResourceConfig;
use tauri::{Manager, Window, Emitter};

// 既存のgreetコマンド
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 既存のファイル読み込みコマンド
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

// 設定ファイルのパスを取得する新しいコマンド
#[tauri::command]
async fn get_config_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = ResourceConfig::get_config_path(&app_handle);
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

// リソース設定ファイルを読み込む
#[tauri::command]
async fn load_resource_config(app_handle: tauri::AppHandle) -> Result<ResourceConfig, String> {
    // 設定ファイル読み込み
    ResourceConfig::load(&app_handle)
}

// リソース設定ファイルを保存する
#[tauri::command]
async fn save_resource_config(
    app_handle: tauri::AppHandle,
    config: ResourceConfig
) -> Result<(), String> {
    // 設定ファイル保存
    config.save(&app_handle)
}

// パスの有効性を確認するコマンド
#[tauri::command]
async fn validate_resource_path(path: String) -> bool {
    // 入力されたパスが空の場合は無効とみなす
    if path.is_empty() {
        return false;
    }
    
    // パスの有効性チェック
    ResourceConfig::validate_path(&path).is_ok()
}

// パスを直接追加するコマンド
#[tauri::command]
async fn add_resource_path(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    // パスの有効性を確認
    ResourceConfig::validate_path(&path)?;
    
    // 現在の設定を読み込む
    let mut config = ResourceConfig::load(&app_handle)?;
    
    // 重複チェックを行い、パスを追加
    if !config.filters.include.contains(&path) {
        config.filters.include.push(path);
        
        // 設定を保存
        config.save(&app_handle)?;
    }
    
    Ok(())
}

// 起動時に設定を初期化し、その状態を通知する
#[tauri::command]
async fn initialize_config(
    window: Window,
    app_handle: tauri::AppHandle
) -> Result<ResourceConfig, String> {
    // 設定ファイルの存在確認・作成
    ResourceConfig::ensure_config_exists(&app_handle)?;
    
    // 設定を読み込む
    let config = ResourceConfig::load(&app_handle)?;
    
    // 設定の有効性を確認
    let is_valid = config.is_valid();
    
    // 設定状態をフロントエンドに通知
    window.emit("config-status", is_valid)
        .map_err(|e| format!("設定状態の通知に失敗: {}", e))?;
    
    // 有効でない場合、設定が必要であることをフロントエンドに通知
    if !is_valid {
        window.emit("config-required", true)
            .map_err(|e| format!("設定要求の通知に失敗: {}", e))?;
    }
    
    Ok(config)
}

// アプリケーションの実行ファイルのディレクトリパスを取得する
#[tauri::command]
fn get_executable_dir() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|e| format!("実行ファイルパスの取得に失敗: {}", e))
        .and_then(|path| {
            path.parent()
                .ok_or_else(|| "実行ファイルの親ディレクトリが存在しません".to_string())
                .map(|p| p.to_string_lossy().to_string())
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // アプリケーション起動時に設定ファイルの存在確認を行う
            let app_handle = app.handle();
            
            match ResourceConfig::ensure_config_exists(&app_handle) {
                Ok(_) => println!("設定ファイルの初期化に成功しました"),
                Err(e) => eprintln!("設定ファイルの初期化に失敗しました: {}", e),
            }
            
            // メインウィンドウの取得
            if let Some(main_window) = app.get_webview_window("main") {
                // 設定状態をチェックして通知
                match ResourceConfig::load(&app_handle) {
                    Ok(config) => {
                        let is_valid = config.is_valid();
                        let _ = main_window.emit("config-status", is_valid);
                        
                        if !is_valid {
                            let _ = main_window.emit("config-required", true);
                        }
                    },
                    Err(e) => {
                        eprintln!("設定の読み込みに失敗しました: {}", e);
                        let _ = main_window.emit("config-error", e);
                    }
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file_content,
            load_resource_config,
            save_resource_config,
            initialize_config,
            get_executable_dir,
            validate_resource_path,
            add_resource_path,
            // 新しい画像関連のコマンドを登録
            image::get_image_list,
            image::validate_image_path,
            image::get_paginated_images
        ])
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
tauri = { version = "2", features = ["protocol-asset"] }
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
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
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
      "assetProtocol": {
        "enable": true,
        "scope": ["**"]
      },
      "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost"
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
        "/Users/yutakakoach/Pictures/Photos Library.photoslibrary/originals"
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

