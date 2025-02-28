# ImageResourceManager Detailed Design Specification

## 1. Overview

ImageResourceManagerは、poir-viewerアプリケーションにおける画像リソースの管理を担当する核心コンポーネントです。ResourceLoaderInterfaceを活用しながら、効率的なリソース管理、キャッシング、およびメモリ最適化を提供します。また、SimpleStateControllerとTauriEventManagerと連携して、アプリケーション全体の状態管理とイベント通知を実現します。

### 1.1 Core Responsibilities

- 画像リソースの読み込み、キャッシュ、解放
- メモリ使用の最適化
- サムネイル生成と管理
- 画像メタデータの処理
- ビューアで表示中の画像の効率的な管理
- プリロードとプリフェッチの制御
- 画像リソース状態のモニタリングと通知

### 1.2 Design Principles

- **効率性**: 限られたメモリでの最適なパフォーマンス
- **即応性**: ユーザー操作への迅速な反応
- **スケーラビリティ**: 大量の画像ファイルの効率的な処理
- **柔軟性**: 多様なファイル形式と大きさに対応
- **堅牢性**: エラーに対する回復力と適切なフォールバック
- **低メモリフットプリント**: メモリ消費の最小化
- **Tauri親和性**: Tauriのassetプロトコルとファイルシステム機能の最大活用

## 2. Core Interface Definitions

### 2.1 基本型と列挙型

```rust
/// 画像リソース識別子
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ImageId {
    /// ファイルパス
    pub path: PathBuf,
    /// 一意な識別子（通常はパスのハッシュ）
    pub unique_id: String,
}

/// 画像の種類
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    JPEG,
    PNG,
    GIF,
    WEBP,
    BMP,
    Other(String),
}

/// 画像のサイズ情報
#[derive(Debug, Clone, Copy)]
pub struct ImageSize {
    pub width: u32,
    pub height: u32,
}

/// 画像のロード状態
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageLoadState {
    /// 未ロード
    NotLoaded,
    /// ロード中
    Loading,
    /// サムネイルのみロード済み
    ThumbnailLoaded,
    /// 完全にロード済み
    FullyLoaded,
    /// エラー発生
    Error,
}

/// サムネイルサイズ
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThumbnailSize {
    Small(u32),
    Medium(u32),
    Large(u32),
    Custom(u32),
}
```

### 2.2 画像情報データ構造

```rust
/// 画像メタデータ情報
#[derive(Debug, Clone)]
pub struct ImageMetadata {
    /// 画像サイズ（ピクセル）
    pub size: ImageSize,
    /// 画像形式
    pub format: ImageFormat,
    /// ファイルサイズ（バイト）
    pub file_size: u64,
    /// 作成日時
    pub created: Option<DateTime<Utc>>,
    /// 更新日時
    pub modified: Option<DateTime<Utc>>,
    /// EXIFデータ（存在する場合）
    pub exif: Option<HashMap<String, Value>>,
    /// 追加メタデータ
    pub additional: HashMap<String, Value>,
}

/// 画像リソース情報
#[derive(Debug, Clone)]
pub struct ImageInfo {
    /// 画像識別子
    pub id: ImageId,
    /// 画像メタデータ
    pub metadata: ImageMetadata,
    /// 現在のロード状態
    pub load_state: ImageLoadState,
    /// サムネイルへのURI参照（生成されている場合）
    pub thumbnail_uri: Option<String>,
    /// 元画像へのURI参照（Tauriのassetプロトコル）
    pub asset_uri: String,
    /// 最終アクセス時刻
    pub last_accessed: DateTime<Utc>,
}
```

### 2.3 コアインターフェース

```rust
/// 画像リソース管理のコアインターフェース
pub trait ImageResourceManager: Send + Sync {
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
    
    /// 指定した画像をキャッシュから解放
    fn unload_image(&self, image_id: &ImageId) -> Result<(), ImageError>;
    
    /// キャッシュ内の画像をクリア
    fn clear_cache(&self, strategy: CacheCleanupStrategy) -> Result<usize, ImageError>;
    
    /// 指定した画像のURI（Tauriのassetプロトコル）を取得
    fn get_image_uri(&self, image_id: &ImageId) -> String;
    
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
#[derive(Debug)]
pub enum ImageData {
    /// バイナリデータとしての画像
    Binary {
        data: Vec<u8>,
        format: ImageFormat,
        size: ImageSize,
    },
    /// URIへの参照としての画像
    Uri {
        uri: String,
        format: ImageFormat,
        size: ImageSize,
    },
}

/// 画像読み込みオプション
#[derive(Debug, Clone)]
pub struct ImageLoadOptions {
    /// キャッシュモード
    pub cache_mode: CacheMode,
    /// 縮小表示する場合の最大サイズ
    pub max_display_size: Option<ImageSize>,
    /// 読み込み優先度
    pub priority: LoadPriority,
    /// キャンセルトークン
    pub cancel_token: Option<CancellationToken>,
    /// 追加オプション
    pub additional_options: HashMap<String, Value>,
}

/// キャッシュモード
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheMode {
    /// キャッシュを使用（利用可能な場合）
    UseCache,
    /// キャッシュを更新
    RefreshCache,
    /// キャッシュを使用しない
    NoCache,
}

/// 読み込み優先度
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LoadPriority {
    /// 即時（ユーザー操作による直接要求）
    Immediate,
    /// 高優先度（現在表示中の画像の隣接画像など）
    High,
    /// 通常優先度
    Normal,
    /// 低優先度（事前読み込みなど）
    Low,
    /// バックグラウンド（アイドル時のみ）
    Background,
}

/// ページング結果
#[derive(Debug, Clone)]
pub struct PaginatedImageResult {
    /// 画像リスト
    pub images: Vec<ImageInfo>,
    /// 総画像数
    pub total_count: usize,
    /// 現在のページ
    pub current_page: usize,
    /// 総ページ数
    pub total_pages: usize,
}

/// キャッシュクリーンアップ戦略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheCleanupStrategy {
    /// すべてクリア
    All,
    /// 指定時間以上アクセスされていないもの
    OlderThan(Duration),
    /// 指定サイズ以上
    LargerThan(u64),
    /// 指定サイズまで削減
    ReduceTo(u64),
}

/// 最適化結果
#[derive(Debug, Clone)]
pub struct OptimizationResult {
    /// 解放されたメモリ量（バイト）
    pub freed_memory: u64,
    /// キャッシュから削除された画像数
    pub removed_images: usize,
    /// 最適化後のメモリ使用量（バイト）
    pub current_usage: u64,
}

/// キャッシュ統計情報
#[derive(Debug, Clone)]
pub struct CacheStatistics {
    /// キャッシュ内の画像数
    pub image_count: usize,
    /// キャッシュ内のサムネイル数
    pub thumbnail_count: usize,
    /// 合計メモリ使用量（バイト）
    pub memory_usage: u64,
    /// キャッシュヒット数
    pub hit_count: usize,
    /// キャッシュミス数
    pub miss_count: usize,
    /// キャッシュヒット率（0.0-1.0）
    pub hit_ratio: f64,
}

/// キャンセルトークン
#[derive(Debug, Clone)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        CancellationToken {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
    
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
    
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}
```

### 2.5 エラー型定義

```rust
/// 画像処理に関するエラー
#[derive(Debug, Clone)]
pub enum ImageError {
    /// ファイルシステムエラー
    FileSystemError(String),
    /// 無効な画像フォーマット
    InvalidFormat(String),
    /// 画像読み込みエラー
    LoadError(String),
    /// サムネイル生成エラー
    ThumbnailError(String),
    /// 画像解析エラー
    ParsingError(String),
    /// 画像変換エラー
    ConversionError(String),
    /// メモリ不足エラー
    OutOfMemory(String),
    /// キャッシュエラー
    CacheError(String),
    /// 操作キャンセル
    OperationCancelled,
    /// その他のエラー
    Other(String),
}

impl std::fmt::Display for ImageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImageError::FileSystemError(msg) => write!(f, "ファイルシステムエラー: {}", msg),
            ImageError::InvalidFormat(msg) => write!(f, "無効な画像フォーマット: {}", msg),
            ImageError::LoadError(msg) => write!(f, "画像読み込みエラー: {}", msg),
            ImageError::ThumbnailError(msg) => write!(f, "サムネイル生成エラー: {}", msg),
            ImageError::ParsingError(msg) => write!(f, "画像解析エラー: {}", msg),
            ImageError::ConversionError(msg) => write!(f, "画像変換エラー: {}", msg),
            ImageError::OutOfMemory(msg) => write!(f, "メモリ不足: {}", msg),
            ImageError::CacheError(msg) => write!(f, "キャッシュエラー: {}", msg),
            ImageError::OperationCancelled => write!(f, "操作がキャンセルされました"),
            ImageError::Other(msg) => write!(f, "エラー: {}", msg),
        }
    }
}

impl std::error::Error for ImageError {}

impl From<std::io::Error> for ImageError {
    fn from(err: std::io::Error) -> Self {
        ImageError::FileSystemError(err.to_string())
    }
}
```

## 3. Implementation Guidelines

### 3.1 基本実装

以下に、ImageResourceManagerの基本実装例を示します。

```rust
/// ImageResourceManagerの基本実装
pub struct ImageResourceManagerImpl {
    /// Tauriアプリケーションハンドル
    app_handle: AppHandle,
    
    /// リソースローダー
    resource_loader: Arc<dyn ResourceLoader>,
    
    /// 状態管理
    state_controller: Arc<dyn SimpleStateController>,
    
    /// イベント管理
    event_manager: Arc<dyn TauriEventManager>,
    
    /// 画像キャッシュ
    image_cache: Arc<RwLock<ImageCache>>,
    
    /// サムネイルキャッシュ
    thumbnail_cache: Arc<RwLock<ThumbnailCache>>,
    
    /// 現在のディレクトリコンテキスト
    current_context: Arc<RwLock<DirectoryContext>>,
    
    /// メモリ使用モニター
    memory_monitor: Arc<MemoryMonitor>,
    
    /// 読み込みスケジューラ
    load_scheduler: Arc<LoadScheduler>,
    
    /// キャッシュ統計
    cache_stats: Arc<CacheStatisticsCollector>,
    
    /// エラーハンドラ
    error_handler: Arc<ImageErrorHandler>,
}

/// 画像キャッシュ
struct ImageCache {
    /// 画像データのマップ
    images: HashMap<ImageId, CachedImage>,
    
    /// LRUリスト（最近使用された順）
    lru_list: LinkedList<ImageId>,
    
    /// 最大キャッシュサイズ（バイト）
    max_size: u64,
    
    /// 現在のキャッシュサイズ（バイト）
    current_size: u64,
}

/// キャッシュされた画像
struct CachedImage {
    /// 画像情報
    info: ImageInfo,
    
    /// 画像データ（保持している場合）
    data: Option<Arc<Vec<u8>>>,
    
    /// 最終アクセス時刻
    last_accessed: DateTime<Utc>,
    
    /// メモリ使用量（バイト）
    memory_usage: u64,
}

/// サムネイルキャッシュ
struct ThumbnailCache {
    /// サムネイルデータのマップ
    thumbnails: HashMap<(ImageId, ThumbnailSize), CachedThumbnail>,
    
    /// LRUリスト（最近使用された順）
    lru_list: LinkedList<(ImageId, ThumbnailSize)>,
    
    /// 最大キャッシュサイズ（バイト）
    max_size: u64,
    
    /// 現在のキャッシュサイズ（バイト）
    current_size: u64,
}

/// キャッシュされたサムネイル
struct CachedThumbnail {
    /// サムネイルデータ
    data: Arc<Vec<u8>>,
    
    /// フォーマット
    format: ImageFormat,
    
    /// サイズ
    size: ImageSize,
    
    /// 最終アクセス時刻
    last_accessed: DateTime<Utc>,
    
    /// メモリ使用量（バイト）
    memory_usage: u64,
}

/// ディレクトリコンテキスト
struct DirectoryContext {
    /// 現在のディレクトリパス
    current_directory: PathBuf,
    
    /// 現在のディレクトリ内の画像リスト
    images: Vec<ImageInfo>,
    
    /// 総画像数
    total_count: usize,
    
    /// 現在のフィルター設定
    filters: ImageFilters,
}

/// 画像フィルター設定
struct ImageFilters {
    /// 含めるパターン
    include: Vec<String>,
    
    /// 除外パターン
    exclude: Vec<String>,
    
    /// 再帰的に検索するか
    recursive: bool,
}

/// メモリモニター
struct MemoryMonitor {
    /// 最大メモリ使用量（バイト）
    max_memory: u64,
    
    /// 警告閾値（最大値に対する割合）
    warning_threshold: f64,
    
    /// 重大閾値（最大値に対する割合）
    critical_threshold: f64,
    
    /// 現在のメモリ使用量（バイト）
    current_usage: AtomicU64,
}

/// 読み込みスケジューラ
struct LoadScheduler {
    /// 読み込みキュー
    load_queue: Arc<Mutex<BinaryHeap<LoadTask>>>,
    
    /// 現在実行中のタスク数
    active_tasks: AtomicUsize,
    
    /// 最大同時実行タスク数
    max_concurrent_tasks: usize,
    
    /// スケジューラ実行フラグ
    is_running: AtomicBool,
}

/// 読み込みタスク
struct LoadTask {
    /// 画像ID
    image_id: ImageId,
    
    /// 読み込み優先度
    priority: LoadPriority,
    
    /// 読み込みオプション
    options: ImageLoadOptions,
    
    /// 作成時刻
    created_at: DateTime<Utc>,
}

impl Ord for LoadTask {
    fn cmp(&self, other: &Self) -> Ordering {
        // 優先度の高いものが先に取り出されるように逆順で比較
        other.priority.cmp(&self.priority)
            .then_with(|| self.created_at.cmp(&other.created_at))
    }
}

impl PartialOrd for LoadTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for LoadTask {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.created_at == other.created_at
    }
}

impl Eq for LoadTask {}

/// キャッシュ統計収集器
struct CacheStatisticsCollector {
    /// ヒット数
    hits: AtomicUsize,
    
    /// ミス数
    misses: AtomicUsize,
}

/// 画像エラーハンドラ
struct ImageErrorHandler {
    /// エラー履歴
    error_history: RwLock<VecDeque<(ImageError, DateTime<Utc>)>>,
    
    /// エラー通知リスナー
    error_listeners: RwLock<Vec<Box<dyn Fn(&ImageError) + Send + Sync>>>,
    
    /// 最大履歴サイズ
    max_history_size: usize,
}
```

### 3.2 主要メソッドの実装

```rust
impl ImageResourceManagerImpl {
    /// 新しいインスタンスを作成
    pub fn new(
        app_handle: AppHandle,
        resource_loader: Arc<dyn ResourceLoader>,
        state_controller: Arc<dyn SimpleStateController>,
        event_manager: Arc<dyn TauriEventManager>,
        config: ImageResourceManagerConfig,
    ) -> Self {
        let image_cache = Arc::new(RwLock::new(ImageCache {
            images: HashMap::new(),
            lru_list: LinkedList::new(),
            max_size: config.image_cache_size,
            current_size: 0,
        }));
        
        let thumbnail_cache = Arc::new(RwLock::new(ThumbnailCache {
            thumbnails: HashMap::new(),
            lru_list: LinkedList::new(),
            max_size: config.thumbnail_cache_size,
            current_size: 0,
        }));
        
        let current_context = Arc::new(RwLock::new(DirectoryContext {
            current_directory: PathBuf::new(),
            images: Vec::new(),
            total_count: 0,
            filters: ImageFilters {
                include: Vec::new(),
                exclude: Vec::new(),
                recursive: false,
            },
        }));
        
        let memory_monitor = Arc::new(MemoryMonitor {
            max_memory: config.max_memory,
            warning_threshold: config.warning_threshold,
            critical_threshold: config.critical_threshold,
            current_usage: AtomicU64::new(0),
        });
        
        let load_scheduler = Arc::new(LoadScheduler {
            load_queue: Arc::new(Mutex::new(BinaryHeap::new())),
            active_tasks: AtomicUsize::new(0),
            max_concurrent_tasks: config.max_concurrent_loads,
            is_running: AtomicBool::new(false),
        });
        
        let cache_stats = Arc::new(CacheStatisticsCollector {
            hits: AtomicUsize::new(0),
            misses: AtomicUsize::new(0),
        });
        
        let error_handler = Arc::new(ImageErrorHandler {
            error_history: RwLock::new(VecDeque::with_capacity(config.error_history_size)),
            error_listeners: RwLock::new(Vec::new()),
            max_history_size: config.error_history_size,
        });
        
        let manager = ImageResourceManagerImpl {
            app_handle,
            resource_loader,
            state_controller,
            event_manager,
            image_cache,
            thumbnail_cache,
            current_context,
            memory_monitor,
            load_scheduler,
            cache_stats,
            error_handler,
        };
        
        // スケジューラを開始
        manager.start_scheduler();
        
        manager
    }
    
    /// 読み込みスケジューラを開始
    fn start_scheduler(&self) {
        let load_scheduler = self.load_scheduler.clone();
        let image_cache = self.image_cache.clone();
        let resource_loader = self.resource_loader.clone();
        let memory_monitor = self.memory_monitor.clone();
        let error_handler = self.error_handler.clone();
        let event_manager = self.event_manager.clone();
        
        // 既に実行中なら何もしない
        if load_scheduler.is_running.swap(true, Ordering::SeqCst) {
            return;
        }
        
        // バックグラウンドタスクとして読み込みスケジューラを実行
        tokio::spawn(async move {
            while load_scheduler.is_running.load(Ordering::SeqCst) {
                // アクティブなタスク数をチェック
                let active_tasks = load_scheduler.active_tasks.load(Ordering::SeqCst);
                
                if active_tasks < load_scheduler.max_concurrent_tasks {
                    // キューからタスクを取得
                    let task_opt = {
                        let mut queue = load_scheduler.load_queue.lock().await;
                        queue.pop()
                    };
                    
                    if let Some(task) = task_opt {
                        // アクティブタスク数を増加
                        load_scheduler.active_tasks.fetch_add(1, Ordering::SeqCst);
                        
                        // 必要なクローン
                        let image_cache_clone = image_cache.clone();
                        let resource_loader_clone = resource_loader.clone();
                        let memory_monitor_clone = memory_monitor.clone();
                        let error_handler_clone = error_handler.clone();
                        let event_manager_clone = event_manager.clone();
                        let load_scheduler_clone = load_scheduler.clone();
                        
                        // タスクを実行
                        tokio::spawn(async move {
                            let result = Self::load_image_internal(
                                &task.image_id,
                                &task.options,
                                &image_cache_clone,
                                &resource_loader_clone,
                                &memory_monitor_clone,
                            ).await;
                            
                            match result {
                                Ok(data) => {
                                    // 成功イベントを発行
                                    let _ = event_manager_clone.emit(
                                        "image-loaded",
                                        ImageLoadedEvent {
                                            image_id: task.image_id.clone(),
                                            size: data.get_size(),
                                        },
                                        EventCategory::Resource,
                                        EventDirection::BackToFront,
                                    );
                                },
                                Err(err) => {
                                    // エラーをハンドル
                                    if !matches!(err, ImageError::OperationCancelled) {
                                        error_handler_clone.handle_error(&err, Some(&task.image_id));
                                    }
                                }
                            }
                            
                            // アクティブタスク数を減少
                            load_scheduler_clone.active_tasks.fetch_sub(1, Ordering::SeqCst);
                        });
                    } else {
                        // キューが空なら少し待機
                        tokio::time::sleep(Duration::from_millis(50)).await;
                    }
                } else {
                    // 最大同時実行数に達している場合は待機
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
            }
        });
    }
    
    /// 画像読み込みの内部実装
    async fn load_image_internal(
        image_id: &ImageId,
        options: &ImageLoadOptions,
        image_cache: &Arc<RwLock<ImageCache>>,
        resource_loader: &Arc<dyn ResourceLoader>,
        memory_monitor: &Arc<MemoryMonitor>,
    ) -> Result<ImageData, ImageError> {
        // キャンセルチェック
        if let Some(token) = &options.cancel_token {
            if token.is_cancelled() {
                return Err(ImageError::OperationCancelled);
            }
        }
        
        // キャッシュチェック
        if options.cache_mode == CacheMode::UseCache {
            if let Some(cached_image) = Self::get_from_cache(image_id, image_cache) {
                if let Some(data) = &cached_image.data {
                    return Ok(ImageData::Binary {
                        data: data.to_vec(),
                        format: cached_image.info.metadata.format,
                        size: cached_image.info.metadata.size,
                    });
                }
            }
        }
        
        // リソースIDを作成
        let resource_id = ResourceId {
            path: image_id.path.to_string_lossy().to_string(),
            resource_type: ResourceType::Image,
            metadata: HashMap::new(),
        };
        
        // リソースローダーから画像を読み込み
        let load_options = LoadOptions {
            cache_mode: match options.cache_mode {
                CacheMode::UseCache => crate::resource_loader::CacheMode::PreferCache,
                CacheMode::RefreshCache => crate::resource_loader::CacheMode::RefreshCache,
                CacheMode::NoCache => crate::resource_loader::CacheMode::NoCache,
            },
            load_as: LoadType::Binary,
            priority: match options.priority {
                LoadPriority::Immediate => crate::resource_loader::LoadPriority::High,
                LoadPriority::High => crate::resource_loader::LoadPriority::High,
                LoadPriority::Normal => crate::resource_loader::LoadPriority::Normal,
                LoadPriority::Low => crate::resource_loader::LoadPriority::Low,
                LoadPriority::Background => crate::resource_loader::LoadPriority::Background,
            },
            extra_options: HashMap::new(),
        };
        
        // キャンセルチェック
        if let Some(token) = &options.cancel_token {
            if token.is_cancelled() {
                return Err(ImageError::OperationCancelled);
            }
        }
        
        let resource_data = resource_loader.load_resource(&resource_id, load_options).await
            .map_err(|e| ImageError::LoadError(format!("リソース読み込みエラー: {}", e)))?;
        
        // バイナリデータを取得
        let binary_data = match resource_data {
            ResourceData::Binary(data) => data,
            ResourceData::Text(_) => {
                return Err(ImageError::InvalidFormat("テキストデータは画像として読み込めません".to_string()));
            },
            ResourceData::Json(_) => {
                return Err(ImageError::InvalidFormat("JSONデータは画像として読み込めません".to_string()));
            },
            ResourceData::Uri(uri) => {
                // URIの場合は直接返す（ブラウザが処理）
                return Ok(ImageData::Uri {
                    uri,
                    format: Self::detect_format_from_path(&image_id.path)?,
                    size: ImageSize { width: 0, height: 0 }, // サイズ不明
                });
            },
        };
        
        // 画像形式とサイズを検出
        let (format, size) = Self::analyze_image_data(&binary_data)?;
        
        // リサイズが必要な場合
        let final_data = if let Some(max_size) = options.max_display_size {
            if size.width > max_size.width || size.height > max_size.height {
                // リサイズが必要（実際の実装ではここで画像処理ライブラリを使用）
                // この例では単純に元のデータを返す
                binary_data
            } else {
                binary_data
            }
        } else {
            binary_data
        };
        
        // メモリモニターを更新
        memory_monitor.current_usage.fetch_add(final_data.len() as u64, Ordering::Relaxed);
        
        // キャッシュに追加
        if options.cache_mode != CacheMode::NoCache {
            Self::add_to_cache(
                image_id,
                &final_data,
                format,
                size,
                image_cache,
            )?;
        }
        
        Ok(ImageData::Binary {
            data: final_data,
            format,
            size,
        })
    }
    
    /// キャッシュから画像を取得
    fn get_from_cache(
        image_id: &ImageId, 
        cache: &Arc<RwLock<ImageCache>>
    ) -> Option<CachedImage> {
        let mut cache_guard = cache.write().unwrap();
        
        if let Some(cached_image) = cache_guard.images.get_mut(image_id) {
            // 最終アクセス時刻を更新
            cached_image.last_accessed = Utc::now();
            
            // LRUリストで順序を更新
            let position = cache_guard.lru_list.iter().position(|id| id == image_id);
            if let Some(index) = position {
                let mut cursor = cache_guard.lru_list.cursor_front_mut();
                for _ in 0..index {
                    cursor.move_next();
                }
                if let Some(id) = cursor.remove_current() {
                    cache_guard.lru_list.push_back(id);
                }
            }
            
            // クローンを返す
            return Some(cached_image.clone());
        }
        
        None
    }
    
    /// キャッシュに画像を追加
    fn add_to_cache(
        image_id: &ImageId,
        data: &[u8],
        format: ImageFormat,
        size: ImageSize,
        cache: &Arc<RwLock<ImageCache>>,
    ) -> Result<(), ImageError> {
        let mut cache_guard = cache.write().unwrap();
        
        // 必要に応じてキャッシュをクリア
        let data_size = data.len() as u64;
        
        if cache_guard.current_size + data_size > cache_guard.max_size {
            // キャッシュがいっぱいなのでスペースを確保
            Self::make_space_in_cache(&mut cache_guard, data_size)?;
        }
        
        // 画像情報を作成
        let info = ImageInfo {
            id: image_id.clone(),
            metadata: ImageMetadata {
                size,
                format,
                file_size: data_size,
                created: None,
                modified: None,
                exif: None,
                additional: HashMap::new(),
            },
            load_state: ImageLoadState::FullyLoaded,
            thumbnail_uri: None,
            asset_uri: Self::create_asset_uri(image_id),
            last_accessed: Utc::now(),
        };
        
        // キャッシュに追加
        let cached_image = CachedImage {
            info,
            data: Some(Arc::new(data.to_vec())),
            last_accessed: Utc::now(),
            memory_usage: data_size,
        };
        
        cache_guard.images.insert(image_id.clone(), cached_image);
        cache_guard.lru_list.push_back(image_id.clone());
        cache_guard.current_size += data_size;
        
        Ok(())
    }
    
    /// キャッシュ内でスペースを確保
    fn make_space_in_cache(
        cache: &mut ImageCache,
        required_size: u64,
    ) -> Result<(), ImageError> {
        // 必要なスペースが最大キャッシュサイズを超えている場合
        if required_size > cache.max_size {
            return Err(ImageError::CacheError(
                format!("要求サイズ({})がキャッシュ最大サイズ({})を超えています", required_size, cache.max_size)
            ));
        }
        
        // 必要なスペースを確保するために古いアイテムを削除
        while cache.current_size + required_size > cache.max_size && !cache.lru_list.is_empty() {
            if let Some(id) = cache.lru_list.pop_front() {
                if let Some(image) = cache.images.remove(&id) {
                    cache.current_size -= image.memory_usage;
                }
            }
        }
        
        Ok(())
    }
    
    /// パスから画像形式を検出
    fn detect_format_from_path(path: &Path) -> Result<ImageFormat, ImageError> {
        if let Some(extension) = path.extension() {
            if let Some(ext_str) = extension.to_str() {
                match ext_str.to_lowercase().as_str() {
                    "jpg" | "jpeg" => Ok(ImageFormat::JPEG),
                    "png" => Ok(ImageFormat::PNG),
                    "gif" => Ok(ImageFormat::GIF),
                    "webp" => Ok(ImageFormat::WEBP),
                    "bmp" => Ok(ImageFormat::BMP),
                    _ => Ok(ImageFormat::Other(ext_str.to_string())),
                }
            } else {
                Err(ImageError::InvalidFormat("拡張子を文字列に変換できません".to_string()))
            }
        } else {
            Err(ImageError::InvalidFormat("ファイル拡張子がありません".to_string()))
        }
    }
    
    /// 画像データを解析して形式とサイズを取得
    fn analyze_image_data(data: &[u8]) -> Result<(ImageFormat, ImageSize), ImageError> {
        // 実際の実装では画像処理ライブラリを使用する
        // 例としてヘッダーのみで判断する簡易実装
        
        if data.len() < 8 {
            return Err(ImageError::ParsingError("データが短すぎます".to_string()));
        }
        
        // JPEG: FF D8 FF
        if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
            // 実際の実装ではJPEGのSOFマーカーを探してサイズを抽出
            return Ok((ImageFormat::JPEG, ImageSize { width: 0, height: 0 }));
        }
        
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
            // PNGのIHDRチャンクからサイズを抽出（実際の実装ではここでパース）
            return Ok((ImageFormat::PNG, ImageSize { width: 0, height: 0 }));
        }
        
        // GIF: GIF87a or GIF89a
        if data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 {
            // GIFヘッダーからサイズを抽出（実際の実装ではここでパース）
            return Ok((ImageFormat::GIF, ImageSize { width: 0, height: 0 }));
        }
        
        // WEBP: RIFF xxxx WEBP
        if data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 &&
           data[8] == 0x57 && data[9] == 0x45 && data[10] == 0x42 && data[11] == 0x50 {
            // WEBPヘッダーからサイズを抽出（実際の実装ではここでパース）
            return Ok((ImageFormat::WEBP, ImageSize { width: 0, height: 0 }));
        }
        
        // BMP: BM
        if data[0] == 0x42 && data[1] == 0x4D {
            // BMPヘッダーからサイズを抽出（実際の実装ではここでパース）
            return Ok((ImageFormat::BMP, ImageSize { width: 0, height: 0 }));
        }
        
        // 未知の形式
        Err(ImageError::InvalidFormat("未知の画像形式です".to_string()))
    }
    
    /// assetプロトコルURIを作成
    fn create_asset_uri(image_id: &ImageId) -> String {
        let path_str = image_id.path.to_string_lossy().replace('\\', "/");
        
        // Windowsパスの場合、先頭の「/」を追加
        let normalized_path = if !path_str.starts_with('/') && !path_str.contains(':') {
            format!("/{}", path_str)
        } else {
            path_str.to_string()
        };
        
        format!("asset://{}", normalized_path)
    }
}
```

### 3.3 ImageResourceManagerトレイトの実装

```rust
impl ImageResourceManager for ImageResourceManagerImpl {
    async fn list_images(
        &self,
        directory: &Path,
        recursive: bool,
        include_filters: Vec<String>,
        exclude_filters: Vec<String>,
    ) -> Result<Vec<ImageInfo>, ImageError> {
        // ディレクトリが存在することを確認
        if !directory.exists() || !directory.is_dir() {
            return Err(ImageError::FileSystemError(format!(
                "指定されたパスはディレクトリではありません: {}", 
                directory.display()
            )));
        }
        
        // ディレクトリコンテキストを更新
        {
            let mut context = self.current_context.write().unwrap();
            context.current_directory = directory.to_path_buf();
            context.filters = ImageFilters {
                include: include_filters.clone(),
                exclude: exclude_filters.clone(),
                recursive,
            };
            context.images.clear();
            context.total_count = 0;
        }
        
        // ディレクトリ内のファイルを走査
        let mut images = Vec::new();
        
        // 再帰的または非再帰的に画像を収集
        self.collect_images(
            directory,
            recursive,
            &include_filters,
            &exclude_filters,
            &mut images,
        ).await?;
        
        // ディレクトリコンテキストを更新
        {
            let mut context = self.current_context.write().unwrap();
            context.images = images.clone();
            context.total_count = images.len();
        }
        
        // 結果をイベントとして通知
        let _ = self.event_manager.emit(
            "directory-loaded",
            DirectoryLoadedEvent {
                directory: directory.to_string_lossy().to_string(),
                image_count: images.len(),
            },
            EventCategory::Resource,
            EventDirection::BackToFront,
        );
        
        Ok(images)
    }
    
    async fn get_thumbnail(
        &self,
        image_id: &ImageId,
        size: ThumbnailSize,
    ) -> Result<ImageData, ImageError> {
        // キャッシュからサムネイルを取得
        if let Some(thumbnail) = self.get_thumbnail_from_cache(image_id, size) {
            return Ok(ImageData::Binary {
                data: thumbnail.data.to_vec(),
                format: thumbnail.format,
                size: thumbnail.size,
            });
        }
        
        // 画像を読み込み
        let options = ImageLoadOptions {
            cache_mode: CacheMode::UseCache,
            max_display_size: None,
            priority: LoadPriority::High, // サムネイルは高優先度
            cancel_token: None,
            additional_options: HashMap::new(),
        };
        
        let image_data = self.load_image(image_id, options).await?;
        
        // サムネイルを生成
        let thumbnail_data = match image_data {
            ImageData::Binary { data, format, size: original_size } => {
                // サムネイルサイズを計算
                let target_size = match size {
                    ThumbnailSize::Small(s) => s,
                    ThumbnailSize::Medium(s) => s,
                    ThumbnailSize::Large(s) => s,
                    ThumbnailSize::Custom(s) => s,
                };
                
                // リサイズ処理（実際の実装では画像処理ライブラリを使用）
                // この例では単純に元のデータを返す
                let thumbnail_size = self.calculate_thumbnail_size(original_size, target_size);
                
                // キャッシュに追加
                self.add_thumbnail_to_cache(
                    image_id,
                    size,
                    &data,
                    format,
                    thumbnail_size,
                )?;
                
                ImageData::Binary {
                    data,
                    format,
                    size: thumbnail_size,
                }
            },
            ImageData::Uri { uri, format, size } => {
                // URIの場合はそのまま返す
                ImageData::Uri { uri, format, size }
            },
        };
        
        Ok(thumbnail_data)
    }
    
    async fn load_image(
        &self,
        image_id: &ImageId,
        options: ImageLoadOptions,
    ) -> Result<ImageData, ImageError> {
        // キャッシュチェック
        if options.cache_mode == CacheMode::UseCache {
            if let Some(cached_image) = Self::get_from_cache(image_id, &self.image_cache) {
                if let Some(data) = &cached_image.data {
                    self.cache_stats.hits.fetch_add(1, Ordering::Relaxed);
                    
                    return Ok(ImageData::Binary {
                        data: data.to_vec(),
                        format: cached_image.info.metadata.format,
                        size: cached_image.info.metadata.size,
                    });
                }
            }
        }
        
        self.cache_stats.misses.fetch_add(1, Ordering::Relaxed);
        
        // 優先度に応じた読み込み方法
        match options.priority {
            LoadPriority::Immediate => {
                // 即時読み込み
                Self::load_image_internal(
                    image_id,
                    &options,
                    &self.image_cache,
                    &self.resource_loader,
                    &self.memory_monitor,
                ).await
            },
            _ => {
                // キューに追加
                let task = LoadTask {
                    image_id: image_id.clone(),
                    priority: options.priority,
                    options: options.clone(),
                    created_at: Utc::now(),
                };
                
                let mut queue = self.load_scheduler.load_queue.lock().await;
                queue.push(task);
                
                // URIを返す
                Ok(ImageData::Uri {
                    uri: Self::create_asset_uri(image_id),
                    format: Self::detect_format_from_path(&image_id.path)?,
                    size: ImageSize { width: 0, height: 0 }, // サイズは不明
                })
            }
        }
    }
    
    async fn preload_image(
        &self,
        image_id: &ImageId,
        priority: LoadPriority,
    ) -> Result<(), ImageError> {
        // 既にキャッシュにあるかチェック
        if Self::get_from_cache(image_id, &self.image_cache).is_some() {
            return Ok(());
        }
        
        // 読み込みオプション
        let options = ImageLoadOptions {
            cache_mode: CacheMode::UseCache,
            max_display_size: None,
            priority,
            cancel_token: None,
            additional_options: HashMap::new(),
        };
        
        // タスクをキューに追加
        let task = LoadTask {
            image_id: image_id.clone(),
            priority,
            options,
            created_at: Utc::now(),
        };
        
        let mut queue = self.load_scheduler.load_queue.lock().await;
        queue.push(task);
        
        Ok(())
    }
    
    async fn get_image_metadata(
        &self,
        image_id: &ImageId,
    ) -> Result<ImageMetadata, ImageError> {
        // キャッシュチェック
        if let Some(cached_image) = Self::get_from_cache(image_id, &self.image_cache) {
            return Ok(cached_image.info.metadata);
        }
        
        // ファイルからメタデータを取得
        let path = &image_id.path;
        
        if !path.exists() || !path.is_file() {
            return Err(ImageError::FileSystemError(format!(
                "指定されたパスはファイルではありません: {}", 
                path.display()
            )));
        }
        
        // ファイルメタデータの取得
        let file_metadata = tokio::fs::metadata(path).await
            .map_err(|e| ImageError::FileSystemError(format!("メタデータ取得エラー: {}", e)))?;
        
        // ファイルサイズ
        let file_size = file_metadata.len();
        
        // 更新日時と作成日時
        let modified = file_metadata.modified()
            .map(|time| DateTime::<Utc>::from(time))
            .ok();
            
        let created = file_metadata.created()
            .map(|time| DateTime::<Utc>::from(time))
            .ok();
        
        // 画像形式を拡張子から判断
        let format = Self::detect_format_from_path(path)?;
        
        // 画像を部分的に読み込んでサイズを確認（ヘッダーのみ）
        // 実際の実装では画像処理ライブラリやexif-readerなどを使用
        let size = ImageSize { width: 0, height: 0 }; // 簡略化のため0x0とする
        
        let metadata = ImageMetadata {
            size,
            format,
            file_size,
            created,
            modified,
            exif: None, // 簡略化のためなし
            additional: HashMap::new(),
        };
        
        Ok(metadata)
    }
    
    fn unload_image(&self, image_id: &ImageId) -> Result<(), ImageError> {
        // キャッシュから削除
        let mut cache_guard = self.image_cache.write().unwrap();
        
        if let Some(image) = cache_guard.images.remove(image_id) {
            // メモリ使用量を更新
            cache_guard.current_size -= image.memory_usage;
            
            // LRUリストから削除
            let position = cache_guard.lru_list.iter().position(|id| id == image_id);
            if let Some(index) = position {
                let mut cursor = cache_guard.lru_list.cursor_front_mut();
                for _ in 0..index {
                    cursor.move_next();
                }
                cursor.remove_current();
            }
            
            // メモリモニターを更新
            if let Some(data) = &image.data {
                self.memory_monitor.current_usage.fetch_sub(data.len() as u64, Ordering::Relaxed);
            }
        }
        
        // サムネイルキャッシュからも削除
        let mut thumbnail_cache = self.thumbnail_cache.write().unwrap();
        
        // 全サイズのサムネイルを削除
        let to_remove: Vec<_> = thumbnail_cache.thumbnails.keys()
            .filter(|(id, _)| id == image_id)
            .map(|k| k.clone())
            .collect();
            
        for key in to_remove {
            if let Some(thumbnail) = thumbnail_cache.thumbnails.remove(&key) {
                thumbnail_cache.current_size -= thumbnail.memory_usage;
                
                // LRUリストから削除
                let position = thumbnail_cache.lru_list.iter().position(|k| k == &key);
                if let Some(index) = position {
                    let mut cursor = thumbnail_cache.lru_list.cursor_front_mut();
                    for _ in 0..index {
                        cursor.move_next();
                    }
                    cursor.remove_current();
                }
            }
        }
        
        Ok(())
    }
    
    fn clear_cache(&self, strategy: CacheCleanupStrategy) -> Result<usize, ImageError> {
        let mut count = 0;
        
        // 画像キャッシュをクリア
        {
            let mut cache_guard = self.image_cache.write().unwrap();
            
            match strategy {
                CacheCleanupStrategy::All => {
                    // すべてクリア
                    count = cache_guard.images.len();
                    cache_guard.images.clear();
                    cache_guard.lru_list.clear();
                    cache_guard.current_size = 0;
                },
                CacheCleanupStrategy::OlderThan(duration) => {
                    // 指定時間以上アクセスされていないものを削除
                    let now = Utc::now();
                    let to_remove: Vec<_> = cache_guard.images.iter()
                        .filter(|(_, image)| now - image.last_accessed > duration)
                        .map(|(id, _)| id.clone())
                        .collect();
                        
                    count = to_remove.len();
                    
                    for id in to_remove {
                        if let Some(image) = cache_guard.images.remove(&id) {
                            cache_guard.current_size -= image.memory_usage;
                            
                            // LRUリストから削除
                            let position = cache_guard.lru_list.iter().position(|i| i == &id);
                            if let Some(index) = position {
                                let mut cursor = cache_guard.lru_list.cursor_front_mut();
                                for _ in 0..index {
                                    cursor.move_next();
                                }
                                cursor.remove_current();
                            }
                        }
                    }
                },
                CacheCleanupStrategy::LargerThan(size) => {
                    // 指定サイズ以上のものを削除
                    let to_remove: Vec<_> = cache_guard.images.iter()
                        .filter(|(_, image)| {
                            if let Some(data) = &image.data {
                                data.len() as u64 > size
                            } else {
                                false
                            }
                        })
                        .map(|(id, _)| id.clone())
                        .collect();
                        
                    count = to_remove.len();
                    
                    for id in to_remove {
                        if let Some(image) = cache_guard.images.remove(&id) {
                            cache_guard.current_size -= image.memory_usage;
                            
                            // LRUリストから削除
                            let position = cache_guard.lru_list.iter().position(|i| i == &id);
                            if let Some(index) = position {
                                let mut cursor = cache_guard.lru_list.cursor_front_mut();
                                for _ in 0..index {
                                    cursor.move_next();
                                }
                                cursor.remove_current();
                            }
                        }
                    }
                },
                CacheCleanupStrategy::ReduceTo(target_size) => {
                    // 指定サイズまで削減
                    while cache_guard.current_size > target_size && !cache_guard.lru_list.is_empty() {
                        if let Some(id) = cache_guard.lru_list.pop_front() {
                            if let Some(image) = cache_guard.images.remove(&id) {
                                cache_guard.current_size -= image.memory_usage;
                                count += 1;
                            }
                        }
                    }
                },
            }
        }
        
        // サムネイルキャッシュもクリア
        {
            let mut cache_guard = self.thumbnail_cache.write().unwrap();
            
            match strategy {
                CacheCleanupStrategy::All => {
                    // すべてクリア
                    count += cache_guard.thumbnails.len();
                    cache_guard.thumbnails.clear();
                    cache_guard.lru_list.clear();
                    cache_guard.current_size = 0;
                },
                // 他の戦略も同様に実装
                _ => { /* 簡略化のため省略 */ }
            }
        }
        
        // メモリモニターを更新
        self.memory_monitor.current_usage.store(
            self.image_cache.read().unwrap().current_size +
            self.thumbnail_cache.read().unwrap().current_size,
            Ordering::Relaxed
        );
        
        Ok(count)
    }
    
    fn get_image_uri(&self, image_id: &ImageId) -> String {
        Self::create_asset_uri(image_id)
    }
    
    async fn get_paginated_images(
        &self,
        page: usize,
        page_size: usize,
    ) -> Result<PaginatedImageResult, ImageError> {
        // 現在のコンテキストから画像を取得
        let context = self.current_context.read().unwrap();
        let total_count = context.total_count;
        
        // ページの範囲を確認
        let start = page * page_size;
        if start >= total_count {
            return Err(ImageError::Other(format!(
                "ページが範囲外です: {} (合計: {}ページ)",
                page,
                (total_count + page_size - 1) / page_size
            )));
        }
        
        // ページの終わりを計算
        let end = (start + page_size).min(total_count);
        
        // スライスを取得
        let images = context.images[start..end].to_vec();
        
        // 総ページ数を計算
        let total_pages = (total_count + page_size - 1) / page_size;
        
        Ok(PaginatedImageResult {
            images,
            total_count,
            current_page: page,
            total_pages,
        })
    }
    
    fn optimize_memory(&self) -> Result<OptimizationResult, ImageError> {
        // 現在のメモリ使用量を取得
        let current_usage = self.memory_monitor.current_usage.load(Ordering::Relaxed);
        
        // 最適化の必要があるかどうかをチェック
        let critical_threshold = (self.memory_monitor.max_memory as f64 * self.memory_monitor.critical_threshold) as u64;
        let warning_threshold = (self.memory_monitor.max_memory as f64 * self.memory_monitor.warning_threshold) as u64;
        
        let mut removed_images = 0;
        
        if current_usage > critical_threshold {
            // 重大レベル: 強制的にキャッシュを50%に削減
            let target_size = self.memory_monitor.max_memory / 2;
            removed_images = self.clear_cache(CacheCleanupStrategy::ReduceTo(target_size))?;
        } else if current_usage > warning_threshold {
            // 警告レベル: 一定期間アクセスされていないものを削除
            let five_minutes = Duration::minutes(5);
            removed_images = self.clear_cache(CacheCleanupStrategy::OlderThan(five_minutes))?;
        }
        
        // 最適化後のメモリ使用量
        let new_usage = self.memory_monitor.current_usage.load(Ordering::Relaxed);
        
        Ok(OptimizationResult {
            freed_memory: current_usage - new_usage,
            removed_images,
            current_usage: new_usage,
        })
    }
    
    fn get_cache_stats(&self) -> CacheStatistics {
        let image_cache = self.image_cache.read().unwrap();
        let thumbnail_cache = self.thumbnail_cache.read().unwrap();
        
        let hit_count = self.cache_stats.hits.load(Ordering::Relaxed);
        let miss_count = self.cache_stats.misses.load(Ordering::Relaxed);
        
        let total_count = hit_count + miss_count;
        let hit_ratio = if total_count > 0 {
            hit_count as f64 / total_count as f64
        } else {
            0.0
        };
        
        CacheStatistics {
            image_count: image_cache.images.len(),
            thumbnail_count: thumbnail_cache.thumbnails.len(),
            memory_usage: image_cache.current_size + thumbnail_cache.current_size,
            hit_count,
            miss_count,
            hit_ratio,
        }
    }
}
```

### 3.4 ヘルパーメソッドの実装

```rust
impl ImageResourceManagerImpl {
    /// 指定したディレクトリから画像を収集
    async fn collect_images(
        &self,
        directory: &Path,
        recursive: bool,
        include_filters: &[String],
        exclude_filters: &[String],
        result: &mut Vec<ImageInfo>,
    ) -> Result<(), ImageError> {
        // ディレクトリ内のエントリを取得
        let mut entries = tokio::fs::read_dir(directory).await
            .map_err(|e| ImageError::FileSystemError(format!(
                "ディレクトリの読み取りに失敗: {}", e
            )))?;
        
        while let Some(entry) = entries.next_entry().await
            .map_err(|e| ImageError::FileSystemError(format!(
                "ディレクトリエントリの読み取りに失敗: {}", e
            )))? {
            
            let path = entry.path();
            
            // ディレクトリの場合は再帰的に処理
            if path.is_dir() && recursive {
                self.collect_images(&path, recursive, include_filters, exclude_filters, result).await?;
                continue;
            }
            
            // 画像ファイルかどうかをチェック
            if !path.is_file() || !self.is_image_file(&path, include_filters, exclude_filters) {
                continue;
            }
            
            // 画像情報を作成
            let image_id = ImageId {
                path: path.clone(),
                unique_id: Self::create_unique_id(&path),
            };
            
            // メタデータの取得
            match self.get_image_metadata(&image_id).await {
                Ok(metadata) => {
                    let info = ImageInfo {
                        id: image_id.clone(),
                        metadata,
                        load_state: ImageLoadState::NotLoaded,
                        thumbnail_uri: None,
                        asset_uri: Self::create_asset_uri(&image_id),
                        last_accessed: Utc::now(),
                    };
                    
                    result.push(info);
                },
                Err(e) => {
                    // エラーは記録するが処理は続行
                    self.error_handler.handle_error(&e, Some(&image_id));
                }
            }
        }
        
        Ok(())
    }
    
    /// 指定したパスが画像ファイルかどうかを判定
    fn is_image_file(
        &self,
        path: &Path,
        include_filters: &[String],
        exclude_filters: &[String],
    ) -> bool {
        // ファイル名を取得
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_lowercase(),
            None => return false,
        };
        
        // 拡張子をチェック
        let extension = match path.extension().and_then(|e| e.to_str()) {
            Some(ext) => ext.to_lowercase(),
            None => return false,
        };
        
        // 画像ファイルの拡張子をチェック
        let is_image_ext = match extension.as_str() {
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" => true,
            _ => false,
        };
        
        if !is_image_ext {
            return false;
        }
        
        // 除外フィルターをチェック
        for pattern in exclude_filters {
            if Self::match_pattern(&file_name, pattern) {
                return false;
            }
        }
        
        // 包含フィルターが空なら全ての画像ファイルを含める
        if include_filters.is_empty() {
            return true;
        }
        
        // 包含フィルターをチェック
        for pattern in include_filters {
            if Self::match_pattern(&file_name, pattern) {
                return true;
            }
        }
        
        false
    }
    
    /// ファイル名がパターンにマッチするかチェック
    fn match_pattern(file_name: &str, pattern: &str) -> bool {
        // 実際の実装ではglobパターンマッチングなどを使用
        // 簡略化のため単純な部分文字列チェック
        file_name.contains(pattern)
    }
    
    /// 一意なIDを生成
    fn create_unique_id(path: &Path) -> String {
        // 実際の実装ではパスのハッシュやUUIDを使用
        // 簡略化のためパス文字列をそのまま使用
        path.to_string_lossy().to_string()
    }
    
    /// サムネイルキャッシュからサムネイルを取得
    fn get_thumbnail_from_cache(
        &self,
        image_id: &ImageId,
        size: ThumbnailSize,
    ) -> Option<CachedThumbnail> {
        let mut cache = self.thumbnail_cache.write().unwrap();
        
        let key = (image_id.clone(), size);
        
        if let Some(thumbnail) = cache.thumbnails.get(&key) {
            // LRUリストを更新
            let position = cache.lru_list.iter().position(|k| k == &key);
            if let Some(index) = position {
                let mut cursor = cache.lru_list.cursor_front_mut();
                for _ in 0..index {
                    cursor.move_next();
                }
                if let Some(k) = cursor.remove_current() {
                    cache.lru_list.push_back(k);
                }
            }
            
            return Some(thumbnail.clone());
        }
        
        None
    }
    
    /// サムネイルをキャッシュに追加
    fn add_thumbnail_to_cache(
        &self,
        image_id: &ImageId,
        size: ThumbnailSize,
        data: &[u8],
        format: ImageFormat,
        thumbnail_size: ImageSize,
    ) -> Result<(), ImageError> {
        let mut cache = self.thumbnail_cache.write().unwrap();
        
        let key = (image_id.clone(), size);
        let data_size = data.len() as u64;
        
        // キャッシュサイズをチェック
        if cache.current_size + data_size > cache.max_size {
            // 最も古いサムネイルを削除
            while cache.current_size + data_size > cache.max_size && !cache.lru_list.is_empty() {
                if let Some(old_key) = cache.lru_list.pop_front() {
                    if let Some(old_thumbnail) = cache.thumbnails.remove(&old_key) {
                        cache.current_size -= old_thumbnail.memory_usage;
                    }
                }
            }
        }
        
        // サムネイルを追加
        let thumbnail = CachedThumbnail {
            data: Arc::new(data.to_vec()),
            format,
            size: thumbnail_size,
            last_accessed: Utc::now(),
            memory_usage: data_size,
        };
        
        cache.thumbnails.insert(key.clone(), thumbnail);
        cache.lru_list.push_back(key);
        cache.current_size += data_size;
        
        Ok(())
    }
    
    /// サムネイルサイズを計算
    fn calculate_thumbnail_size(&self, original: ImageSize, target_max: u32) -> ImageSize {
        // 元のサイズがすでに目標以下なら変更なし
        if original.width <= target_max && original.height <= target_max {
            return original;
        }
        
        // アスペクト比を維持したまま縮小
        let aspect_ratio = original.width as f32 / original.height as f32;
        
        if aspect_ratio >= 1.0 {
            // 横長画像
            let new_width = target_max;
            let new_height = (target_max as f32 / aspect_ratio) as u32;
            
            ImageSize {
                width: new_width,
                height: new_height,
            }
        } else {
            // 縦長画像
            let new_height = target_max;
            let new_width = (target_max as f32 * aspect_ratio) as u32;
            
            ImageSize {
                width: new_width,
                height: new_height,
            }
        }
    }
}

// トレイトの実装
impl ImageData {
    /// 画像サイズを取得
    pub fn get_size(&self) -> ImageSize {
        match self {
            ImageData::Binary { size, .. } => *size,
            ImageData::Uri { size, .. } => *size,
        }
    }
    
    /// 画像形式を取得
    pub fn get_format(&self) -> ImageFormat {
        match self {
            ImageData::Binary { format, .. } => *format,
            ImageData::Uri { format, .. } => *format,
        }
    }
}

impl Clone for CachedImage {
    fn clone(&self) -> Self {
        CachedImage {
            info: self.info.clone(),
            data: self.data.clone(),
            last_accessed: self.last_accessed,
            memory_usage: self.memory_usage,
        }
    }
}

impl Clone for CachedThumbnail {
    fn clone(&self) -> Self {
        CachedThumbnail {
            data: self.data.clone(),
            format: self.format,
            size: self.size,
            last_accessed: self.last_accessed,
            memory_usage: self.memory_usage,
        }
    }
}
```

## 4. Error Handling

### 4.1 エラーハンドラの実装

```rust
/// 画像エラーハンドラの実装
impl ImageErrorHandler {
    /// 新しいエラーハンドラを作成
    pub fn new(max_history_size: usize) -> Self {
        ImageErrorHandler {
            error_history: RwLock::new(VecDeque::with_capacity(max_history_size)),
            error_listeners: RwLock::new(Vec::new()),
            max_history_size,
        }
    }
    
    /// エラーを処理
    pub fn handle_error(&self, error: &ImageError, image_id: Option<&ImageId>) {
        // エラーをログに記録
        if let Some(id) = image_id {
            eprintln!("画像エラー [{}]: {}", id.path.display(), error);
        } else {
            eprintln!("画像エラー: {}", error);
        }
        
        // エラー履歴に追加
        {
            let mut history = self.error_history.write().unwrap();
            
            // 最大サイズを超えたら古いものを削除
            if history.len() >= self.max_history_size {
                history.pop_front();
            }
            
            history.push_back((error.clone(), Utc::now()));
        }
        
        // すべてのリスナーに通知
        let listeners = self.error_listeners.read().unwrap();
        for listener in listeners.iter() {
            listener(error);
        }
    }
    
    /// エラーリスナーを追加
    pub fn add_error_listener(&self, listener: Box<dyn Fn(&ImageError) + Send + Sync>) {
        let mut listeners = self.error_listeners.write().unwrap();
        listeners.push(listener);
    }
    
    /// 最近のエラー履歴を取得
    pub fn get_error_history(&self, limit: usize) -> Vec<(ImageError, DateTime<Utc>)> {
        let history = self.error_history.read().unwrap();
        
        history.iter()
            .rev()
            .take(limit)
            .cloned()
            .collect()
    }
    
    /// エラー履歴をクリア
    pub fn clear_error_history(&self) {
        let mut history = self.error_history.write().unwrap();
        history.clear();
    }
}
```

### 4.2 エラー回復戦略

```rust
/// 画像エラーからの回復戦略
impl ImageResourceManagerImpl {
    /// エラー発生時の回復処理
    async fn recover_from_error(
        &self,
        error: &ImageError,
        image_id: &ImageId,
    ) -> Result<(), ImageError> {
        match error {
            ImageError::LoadError(_) => {
                // 読み込みエラーの場合：キャッシュからクリアして再試行
                self.unload_image(image_id)?;
                
                // URIで代替
                self.event_manager.emit(
                    "image-loading-fallback",
                    ImageLoadingFallbackEvent {
                        image_id: image_id.clone(),
                        fallback_uri: Some(Self::create_asset_uri(image_id)),
                        error: error.to_string(),
                    },
                    EventCategory::Resource,
                    EventDirection::BackToFront,
                ).map_err(|e| ImageError::Other(format!("イベント送信エラー: {}", e)))?;
            },
            ImageError::OutOfMemory(_) => {
                // メモリ不足の場合：緊急メモリ最適化
                self.optimize_memory()?;
                
                // 低優先度で再試行をスケジュール
                let options = ImageLoadOptions {
                    cache_mode: CacheMode::RefreshCache,
                    max_display_size: None,
                    priority: LoadPriority::Low,
                    cancel_token: None,
                    additional_options: HashMap::new(),
                };
                
                let task = LoadTask {
                    image_id: image_id.clone(),
                    priority: LoadPriority::Low,
                    options,
                    created_at: Utc::now(),
                };
                
                let mut queue = self.load_scheduler.load_queue.lock().await;
                queue.push(task);
            },
            ImageError::InvalidFormat(_) => {
                // 無効な形式の場合：エラー画像で代替
                self.event_manager.emit(
                    "image-loading-fallback",
                    ImageLoadingFallbackEvent {
                        image_id: image_id.clone(),
                        fallback_uri: None, // 実際の実装ではエラー画像のURIを設定
                        error: error.to_string(),
                    },
                    EventCategory::Resource,
                    EventDirection::BackToFront,
                ).map_err(|e| ImageError::Other(format!("イベント送信エラー: {}", e)))?;
            },
            _ => {
                // その他のエラー：フォールバック通知のみ
                self.event_manager.emit(
                    "image-error",
                    ImageErrorEvent {
                        image_id: image_id.clone(),
                        error: error.to_string(),
                    },
                    EventCategory::Resource,
                    EventDirection::BackToFront,
                ).map_err(|e| ImageError::Other(format!("イベント送信エラー: {}", e)))?;
            }
        }
        
        Ok(())
    }
}

/// 画像読み込みフォールバックイベント
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ImageLoadingFallbackEvent {
    /// 画像ID
    image_id: ImageId,
    /// フォールバックURI
    fallback_uri: Option<String>,
    /// エラーメッセージ
    error: String,
}

/// 画像エラーイベント
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ImageErrorEvent {
    /// 画像ID
    image_id: ImageId,
    /// エラーメッセージ
    error: String,
}

/// 画像読み込み完了イベント
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ImageLoadedEvent {
    /// 画像ID
    image_id: ImageId,
    /// 画像サイズ
    size: ImageSize,
}

/// ディレクトリ読み込み完了イベント
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DirectoryLoadedEvent {
    /// ディレクトリパス
    directory: String,
    /// 画像数
    image_count: usize,
}
```

## 5. Performance Considerations

### 5.1 メモリ使用量の最適化

```rust
/// メモリモニターの実装
impl MemoryMonitor {
    /// 新しいメモリモニターを作成
    pub fn new(max_memory: u64, warning_threshold: f64, critical_threshold: f64) -> Self {
        MemoryMonitor {
            max_memory,
            warning_threshold,
            critical_threshold,
            current_usage: AtomicU64::new(0),
        }
    }
    
    /// メモリ使用量の更新
    pub fn update_memory_usage(&self, usage: u64) {
        self.current_usage.store(usage, Ordering::Relaxed);
    }
    
    /// メモリ使用量を増加
    pub fn increase_memory_usage(&self, amount: u64) -> u64 {
        self.current_usage.fetch_add(amount, Ordering::Relaxed) + amount
    }
    
    /// メモリ使用量を減少
    pub fn decrease_memory_usage(&self, amount: u64) -> u64 {
        let current = self.current_usage.load(Ordering::Relaxed);
        let new_usage = if amount > current { 0 } else { current - amount };
        self.current_usage.store(new_usage, Ordering::Relaxed);
        new_usage
    }
    
    /// 警告レベルを超えているかチェック
    pub fn is_above_warning_threshold(&self) -> bool {
        let current = self.current_usage.load(Ordering::Relaxed);
        let warning_level = (self.max_memory as f64 * self.warning_threshold) as u64;
        current > warning_level
    }
    
    /// 重大レベルを超えているかチェック
    pub fn is_above_critical_threshold(&self) -> bool {
        let current = self.current_usage.load(Ordering::Relaxed);
        let critical_level = (self.max_memory as f64 * self.critical_threshold) as u64;
        current > critical_level
    }
    
    /// 最適化が必要かチェック
    pub fn needs_optimization(&self) -> bool {
        self.is_above_warning_threshold()
    }
    
    /// 現在のメモリ使用率を取得
    pub fn get_usage_ratio(&self) -> f64 {
        let current = self.current_usage.load(Ordering::Relaxed);
        current as f64 / self.max_memory as f64
    }
}
```

### 5.2 画像プリフェッチと事前読み込み

```rust
/// 画像プリフェッチ戦略
impl ImageResourceManagerImpl {
    /// 現在の画像の周囲の画像をプリフェッチ
    pub async fn prefetch_surrounding_images(
        &self,
        current_index: usize,
        prefetch_count: usize,
    ) -> Result<(), ImageError> {
        // 現在のコンテキストから画像リストを取得
        let context = self.current_context.read().unwrap();
        let images = &context.images;
        
        if images.is_empty() || current_index >= images.len() {
            return Ok(());
        }
        
        // 現在の画像の前後をプリフェッチ
        let start = current_index.saturating_sub(prefetch_count);
        let end = (current_index + prefetch_count + 1).min(images.len());
        
        // プリフェッチする画像IDのリスト
        let mut prefetch_ids = Vec::new();
        
        // 前方画像
        for i in start..current_index {
            prefetch_ids.push(images[i].id.clone());
        }
        
        // 後方画像
        for i in (current_index + 1)..end {
            prefetch_ids.push(images[i].id.clone());
        }
        
        // 優先度を設定：現在の画像に近いものほど高優先度
        for (i, id) in prefetch_ids.iter().enumerate() {
            let priority = if i < prefetch_count / 2 {
                LoadPriority::Normal
            } else {
                LoadPriority::Low
            };
            
            // プリロード
            self.preload_image(id, priority).await?;
        }
        
        Ok(())
    }
    
    /// サムネイルの一括プリロード
    pub async fn preload_thumbnails(
        &self,
        page: usize,
        page_size: usize,
        thumbnail_size: ThumbnailSize,
    ) -> Result<(), ImageError> {
        // ページの画像を取得
        let images = self.get_paginated_images(page, page_size).await?.images;
        
        // 各画像のサムネイルを並列に生成
        use futures::stream::{self, StreamExt};
        
        stream::iter(images)
            .map(|image| {
                let this = self.clone();
                let id = image.id.clone();
                
                async move {
                    let _ = this.get_thumbnail(&id, thumbnail_size).await;
                }
            })
            .buffer_unordered(4) // 最大4つ同時実行
            .collect::<Vec<_>>()
            .await;
            
        Ok(())
    }
}

impl Clone for ImageResourceManagerImpl {
    fn clone(&self) -> Self {
        ImageResourceManagerImpl {
            app_handle: self.app_handle.clone(),
            resource_loader: self.resource_loader.clone(),
            state_controller: self.state_controller.clone(),
            event_manager: self.event_manager.clone(),
            image_cache: self.image_cache.clone(),
            thumbnail_cache: self.thumbnail_cache.clone(),
            current_context: self.current_context.clone(),
            memory_monitor: self.memory_monitor.clone(),
            load_scheduler: self.load_scheduler.clone(),
            cache_stats: self.cache_stats.clone(),
            error_handler: self.error_handler.clone(),
        }
    }
}
```

### 5.3 並列画像処理

```rust
/// 並列画像処理用のユーティリティ
impl ImageResourceManagerImpl {
    /// 複数画像の並列読み込み
    pub async fn load_images_parallel(
        &self,
        image_ids: Vec<ImageId>,
        options: ImageLoadOptions,
        max_concurrent: usize,
    ) -> Vec<Result<(ImageId, ImageData), (ImageId, ImageError)>> {
        use futures::stream::{self, StreamExt};
        
        // 読み込みタスクを作成
        let load_tasks = image_ids.into_iter().map(|id| {
            let this = self.clone();
            let options = options.clone();
            
            async move {
                match this.load_image(&id, options).await {
                    Ok(data) => Ok((id, data)),
                    Err(err) => Err((id, err)),
                }
            }
        });
        
        // 並列実行
        stream::iter(load_tasks)
            .buffer_unordered(max_concurrent)
            .collect::<Vec<_>>()
            .await
    }
    
    /// 指定したディレクトリ内のすべての画像を並列に検証
    pub async fn validate_all_images(
        &self,
        directory: &Path,
        recursive: bool,
    ) -> Result<ValidationSummary, ImageError> {
        // ディレクトリ内の画像を取得
        let images = self.list_images(directory, recursive, Vec::new(), Vec::new()).await?;
        
        // 各画像を並列に検証
        use futures::stream::{self, StreamExt};
        
        let validation_tasks = images.into_iter().map(|info| {
            let this = self.clone();
            
            async move {
                let metadata = this.get_image_metadata(&info.id).await;
                
                ValidationResult {
                    image_id: info.id,
                    success: metadata.is_ok(),
                    error: metadata.err().map(|e| e.to_string()),
                }
            }
        });
        
        // 並列実行（最大8並列）
        let results = stream::iter(validation_tasks)
            .buffer_unordered(8)
            .collect::<Vec<_>>()
            .await;
            
        // 結果を集計
        let total = results.len();
        let success_count = results.iter().filter(|r| r.success).count();
        let error_count = total - success_count;
        
        let errors: Vec<_> = results.iter()
            .filter(|r| !r.success)
            .map(|r| (r.image_id.clone(), r.error.clone().unwrap_or_default()))
            .collect();
            
        Ok(ValidationSummary {
            total,
            success_count,
            error_count,
            errors,
        })
    }
}

/// 画像検証結果
struct ValidationResult {
    /// 画像ID
    image_id: ImageId,
    /// 検証成功フラグ
    success: bool,
    /// エラーメッセージ（あれば）
    error: Option<String>,
}

/// 検証結果サマリー
struct ValidationSummary {
    /// 合計画像数
    total: usize,
    /// 成功数
    success_count: usize,
    /// エラー数
    error_count: usize,
    /// エラーのあった画像とメッセージ
    errors: Vec<(ImageId, String)>,
}
```

## 6. Integration with Existing Code

### 6.1 poir-viewerとの統合

```rust
/// setup関数を追加して初期化を行う
pub fn setup_image_resource_manager(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // 既存のSimpleStateControllerを取得
    let state_controller = app.state::<Arc<dyn SimpleStateController>>()
        .ok_or("StateControllerが初期化されていません")?;
    
    // 既存のTauriEventManagerを取得
    let event_manager = app.state::<Arc<dyn TauriEventManager>>()
        .ok_or("EventManagerが初期化されていません")?;
    
    // ResourceLoaderを取得または作成
    let resource_loader = match app.state::<Arc<dyn ResourceLoader>>() {
        Some(loader) => loader.clone(),
        None => {
            // ResourceLoaderが登録されていない場合は新規作成
            let loader = Arc::new(CompositeResourceLoader::new(vec![
                Box::new(FileResourceLoader::new(app_handle.clone())),
            ]));
            
            // アプリケーションステートとして登録
            app.manage(loader.clone());
            
            loader
        }
    };
    
    // 設定を作成
    let config = ImageResourceManagerConfig {
        image_cache_size: 100 * 1024 * 1024, // 100MB
        thumbnail_cache_size: 20 * 1024 * 1024, // 20MB
        max_memory: 200 * 1024 * 1024, // 200MB
        warning_threshold: 0.7, // 70%
        critical_threshold: 0.9, // 90%
        max_concurrent_loads: 4,
        error_history_size: 50,
    };
    
    // ImageResourceManagerを作成
    let image_manager = Arc::new(ImageResourceManagerImpl::new(
        app_handle.clone(),
        resource_loader,
        state_controller.clone(),
        event_manager.clone(),
        config,
    ));
    
    // アプリケーションステートとして登録
    app.manage(image_manager.clone());
    
    // コマンドハンドラを登録
    setup_image_resource_commands(app, image_manager)?;
    
    // イベントリスナーをセットアップ
    setup_image_resource_events(app)?;
    
    Ok(())
}

/// ImageResourceManager設定
pub struct ImageResourceManagerConfig {
    /// 画像キャッシュの最大サイズ（バイト）
    pub image_cache_size: u64,
    /// サムネイルキャッシュの最大サイズ（バイト）
    pub thumbnail_cache_size: u64,
    /// 全体の最大メモリ使用量（バイト）
    pub max_memory: u64,
    /// 警告閾値（最大値に対する割合）
    pub warning_threshold: f64,
    /// 重大閾値（最大値に対する割合）
    pub critical_threshold: f64,
    /// 最大同時読み込み数
    pub max_concurrent_loads: usize,
    /// エラー履歴の最大サイズ
    pub error_history_size: usize,
}
```

### 6.2 Tauri コマンドハンドラ

```rust
/// ImageResourceManagerのコマンドハンドラをセットアップ
fn setup_image_resource_commands(
    app: &mut tauri::App,
    image_manager: Arc<ImageResourceManagerImpl>,
) -> Result<(), Box<dyn std::error::Error>> {
    // 既存のコマンドとの重複を避けるため、必要なものだけをラップして登録
    app.register_invoke_handler("list_images", {
        let manager = image_manager.clone();
        move |args: ImageListArgs| async move {
            list_images_command(args, &manager).await
        }
    });
    
    app.register_invoke_handler("load_image", {
        let manager = image_manager.clone();
        move |args: ImageLoadArgs| async move {
            load_image_command(args, &manager).await
        }
    });
    
    app.register_invoke_handler("get_thumbnail", {
        let manager = image_manager.clone();
        move |args: ThumbnailArgs| async move {
            get_thumbnail_command(args, &manager).await
        }
    });
    
    app.register_invoke_handler("get_paginated_images", {
        let manager = image_manager.clone();
        move |args: PaginationArgs| async move {
            get_paginated_images_command(args, &manager).await
        }
    });
    
    app.register_invoke_handler("clear_image_cache", {
        let manager = image_manager.clone();
        move |args: CacheClearArgs| async move {
            clear_cache_command(args, &manager).await
        }
    });
    
    app.register_invoke_handler("get_cache_stats", {
        let manager = image_manager.clone();
        move |_: Value| async move {
            get_cache_stats_command(&manager).await
        }
    });
    
    Ok(())
}

/// 画像リスト取得コマンドの引数
#[derive(Debug, Deserialize)]
struct ImageListArgs {
    /// ディレクトリパス
    directory: String,
    /// 再帰的に検索するか
    recursive: Option<bool>,
    /// 含めるパターン
    include_filters: Option<Vec<String>>,
    /// 除外パターン
    exclude_filters: Option<Vec<String>>,
}

/// 画像読み込みコマンドの引数
#[derive(Debug, Deserialize)]
struct ImageLoadArgs {
    /// 画像パス
    path: String,
    /// キャッシュモード
    cache_mode: Option<String>,
    /// 最大表示サイズ
    max_size: Option<ImageSizeArgs>,
    /// 読み込み優先度
    priority: Option<String>,
}

/// 画像サイズ引数
#[derive(Debug, Deserialize)]
struct ImageSizeArgs {
    width: u32,
    height: u32,
}

/// サムネイル取得コマンドの引数
#[derive(Debug, Deserialize)]
struct ThumbnailArgs {
    /// 画像パス
    path: String,
    /// サムネイルサイズ
    size: String,
    /// カスタムサイズ（sizeが"custom"の場合）
    custom_size: Option<u32>,
}

/// ページング引数
#[derive(Debug, Deserialize)]
struct PaginationArgs {
    /// ページ番号
    page: usize,
    /// ページあたりの項目数
    page_size: usize,
}

/// キャッシュクリア引数
#[derive(Debug, Deserialize)]
struct CacheClearArgs {
    /// クリア戦略
    strategy: String,
    /// OlderThan戦略の場合の時間（秒）
    older_than_seconds: Option<i64>,
    /// LargerThan戦略の場合のサイズ（バイト）
    larger_than: Option<u64>,
    /// ReduceTo戦略の場合の目標サイズ（バイト）
    target_size: Option<u64>,
}

/// 画像リスト取得コマンド
async fn list_images_command(
    args: ImageListArgs,
    manager: &ImageResourceManagerImpl,
) -> Result<Vec<ImageInfo>, String> {
    let directory = PathBuf::from(args.directory);
    let recursive = args.recursive.unwrap_or(false);
    let include_filters = args.include_filters.unwrap_or_default();
    let exclude_filters = args.exclude_filters.unwrap_or_default();
    
    manager.list_images(&directory, recursive, include_filters, exclude_filters)
        .await
        .map_err(|e| e.to_string())
}

/// 画像読み込みコマンド
async fn load_image_command(
    args: ImageLoadArgs,
    manager: &ImageResourceManagerImpl,
) -> Result<Value, String> {
    // ImageIdを作成
    let image_id = ImageId {
        path: PathBuf::from(&args.path),
        unique_id: manager.create_unique_id(&PathBuf::from(&args.path)),
    };
    
    // キャッシュモードを解析
    let cache_mode = match args.cache_mode.as_deref() {
        Some("refresh") => CacheMode::RefreshCache,
        Some("no_cache") => CacheMode::NoCache,
        _ => CacheMode::UseCache,
    };
    
    // 読み込み優先度を解析
    let priority = match args.priority.as_deref() {
        Some("immediate") => LoadPriority::Immediate,
        Some("high") => LoadPriority::High,
        Some("low") => LoadPriority::Low,
        Some("background") => LoadPriority::Background,
        _ => LoadPriority::Normal,
    };
    
    // 最大サイズを解析
    let max_display_size = args.max_size.map(|size| ImageSize {
        width: size.width,
        height: size.height,
    });
    
    // 読み込みオプションを作成
    let options = ImageLoadOptions {
        cache_mode,
        max_display_size,
        priority,
        cancel_token: None,
        additional_options: HashMap::new(),
    };
    
    // 画像を読み込み
    let image_data = manager.load_image(&image_id, options)
        .await
        .map_err(|e| e.to_string())?;
    
    // 結果を変換
    match image_data {
        ImageData::Binary { data, format, size } => {
            Ok(json!({
                "type": "binary",
                "format": format_to_string(format),
                "width": size.width,
                "height": size.height,
                "data_size": data.len(),
                "data_base64": base64::encode(&data),
            }))
        },
        ImageData::Uri { uri, format, size } => {
            Ok(json!({
                "type": "uri",
                "format": format_to_string(format),
                "width": size.width,
                "height": size.height,
                "uri": uri,
            }))
        },
    }
}

/// 画像形式を文字列に変換するヘルパー関数
fn format_to_string(format: ImageFormat) -> String {
    match format {
        ImageFormat::JPEG => "jpeg".to_string(),
        ImageFormat::PNG => "png".to_string(),
        ImageFormat::GIF => "gif".to_string(),
        ImageFormat::WEBP => "webp".to_string(),
        ImageFormat::BMP => "bmp".to_string(),
        ImageFormat::Other(s) => s,
    }
}

/// サムネイル取得コマンド
async fn get_thumbnail_command(
    args: ThumbnailArgs,
    manager: &ImageResourceManagerImpl,
) -> Result<Value, String> {
    // ImageIdを作成
    let image_id = ImageId {
        path: PathBuf::from(&args.path),
        unique_id: manager.create_unique_id(&PathBuf::from(&args.path)),
    };
    
    // サムネイルサイズを解析
    let size = match args.size.as_str() {
        "small" => ThumbnailSize::Small(100),
        "medium" => ThumbnailSize::Medium(150),
        "large" => ThumbnailSize::Large(200),
        "custom" => {
            let custom_size = args.custom_size.unwrap_or(150);
            ThumbnailSize::Custom(custom_size)
        },
        _ => ThumbnailSize::Medium(150),
    };
    
    // サムネイルを取得
    let thumbnail = manager.get_thumbnail(&image_id, size)
        .await
        .map_err(|e| e.to_string())?;
    
    // 結果を変換
    match thumbnail {
        ImageData::Binary { data, format, size } => {
            Ok(json!({
                "type": "binary",
                "format": format_to_string(format),
                "width": size.width,
                "height": size.height,
                "data_size": data.len(),
                "data_base64": base64::encode(&data),
            }))
        },
        ImageData::Uri { uri, format, size } => {
            Ok(json!({
                "type": "uri",
                "format": format_to_string(format),
                "width": size.width,
                "height": size.height,
                "uri": uri,
            }))
        },
    }
}

/// ページング画像取得コマンド
async fn get_paginated_images_command(
    args: PaginationArgs,
    manager: &ImageResourceManagerImpl,
) -> Result<PaginatedImageResult, String> {
    manager.get_paginated_images(args.page, args.page_size)
        .await
        .map_err(|e| e.to_string())
}

/// キャッシュクリアコマンド
async fn clear_cache_command(
    args: CacheClearArgs,
    manager: &ImageResourceManagerImpl,
) -> Result<usize, String> {
    // クリア戦略を解析
    let strategy = match args.strategy.as_str() {
        "all" => CacheCleanupStrategy::All,
        "older_than" => {
            let seconds = args.older_than_seconds.unwrap_or(300);
            CacheCleanupStrategy::OlderThan(Duration::seconds(seconds))
        },
        "larger_than" => {
            let size = args.larger_than.unwrap_or(1024 * 1024); // デフォルト1MB
            CacheCleanupStrategy::LargerThan(size)
        },
        "reduce_to" => {
            let size = args.target_size.unwrap_or(50 * 1024 * 1024); // デフォルト50MB
            CacheCleanupStrategy::ReduceTo(size)
        },
        _ => CacheCleanupStrategy::All,
    };
    
    // キャッシュをクリア
    manager.clear_cache(strategy)
        .map_err(|e| e.to_string())
}

/// キャッシュ統計取得コマンド
async fn get_cache_stats_command(
    manager: &ImageResourceManagerImpl,
) -> Result<CacheStatistics, String> {
    Ok(manager.get_cache_stats())
}
```

### 6.3 既存モジュールとの連携

```rust
/// イベントリスナーをセットアップ
fn setup_image_resource_events(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // イベントマネージャを取得
    let event_manager = app.state::<Arc<dyn TauriEventManager>>()
        .ok_or("EventManagerが初期化されていません")?;
    
    // 画像マネージャを取得
    let image_manager = app.state::<Arc<ImageResourceManagerImpl>>()
        .ok_or("ImageResourceManagerが初期化されていません")?;
    
    // 画像読み込みイベントのリスナー
    event_manager.listen::<ImageLoadRequest>(
        "image-load-request",
        Box::new(move |event| {
            let image_manager = image_manager.clone();
            let app_handle = app_handle.clone();
            
            // 非同期処理を開始
            tauri::async_runtime::spawn(async move {
                let request = event.payload;
                
                // ImageIdを作成
                let image_id = ImageId {
                    path: PathBuf::from(&request.path),
                    unique_id: image_manager.create_unique_id(&PathBuf::from(&request.path)),
                };
                
                // 読み込みオプションを作成
                let options = ImageLoadOptions {
                    cache_mode: match request.cache_mode.as_str() {
                        "refresh" => CacheMode::RefreshCache,
                        "no_cache" => CacheMode::NoCache,
                        _ => CacheMode::UseCache,
                    },
                    max_display_size: None,
                    priority: match request.priority.as_str() {
                        "immediate" => LoadPriority::Immediate,
                        "high" => LoadPriority::High,
                        "low" => LoadPriority::Low,
                        "background" => LoadPriority::Background,
                        _ => LoadPriority::Normal,
                    },
                    cancel_token: None,
                    additional_options: HashMap::new(),
                };
                
                // 画像を読み込み
                match image_manager.load_image(&image_id, options).await {
                    Ok(image_data) => {
                        // 成功イベントを発行
                        let result = match image_data {
                            ImageData::Binary { format, size, .. } => ImageLoadResult {
                                request_id: request.request_id,
                                success: true,
                                format: format_to_string(format),
                                width: size.width,
                                height: size.height,
                                uri: image_manager.get_image_uri(&image_id),
                                error: None,
                            },
                            ImageData::Uri { uri, format, size } => ImageLoadResult {
                                request_id: request.request_id,
                                success: true,
                                format: format_to_string(format),
                                width: size.width,
                                height: size.height,
                                uri,
                                error: None,
                            },
                        };
                        
                        // イベントを発行
                        let _ = app_handle.emit_all("image-load-result", result);
                    },
                    Err(error) => {
                        // エラーイベントを発行
                        let result = ImageLoadResult {
                            request_id: request.request_id,
                            success: false,
                            format: String::new(),
                            width: 0,
                            height: 0,
                            uri: String::new(),
                            error: Some(error.to_string()),
                        };
                        
                        let _ = app_handle.emit_all("image-load-result", result);
                    }
                }
            });
            
            Ok(())
        })
    )?;
    
    // ResourceConfigAdapterとの連携
    integrate_with_resource_config(app)?;
    
    Ok(())
}

/// 画像読み込みリクエスト
#[derive(Debug, Clone, Deserialize)]
struct ImageLoadRequest {
    /// リクエストID
    request_id: String,
    /// 画像パス
    path: String,
    /// キャッシュモード
    cache_mode: String,
    /// 優先度
    priority: String,
}

/// 画像読み込み結果
#[derive(Debug, Clone, Serialize)]
struct ImageLoadResult {
    /// リクエストID
    request_id: String,
    /// 成功フラグ
    success: bool,
    /// 画像形式
    format: String,
    /// 画像幅
    width: u32,
    /// 画像高さ
    height: u32,
    /// 画像URI
    uri: String,
    /// エラーメッセージ（あれば）
    error: Option<String>,
}

/// ResourceConfigAdapterとの統合
fn integrate_with_resource_config(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // ResourceConfigAdapterを取得（存在すれば）
    let resource_config_adapter = app.state::<ResourceConfigAdapter>();
    
    if let Some(config_adapter) = resource_config_adapter {
        // 画像マネージャを取得
        let image_manager = app.state::<Arc<ImageResourceManagerImpl>>()
            .ok_or("ImageResourceManagerが初期化されていません")?;
        
        // 設定変更監視のためのイベントリスナーを設定
        app.listen("config-updated", move |_| {
            let image_manager = image_manager.clone();
            let app_handle = app_handle.clone();
            
            // 設定が更新されたらディレクトリコンテキストを更新
            tauri::async_runtime::spawn(async move {
                // 設定を取得
                if let Ok(config) = ResourceConfig::load(&app_handle) {
                    for dir in &config.filters.include {
                        // 各ディレクトリを画像リストに追加
                        let path = PathBuf::from(dir);
                        if path.exists() && path.is_dir() {
                            let _ = image_manager.list_images(
                                &path,
                                true, // 再帰的に
                                Vec::new(),
                                Vec::new()
                            ).await;
                        }
                    }
                }
            });
        });
    }
    
    Ok(())
}
```

### 6.4 段階的統合アプローチ

```rust
/// 段階的統合のための拡張ポイント
pub struct ImageResourceIntegration {
    /// 統合フェーズ
    phase: IntegrationPhase,
    /// 既存実装の使用フラグ
    use_legacy: bool,
    /// 画像マネージャ
    image_manager: Option<Arc<ImageResourceManagerImpl>>,
}

/// 統合フェーズ
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IntegrationPhase {
    /// 準備フェーズ（既存実装を維持）
    Preparation,
    /// 並行フェーズ（両方の実装が利用可能）
    Parallel,
    /// 移行フェーズ（新実装を優先）
    Migration,
    /// 完了フェーズ（新実装のみ）
    Completed,
}

impl ImageResourceIntegration {
    /// 新しい統合オブジェクトを作成
    pub fn new(phase: IntegrationPhase, use_legacy: bool) -> Self {
        ImageResourceIntegration {
            phase,
            use_legacy,
            image_manager: None,
        }
    }
    
    /// 画像マネージャを設定
    pub fn set_image_manager(&mut self, manager: Arc<ImageResourceManagerImpl>) {
        self.image_manager = Some(manager);
    }
    
    /// 現在の統合フェーズを取得
    pub fn current_phase(&self) -> IntegrationPhase {
        self.phase
    }
    
    /// 次のフェーズに進む
    pub fn advance_phase(&mut self) {
        self.phase = match self.phase {
            IntegrationPhase::Preparation => IntegrationPhase::Parallel,
            IntegrationPhase::Parallel => IntegrationPhase::Migration,
            IntegrationPhase::Migration => IntegrationPhase::Completed,
            IntegrationPhase::Completed => IntegrationPhase::Completed,
        };
        
        // 完了フェーズでは既存実装は使用しない
        if self.phase == IntegrationPhase::Completed {
            self.use_legacy = false;
        }
    }
    
    /// 画像リストを取得する統合メソッド
    pub async fn list_images(
        &self,
        directory: &Path,
        recursive: bool,
        include_filters: Vec<String>,
        exclude_filters: Vec<String>,
    ) -> Result<Vec<ImageInfo>, String> {
        match self.phase {
            IntegrationPhase::Preparation => {
                // 準備フェーズでは既存の実装のみを使用
                self.legacy_list_images(directory, recursive, include_filters, exclude_filters).await
            },
            IntegrationPhase::Parallel => {
                // 並行フェーズでは両方の実装を実行し結果を比較
                let legacy_result = self.legacy_list_images(
                    directory, recursive, include_filters.clone(), exclude_filters.clone()
                ).await;
                
                let new_result = if let Some(manager) = &self.image_manager {
                    manager.list_images(directory, recursive, include_filters, exclude_filters)
                        .await
                        .map_err(|e| e.to_string())
                } else {
                    Err("ImageResourceManagerが設定されていません".to_string())
                };
                
                // 実際に使用する実装を選択
                if self.use_legacy {
                    legacy_result
                } else {
                    new_result
                }
            },
            IntegrationPhase::Migration | IntegrationPhase::Completed => {
                // 移行・完了フェーズでは新しい実装を使用
                if let Some(manager) = &self.image_manager {
                    manager.list_images(directory, recursive, include_filters, exclude_filters)
                        .await
                        .map_err(|e| e.to_string())
                } else {
                    Err("ImageResourceManagerが設定されていません".to_string())
                }
            }
        }
    }
    
    /// 既存実装を呼び出す（仮実装）
    async fn legacy_list_images(
        &self,
        directory: &Path,
        recursive: bool,
        include_filters: Vec<String>,
        exclude_filters: Vec<String>,
    ) -> Result<Vec<ImageInfo>, String> {
        // 実際のpoir-viewerの既存実装を呼び出す
        // ここでは簡略化のためにダミー実装
        
        Err("既存実装が利用できません".to_string())
    }
    
    // 他のメソッドも同様に実装
}
```

## 7. Future Enhancements

### 7.1 サポート拡張

```rust
/// 今後のサポート拡張領域
pub enum SupportEnhancements {
    /// 新しい画像形式のサポート
    ImageFormats(Vec<String>),
    /// 画像メタデータの強化
    Metadata(MetadataEnhancements),
    /// リモート画像のサポート
    RemoteImages(RemoteImageSupport),
}

/// メタデータ強化
pub struct MetadataEnhancements {
    /// EXIFデータのフル解析
    exif_full_parsing: bool,
    /// ジオタグのサポート
    geotag_support: bool,
    /// 顔検出
    face_detection: bool,
    /// 画像タグ機能
    tagging: bool,
}

/// リモート画像サポート
pub struct RemoteImageSupport {
    /// HTTPサポート
    http: bool,
    /// FTPサポート
    ftp: bool,
    /// クラウドサービス
    cloud_services: Vec<String>,
    /// プリフェッチ制御
    prefetch_control: bool,
}

impl ImageResourceManagerImpl {
    /// 将来的な拡張: 新しい画像形式のサポート追加
    pub fn add_image_format_support(&mut self, format: &str) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
    
    /// 将来的な拡張: メタデータ抽出の強化
    pub fn enhance_metadata_extraction(&mut self, enhancements: MetadataEnhancements) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
    
    /// 将来的な拡張: リモート画像のサポート
    pub fn add_remote_image_support(&mut self, support: RemoteImageSupport) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
}
```

### 7.2 パフォーマンス最適化

```rust
/// 将来的なパフォーマンス最適化
pub enum PerformanceOptimization {
    /// 適応的メモリ管理
    AdaptiveMemoryManagement,
    /// ページングの最適化
    PagingOptimization,
    /// 画像処理の並列化強化
    EnhancedParallelProcessing,
    /// GPUアクセラレーション
    GpuAcceleration,
}

impl ImageResourceManagerImpl {
    /// 将来的な拡張: 適応的メモリ管理
    pub fn enable_adaptive_memory_management(&mut self, enabled: bool) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
    
    /// 将来的な拡張: 画像処理の並列化強化
    pub fn enhance_parallel_processing(&mut self, thread_count: usize) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
    
    /// 将来的な拡張: GPUアクセラレーションの有効化
    pub fn enable_gpu_acceleration(&mut self, enabled: bool) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
}
```

### 7.3 機能拡張

```rust
/// 将来的な機能拡張
pub enum FeatureEnhancements {
    /// 画像編集機能
    ImageEditing,
    /// 画像比較
    ImageComparison,
    /// 画像検索
    ImageSearch,
    /// バッチ処理
    BatchProcessing,
}

/// 画像編集機能
pub struct ImageEditingFeatures {
    /// 回転
    rotation: bool,
    /// クロップ
    cropping: bool,
    /// リサイズ
    resizing: bool,
    /// フィルター
    filters: Vec<String>,
}

/// 画像検索機能
pub struct ImageSearchFeatures {
    /// メタデータ検索
    metadata_search: bool,
    /// 内容ベース検索
    content_based_search: bool,
    /// 類似画像検索
    similar_image_search: bool,
}

impl ImageResourceManagerImpl {
    /// 将来的な拡張: 画像編集機能の追加
    pub fn add_editing_features(&mut self, features: ImageEditingFeatures) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
    
    /// 将来的な拡張: 画像検索機能の追加
    pub fn add_search_features(&mut self, features: ImageSearchFeatures) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
    
    /// 将来的な拡張: バッチ処理機能の追加
    pub fn enable_batch_processing(&mut self, enabled: bool) -> Result<(), ImageError> {
        // 実装例（将来の拡張ポイント）
        Ok(())
    }
}
```

### 7.4 研究領域

以下の研究領域は、ImageResourceManagerの将来的な発展のために探求すべき分野です。

1. **適応的リソース負荷予測**
   - ユーザー行動分析に基づく先読み
   - 使用パターンの学習とスマートなキャッシュ管理
   - コンテキスト認識型リソース割り当て

2. **機械学習統合**
   - コンテンツベースの画像分類
   - 自動タグ付け
   - 類似画像検索

3. **分散リソース管理**
   - 複数デバイス間での画像ライブラリの同期
   - エッジデバイスとクラウドストレージの統合
   - ピアツーピア画像共有

4. **インテリジェントなメモリ管理**
   - 画像の重要度に基づく優先度付けアルゴリズム
   - リアルタイムシステムリソース適応
   - コンテキスト依存のメモリポリシー

5. **ハイパフォーマンスレンダリング**
   - 先進的な画像圧縮と展開
   - プログレッシブローディング最適化
   - ハードウェアアクセラレーション技術

これらの研究領域は、画像リソース管理の効率性、使いやすさ、そして全体的なユーザーエクスペリエンスを大幅に向上させる可能性を持っています。実装に際しては、パフォーマンスと使いやすさのバランスを慎重に考慮することが重要です。
