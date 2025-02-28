# ImageResourceManager Detailed Design Specification - Slim Version.

## 1. Overview

ImageResourceManagerは、poir-viewerアプリケーションにおける画像リソースの管理を担当する核心コンポーネントです。

### 1.1 Core Responsibilities
- 画像リソースの読み込み、キャッシュ、解放
- メモリ使用の最適化
- サムネイル生成と管理
- 画像メタデータの処理
- プリロードとプリフェッチの制御

### 1.2 Design Principles
- 効率性
- 即応性
- スケーラビリティ
- 柔軟性
- 堅牢性

## 2. Core Interface Definitions

```rust
// 必要なインポート
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use chrono::{DateTime, Utc};
```

### 2.1 基本型定義

```rust
/// キャンセルトークン
pub struct CancellationToken {
    cancelled: AtomicBool,
}

impl CancellationToken {
    pub fn new() -> Self {
        CancellationToken {
            cancelled: AtomicBool::new(false),
        }
    }
    
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
    
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

/// 画像リソース識別子
pub struct ImageId {
    pub path: PathBuf,
    pub unique_id: String,
}

/// 画像の種類
pub enum ImageFormat {
    JPEG,
    PNG,
    GIF,
    WEBP,
    BMP,
    Other(String),
}

/// 画像のサイズ情報
pub struct ImageSize {
    pub width: u32,
    pub height: u32,
}

/// 画像のロード状態
pub enum ImageLoadState {
    NotLoaded,
    Loading,
    ThumbnailLoaded,
    FullyLoaded,
    Error,
}

/// サムネイルサイズ
pub enum ThumbnailSize {
    Small(u32),
    Medium(u32),
    Large(u32),
    Custom(u32),
}

/// イベントカテゴリ
pub enum EventCategory {
    Resource,
    UI,
    System,
    Custom(String),
}

/// イベント方向
pub enum EventDirection {
    FrontToBack,
    BackToFront,
    Internal,
}
```

### 2.2 画像情報構造体

```rust
/// 画像メタデータ情報
pub struct ImageMetadata {
    pub size: ImageSize,
    pub format: ImageFormat,
    pub file_size: u64,
    pub created: Option<DateTime<Utc>>,
    pub modified: Option<DateTime<Utc>>,
}

/// 画像リソース情報
pub struct ImageInfo {
    pub id: ImageId,
    pub metadata: ImageMetadata,
    pub load_state: ImageLoadState,
    pub thumbnail_uri: Option<String>,
    pub asset_uri: String,
}

/// 画像リソース変更イベント
pub struct ImageResourceEvent {
    pub category: EventCategory,
    pub direction: EventDirection,
    pub image_id: Option<ImageId>,
    pub event_type: ImageResourceEventType,
}

/// 画像リソースイベントの種類
pub enum ImageResourceEventType {
    Loaded,
    Unloaded,
    MetadataUpdated,
    ThumbnailGenerated,
    Error,
}

/// リソース状態の変更を追跡するトレイト
pub trait ResourceStateObserver {
    fn on_resource_state_change(&self, event: &ImageResourceEvent);
}

/// リソース設定
pub struct ResourceConfig {
    pub include_paths: Vec<PathBuf>,
    pub exclude_patterns: Vec<String>,
    pub max_cache_size: usize,
    pub thumbnail_size: ThumbnailSize,
}

impl Default for ResourceConfig {
    fn default() -> Self {
        ResourceConfig {
            include_paths: Vec::new(),
            exclude_patterns: Vec::new(),
            max_cache_size: 100 * 1024 * 1024, // 100MB
            thumbnail_size: ThumbnailSize::Medium(150),
        }
    }
}
```

### 2.3 コアインターフェース

```rust
/// 画像リソース管理のコアインターフェース
pub trait ImageResourceManager {
    /// 指定したディレクトリから画像を検索して一覧を取得
    async fn list_images(
        &self,
        directory: &Path,
        recursive: bool,
        include_filters: Vec<String>,
        exclude_filters: Vec<String>,
    ) -> Result<Vec<ImageInfo>, ImageError>;
    
    /// 指定した画像のサムネイルを取得または生成
    async fn get_thumbnail(
        &self,
        image_id: &ImageId,
        size: ThumbnailSize,
    ) -> Result<ImageData, ImageError>;
    
    /// 指定した画像を完全に読み込み
    async fn load_image(
        &self,
        image_id: &ImageId,
        options: ImageLoadOptions,
    ) -> Result<ImageData, ImageError>;
    
    /// 画像のプリロードを開始
    async fn preload_image(
        &self,
        image_id: &ImageId,
        priority: LoadPriority,
    ) -> Result<(), ImageError>;
    
    /// 指定した画像のメタデータを取得
    async fn get_image_metadata(
        &self,
        image_id: &ImageId,
    ) -> Result<ImageMetadata, ImageError>;
    
    /// ページ指定して画像リストを取得
    async fn get_paginated_images(
        &self,
        page: usize,
        page_size: usize,
    ) -> Result<PaginatedImageResult, ImageError>;
    
    /// メモリ使用最適化を実行
    fn optimize_memory(&self) -> Result<OptimizationResult, ImageError>;
    
    /// 現在のキャッシュ状態と統計情報を取得
    fn get_cache_stats(&self) -> CacheStatistics;
}
```

### 2.4 関連データ型

```rust
/// 画像データ（ロード結果）
pub enum ImageData {
    Binary {
        data: Vec<u8>,
        format: ImageFormat,
        size: ImageSize,
    },
    Uri {
        uri: String,
        format: ImageFormat,
        size: ImageSize,
    },
}

/// 画像読み込みオプション
pub struct ImageLoadOptions {
    pub cache_mode: CacheMode,
    pub max_display_size: Option<ImageSize>,
    pub priority: LoadPriority,
    pub cancel_token: Option<CancellationToken>,
}

/// キャッシュモード
pub enum CacheMode {
    UseCache,
    RefreshCache,
    NoCache,
}

/// 読み込み優先度
pub enum LoadPriority {
    Immediate,
    High,
    Normal,
    Low,
    Background,
}

/// ページング結果
pub struct PaginatedImageResult {
    pub images: Vec<ImageInfo>,
    pub total_count: usize,
    pub current_page: usize,
    pub total_pages: usize,
}

/// 最適化結果
pub struct OptimizationResult {
    pub freed_memory: u64,
    pub removed_images: usize,
    pub current_usage: u64,
}

/// キャッシュ統計情報
pub struct CacheStatistics {
    pub image_count: usize,
    pub thumbnail_count: usize,
    pub memory_usage: u64,
    pub hit_count: usize,
    pub miss_count: usize,
    pub hit_ratio: f64,
}
```

### 2.5 エラー型

```rust
/// 画像処理に関するエラー
pub enum ImageError {
    FileSystemError(String),
    InvalidFormat(String),
    LoadError(String),
    ThumbnailError(String),
    OutOfMemory(String),
    CacheError(String),
    OperationCancelled,
    Other(String),
}

impl std::fmt::Display for ImageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImageError::FileSystemError(msg) => write!(f, "ファイルシステムエラー: {}", msg),
            ImageError::InvalidFormat(msg) => write!(f, "無効な画像形式: {}", msg),
            ImageError::LoadError(msg) => write!(f, "画像読み込みエラー: {}", msg),
            ImageError::ThumbnailError(msg) => write!(f, "サムネイル生成エラー: {}", msg),
            ImageError::OutOfMemory(msg) => write!(f, "メモリ不足: {}", msg),
            ImageError::CacheError(msg) => write!(f, "キャッシュエラー: {}", msg),
            ImageError::OperationCancelled => write!(f, "操作がキャンセルされました"),
            ImageError::Other(msg) => write!(f, "不明なエラー: {}", msg),
        }
    }
}

impl std::error::Error for ImageError {}
```

## 3. Future Enhancements

### 3.1 サポート拡張

画像形式、メタデータ、リモート画像のサポート拡張を検討します。

### 3.2 パフォーマンス最適化

- 適応的メモリ管理
- 画像処理の並列化
- GPUアクセラレーション

### 3.3 機能拡張

- 画像編集機能
- 画像検索
- バッチ処理

## 4. Research Areas

1. 適応的リソース負荷予測
2. 機械学習統合
3. 分散リソース管理
4. インテリジェントなメモリ管理
5. ハイパフォーマンスレンダリング
