# ResourceLoaderInterface Detailed Design Specification

## 1. Overview

ResourceLoaderInterfaceは、poir-viewerアプリケーションにおけるリソース（主に画像ファイル）の読み込みを抽象化するインターフェースです。Tauriの機能を活用しながらファイルシステムとの相互作用を標準化し、非同期処理とエラー処理のパターンを提供します。

### 1.1 Core Responsibilities
- リソース読み込みの抽象化
- 非同期読み込み処理のサポート
- 多様なリソースタイプ（画像、設定ファイルなど）の統一的な取り扱い
- エラー処理と回復メカニズム
- リソース情報の取得と検証
- キャッシュ制御のための基盤提供

### 1.2 Design Principles
- **シンプルさ**: 必要最小限のインターフェースで実用性を確保
- **型安全**: Rustの型システムを活用した安全な操作
- **非同期処理**: Rustの非同期処理メカニズムを活用
- **エラー処理**: 明確で回復可能なエラー処理
- **拡張性**: 将来的なリソースタイプや処理方法の追加を容易に
- **Tauri親和性**: Tauriのファイルシステム操作との自然な統合

## 2. Core Interface Definitions

### 2.1 基本トレイトと型定義

```rust
/// リソース読み込みの基本インターフェース
pub trait ResourceLoader: Send + Sync {
    /// リソースの存在確認
    async fn resource_exists(&self, resource_id: &ResourceId) -> Result<bool, ResourceError>;
    
    /// リソース情報の取得
    async fn get_resource_info(&self, resource_id: &ResourceId) -> Result<ResourceInfo, ResourceError>;
    
    /// リソースデータの読み込み
    async fn load_resource(
        &self,
        resource_id: &ResourceId,
        options: LoadOptions
    ) -> Result<ResourceData, ResourceError>;
    
    /// リソースのURIを取得（Tauriのassetプロトコルなどに変換）
    fn get_resource_uri(&self, resource_id: &ResourceId) -> String;
    
    /// 対応するリソースタイプの確認
    fn supports_resource_type(&self, resource_type: ResourceType) -> bool;
    
    /// リソースの検証
    async fn validate_resource(
        &self,
        resource_id: &ResourceId,
        validation_level: ValidationLevel
    ) -> Result<ValidationResult, ResourceError>;
}

/// リソースの種類
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ResourceType {
    /// 画像リソース
    Image,
    /// 設定ファイル
    Config,
    /// その他のリソース
    Other(String),
}

/// リソースの識別子
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ResourceId {
    /// リソースパス
    pub path: String,
    /// リソースタイプ
    pub resource_type: ResourceType,
    /// 追加識別情報
    pub metadata: HashMap<String, String>,
}
```

### 2.2 リソース情報とデータ構造

```rust
/// リソース情報
#[derive(Debug, Clone)]
pub struct ResourceInfo {
    /// リソースID
    pub id: ResourceId,
    /// リソースサイズ（バイト）
    pub size: u64,
    /// 最終更新日時
    pub modified: DateTime<Utc>,
    /// MIME タイプ
    pub mime_type: String,
    /// 追加メタデータ
    pub metadata: HashMap<String, Value>,
}

/// リソースデータ（読み込み結果）
#[derive(Debug)]
pub enum ResourceData {
    /// バイナリデータ
    Binary(Vec<u8>),
    /// テキストデータ
    Text(String),
    /// JSONデータ
    Json(Value),
    /// URIリファレンス（直接読み込まずURIを参照）
    Uri(String),
}
```

### 2.3 読み込みオプションと検証

```rust
/// 読み込みオプション
#[derive(Debug, Clone)]
pub struct LoadOptions {
    /// キャッシュ制御
    pub cache_mode: CacheMode,
    /// リソース変換タイプ
    pub load_as: LoadType,
    /// 読み込み優先度
    pub priority: LoadPriority,
    /// 追加オプション
    pub extra_options: HashMap<String, Value>,
}

/// キャッシュモード
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheMode {
    /// キャッシュを優先使用
    PreferCache,
    /// キャッシュを更新
    RefreshCache,
    /// キャッシュを使用しない
    NoCache,
}

/// 読み込むデータ形式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoadType {
    /// バイナリデータとして読み込み
    Binary,
    /// テキストデータとして読み込み
    Text,
    /// JSONデータとして読み込み
    Json,
    /// URIとして読み込み（直接データを読まない）
    Uri,
}

/// 読み込み優先度
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LoadPriority {
    /// 高優先度
    High,
    /// 標準優先度
    Normal,
    /// 低優先度
    Low,
    /// バックグラウンド優先度
    Background,
}

/// 検証レベル
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationLevel {
    /// 最小検証（存在確認のみ）
    Minimal,
    /// 基本検証（存在確認とファイルタイプ）
    Basic,
    /// 完全検証（内容の整合性も含む）
    Full,
}

/// 検証結果
#[derive(Debug, Clone)]
pub struct ValidationResult {
    /// 検証成功したか
    pub is_valid: bool,
    /// 検証の詳細
    pub details: HashMap<String, Value>,
    /// 警告メッセージ（あれば）
    pub warnings: Vec<String>,
}
```

### 2.4 エラー型定義

```rust
/// リソース関連のエラー
#[derive(Debug, Clone)]
pub enum ResourceError {
    /// リソースが見つからない
    NotFound(String),
    /// I/Oエラー
    IoError(String),
    /// 無効なリソース
    InvalidResource(String),
    /// フォーマットエラー
    FormatError(String),
    /// アクセス権限エラー
    AccessDenied(String),
    /// リソースタイプがサポートされていない
    UnsupportedType(String),
    /// その他のエラー
    Other(String),
}

impl std::fmt::Display for ResourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResourceError::NotFound(msg) => write!(f, "リソースが見つかりません: {}", msg),
            ResourceError::IoError(msg) => write!(f, "I/Oエラー: {}", msg),
            ResourceError::InvalidResource(msg) => write!(f, "無効なリソース: {}", msg),
            ResourceError::FormatError(msg) => write!(f, "フォーマットエラー: {}", msg),
            ResourceError::AccessDenied(msg) => write!(f, "アクセス拒否: {}", msg),
            ResourceError::UnsupportedType(msg) => write!(f, "未対応の形式: {}", msg),
            ResourceError::Other(msg) => write!(f, "エラー: {}", msg),
        }
    }
}

impl std::error::Error for ResourceError {}
```

## 3. Implementation Guidelines

### 3.1 画像リソースローダーの実装例

```rust
/// 画像リソースローダーの実装例
pub struct ImageResourceLoader {
    /// アプリケーションハンドル
    app_handle: AppHandle,
    /// サポートする画像形式
    supported_formats: HashSet<String>,
    /// キャッシュ
    cache: RwLock<HashMap<ResourceId, CachedResource>>,
}

/// キャッシュされたリソース
struct CachedResource {
    /// リソース情報
    info: ResourceInfo,
    /// キャッシュされたデータ（あれば）
    data: Option<Arc<Vec<u8>>>,
    /// 最終アクセス時刻
    last_accessed: DateTime<Utc>,
}

impl ImageResourceLoader {
    /// 新しいImageResourceLoaderを作成
    pub fn new(app_handle: AppHandle) -> Self {
        let mut supported_formats = HashSet::new();
        supported_formats.insert("jpg".to_string());
        supported_formats.insert("jpeg".to_string());
        supported_formats.insert("png".to_string());
        supported_formats.insert("gif".to_string());
        supported_formats.insert("webp".to_string());
        supported_formats.insert("bmp".to_string());
        
        ImageResourceLoader {
            app_handle,
            supported_formats,
            cache: RwLock::new(HashMap::new()),
        }
    }
    
    /// ファイル拡張子が対応形式かどうか確認
    fn is_supported_extension(&self, extension: &str) -> bool {
        self.supported_formats.contains(&extension.to_lowercase())
    }
    
    /// リソースIDからパスを取得
    fn path_from_id(&self, resource_id: &ResourceId) -> PathBuf {
        PathBuf::from(&resource_id.path)
    }
    
    /// キャッシュにリソースを追加
    fn update_cache(&self, resource_id: &ResourceId, info: ResourceInfo, data: Option<Vec<u8>>) {
        let mut cache = self.cache.write().unwrap();
        
        cache.insert(
            resource_id.clone(),
            CachedResource {
                info,
                data: data.map(Arc::new),
                last_accessed: Utc::now(),
            },
        );
    }
    
    /// キャッシュからリソースを取得
    fn get_from_cache(&self, resource_id: &ResourceId) -> Option<CachedResource> {
        let mut cache = self.cache.write().unwrap(); // 書き込みロックで最終アクセス時刻を更新
        
        if let Some(resource) = cache.get_mut(resource_id) {
            resource.last_accessed = Utc::now();
            return Some(resource.clone());
        }
        
        None
    }
}
```

### 3.2 ResourceLoaderトレイトの実装例

```rust
impl ResourceLoader for ImageResourceLoader {
    async fn resource_exists(&self, resource_id: &ResourceId) -> Result<bool, ResourceError> {
        // キャッシュチェック
        if self.get_from_cache(resource_id).is_some() {
            return Ok(true);
        }
        
        // ファイルシステムチェック
        let path = self.path_from_id(resource_id);
        
        tokio::task::spawn_blocking(move || {
            path.exists() && path.is_file()
        }).await
        .map_err(|e| ResourceError::IoError(format!("ファイル存在チェックエラー: {}", e)))
    }
    
    async fn get_resource_info(&self, resource_id: &ResourceId) -> Result<ResourceInfo, ResourceError> {
        // キャッシュチェック
        if let Some(cached) = self.get_from_cache(resource_id) {
            return Ok(cached.info);
        }
        
        // ファイルシステムから情報取得
        let path = self.path_from_id(resource_id);
        
        let metadata = tokio::fs::metadata(&path).await
            .map_err(|e| ResourceError::IoError(format!("ファイルメタデータ取得エラー: {}", e)))?;
        
        if !metadata.is_file() {
            return Err(ResourceError::InvalidResource("指定されたパスはファイルではありません".to_string()));
        }
        
        // MIMEタイプの推測
        let mime_type = if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
            match extension.to_lowercase().as_str() {
                "jpg" | "jpeg" => "image/jpeg".to_string(),
                "png" => "image/png".to_string(),
                "gif" => "image/gif".to_string(),
                "webp" => "image/webp".to_string(),
                "bmp" => "image/bmp".to_string(),
                _ => "application/octet-stream".to_string(),
            }
        } else {
            "application/octet-stream".to_string()
        };
        
        // 更新日時の取得
        let modified = metadata.modified()
            .map_err(|e| ResourceError::IoError(format!("更新日時取得エラー: {}", e)))?;
        
        let modified_date = DateTime::<Utc>::from(modified);
        
        let info = ResourceInfo {
            id: resource_id.clone(),
            size: metadata.len(),
            modified: modified_date,
            mime_type,
            metadata: HashMap::new(),
        };
        
        // キャッシュに追加（データなし）
        self.update_cache(resource_id, info.clone(), None);
        
        Ok(info)
    }
    
    async fn load_resource(
        &self,
        resource_id: &ResourceId,
        options: LoadOptions
    ) -> Result<ResourceData, ResourceError> {
        // キャッシュチェック（オプションによる）
        if options.cache_mode == CacheMode::PreferCache {
            if let Some(cached) = self.get_from_cache(resource_id) {
                if let Some(data) = &cached.data {
                    // キャッシュデータを要求された形式に変換
                    return match options.load_as {
                        LoadType::Binary => Ok(ResourceData::Binary(data.to_vec())),
                        LoadType::Text => {
                            String::from_utf8(data.to_vec())
                                .map(ResourceData::Text)
                                .map_err(|e| ResourceError::FormatError(format!("テキスト変換エラー: {}", e)))
                        },
                        LoadType::Json => {
                            serde_json::from_slice::<Value>(&data)
                                .map(ResourceData::Json)
                                .map_err(|e| ResourceError::FormatError(format!("JSON変換エラー: {}", e)))
                        },
                        LoadType::Uri => Ok(ResourceData::Uri(self.get_resource_uri(resource_id))),
                    };
                }
                // キャッシュに情報はあるがデータがない場合は続行
            }
        }
        
        // ファイルからリソースを読み込む
        let path = self.path_from_id(resource_id);
        
        // URI形式が要求された場合は、読み込まずにURIを返す
        if options.load_as == LoadType::Uri {
            return Ok(ResourceData::Uri(self.get_resource_uri(resource_id)));
        }
        
        // ファイルからデータを読み込む
        let data = tokio::fs::read(&path).await
            .map_err(|e| ResourceError::IoError(format!("ファイル読み込みエラー: {}", e)))?;
        
        // リソース情報も更新
        if options.cache_mode != CacheMode::NoCache {
            // 情報を取得して更新
            let info = self.get_resource_info(resource_id).await?;
            self.update_cache(resource_id, info, Some(data.clone()));
        }
        
        // 要求された形式に変換
        match options.load_as {
            LoadType::Binary => Ok(ResourceData::Binary(data)),
            LoadType::Text => {
                String::from_utf8(data)
                    .map(ResourceData::Text)
                    .map_err(|e| ResourceError::FormatError(format!("テキスト変換エラー: {}", e)))
            },
            LoadType::Json => {
                serde_json::from_slice::<Value>(&data)
                    .map(ResourceData::Json)
                    .map_err(|e| ResourceError::FormatError(format!("JSON変換エラー: {}", e)))
            },
            LoadType::Uri => unreachable!(), // 既に上で処理済み
        }
    }
    
    fn get_resource_uri(&self, resource_id: &ResourceId) -> String {
        // Tauriのassetプロトコルを使用してURIを生成
        // Tauriでは convertFileSrc を使用するが、Rust側では以下のように実装
        let path_str = resource_id.path.replace('\\', "/");
        
        // Windowsパスの場合、先頭の「/」を追加
        let normalized_path = if !path_str.starts_with('/') && !path_str.contains(':') {
            format!("/{}", path_str)
        } else {
            path_str
        };
        
        format!("asset://{}", normalized_path)
    }
    
    fn supports_resource_type(&self, resource_type: ResourceType) -> bool {
        match resource_type {
            ResourceType::Image => true,
            _ => false,
        }
    }
    
    async fn validate_resource(
        &self,
        resource_id: &ResourceId,
        validation_level: ValidationLevel
    ) -> Result<ValidationResult, ResourceError> {
        // 存在確認（最小検証）
        let exists = self.resource_exists(resource_id).await?;
        
        if !exists {
            return Ok(ValidationResult {
                is_valid: false,
                details: {
                    let mut details = HashMap::new();
                    details.insert("reason".to_string(), "file_not_found".into());
                    details
                },
                warnings: vec![],
            });
        }
        
        // Minimal検証なら存在確認だけで終了
        if validation_level == ValidationLevel::Minimal {
            return Ok(ValidationResult {
                is_valid: true,
                details: HashMap::new(),
                warnings: vec![],
            });
        }
        
        // 基本検証: ファイル拡張子のチェック
        let path = self.path_from_id(resource_id);
        let extension = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        
        if !self.is_supported_extension(&extension) {
            return Ok(ValidationResult {
                is_valid: false,
                details: {
                    let mut details = HashMap::new();
                    details.insert("reason".to_string(), "unsupported_format".into());
                    details.insert("extension".to_string(), extension.into());
                    details
                },
                warnings: vec![],
            });
        }
        
        // Basic検証ならここまで
        if validation_level == ValidationLevel::Basic {
            return Ok(ValidationResult {
                is_valid: true,
                details: {
                    let mut details = HashMap::new();
                    details.insert("extension".to_string(), extension.into());
                    details
                },
                warnings: vec![],
            });
        }
        
        // 完全検証: 実際にファイルを読み込んで内容を検証
        let mut warnings = Vec::new();
        let mut details = HashMap::new();
        
        // 実際のヘッダーチェック（簡易版）
        let result = tokio::task::spawn_blocking(move || {
            let mut file = match std::fs::File::open(&path) {
                Ok(f) => f,
                Err(_) => return false,
            };
            
            let mut buffer = [0u8; 8];
            if file.read(&mut buffer).is_err() {
                return false;
            }
            
            // 簡易マジックナンバーチェック
            match extension.as_str() {
                "jpg" | "jpeg" => buffer[0] == 0xFF && buffer[1] == 0xD8,
                "png" => buffer[0] == 0x89 && buffer[1] == 0x50 && buffer[2] == 0x4E && buffer[3] == 0x47,
                "gif" => buffer[0] == 0x47 && buffer[1] == 0x49 && buffer[2] == 0x46,
                "webp" => {
                    buffer[0] == 0x52 && buffer[1] == 0x49 && buffer[2] == 0x46 && buffer[3] == 0x46
                    // 実際にはさらに確認が必要
                },
                "bmp" => buffer[0] == 0x42 && buffer[1] == 0x4D,
                _ => true, // 他の形式は単純なチェックはスキップ
            }
        }).await.unwrap_or(false);
        
        if !result {
            // 拡張子と内容が一致しない
            warnings.push("ファイル拡張子と内容が一致しない可能性があります".to_string());
            details.insert("content_match".to_string(), false.into());
        } else {
            details.insert("content_match".to_string(), true.into());
        }
        
        Ok(ValidationResult {
            is_valid: result,
            details,
            warnings,
        })
    }
}
```

### 3.3 設定ファイルローダーの実装例

```rust
/// 設定ファイルローダー
pub struct ConfigResourceLoader {
    /// アプリケーションハンドル
    app_handle: AppHandle,
    /// キャッシュ
    cache: RwLock<HashMap<ResourceId, CachedConfigResource>>,
}

/// キャッシュされた設定リソース
struct CachedConfigResource {
    /// リソース情報
    info: ResourceInfo,
    /// キャッシュされたデータ
    data: Option<Arc<Value>>,
    /// 最終アクセス時刻
    last_accessed: DateTime<Utc>,
}

impl ConfigResourceLoader {
    /// 新しいConfigResourceLoaderを作成
    pub fn new(app_handle: AppHandle) -> Self {
        ConfigResourceLoader {
            app_handle,
            cache: RwLock::new(HashMap::new()),
        }
    }
    
    /// リソースIDからパスを取得
    fn path_from_id(&self, resource_id: &ResourceId) -> PathBuf {
        PathBuf::from(&resource_id.path)
    }
    
    /// キャッシュにリソースを追加
    fn update_cache(&self, resource_id: &ResourceId, info: ResourceInfo, data: Option<Value>) {
        let mut cache = self.cache.write().unwrap();
        
        cache.insert(
            resource_id.clone(),
            CachedConfigResource {
                info,
                data: data.map(Arc::new),
                last_accessed: Utc::now(),
            },
        );
    }
    
    /// キャッシュからリソースを取得
    fn get_from_cache(&self, resource_id: &ResourceId) -> Option<CachedConfigResource> {
        let mut cache = self.cache.write().unwrap();
        
        if let Some(resource) = cache.get_mut(resource_id) {
            resource.last_accessed = Utc::now();
            return Some(resource.clone());
        }
        
        None
    }
}

impl Clone for CachedConfigResource {
    fn clone(&self) -> Self {
        CachedConfigResource {
            info: self.info.clone(),
            data: self.data.clone(),
            last_accessed: self.last_accessed,
        }
    }
}

impl ResourceLoader for ConfigResourceLoader {
    async fn resource_exists(&self, resource_id: &ResourceId) -> Result<bool, ResourceError> {
        // キャッシュチェック
        if self.get_from_cache(resource_id).is_some() {
            return Ok(true);
        }
        
        // ファイルシステムチェック
        let path = self.path_from_id(resource_id);
        
        tokio::task::spawn_blocking(move || {
            path.exists() && path.is_file()
        }).await
        .map_err(|e| ResourceError::IoError(format!("ファイル存在チェックエラー: {}", e)))
    }
    
    async fn get_resource_info(&self, resource_id: &ResourceId) -> Result<ResourceInfo, ResourceError> {
        // キャッシュチェック
        if let Some(cached) = self.get_from_cache(resource_id) {
            return Ok(cached.info);
        }
        
        // ファイルシステムから情報取得
        let path = self.path_from_id(resource_id);
        
        let metadata = tokio::fs::metadata(&path).await
            .map_err(|e| ResourceError::IoError(format!("ファイルメタデータ取得エラー: {}", e)))?;
        
        if !metadata.is_file() {
            return Err(ResourceError::InvalidResource("指定されたパスはファイルではありません".to_string()));
        }
        
        // MIMEタイプの推測
        let mime_type = if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
            match extension.to_lowercase().as_str() {
                "json" => "application/json".to_string(),
                "toml" => "application/toml".to_string(),
                "yaml" | "yml" => "application/yaml".to_string(),
                _ => "text/plain".to_string(),
            }
        } else {
            "text/plain".to_string()
        };
        
        // 更新日時の取得
        let modified = metadata.modified()
            .map_err(|e| ResourceError::IoError(format!("更新日時取得エラー: {}", e)))?;
        
        let modified_date = DateTime::<Utc>::from(modified);
        
        let info = ResourceInfo {
            id: resource_id.clone(),
            size: metadata.len(),
            modified: modified_date,
            mime_type,
            metadata: HashMap::new(),
        };
        
        // キャッシュに追加
        self.update_cache(resource_id, info.clone(), None);
        
        Ok(info)
    }
    
    async fn load_resource(
        &self,
        resource_id: &ResourceId,
        options: LoadOptions
    ) -> Result<ResourceData, ResourceError> {
        // キャッシュチェック
        if options.cache_mode == CacheMode::PreferCache {
            if let Some(cached) = self.get_from_cache(resource_id) {
                if let Some(data) = &cached.data {
                    // JSONデータ返却
                    if options.load_as == LoadType::Json {
                        return Ok(ResourceData::Json(data.as_ref().clone()));
                    }
                    
                    // その他の形式へ変換
                    match options.load_as {
                        LoadType::Text => {
                            let text = serde_json::to_string(data.as_ref())
                                .map_err(|e| ResourceError::FormatError(format!("JSON変換エラー: {}", e)))?;
                            Ok(ResourceData::Text(text))
                        },
                        LoadType::Binary => {
                            let binary = serde_json::to_vec(data.as_ref())
                                .map_err(|e| ResourceError::FormatError(format!("JSON変換エラー: {}", e)))?;
                            Ok(ResourceData::Binary(binary))
                        },
                        LoadType::Uri => Ok(ResourceData::Uri(self.get_resource_uri(resource_id))),
                        _ => unreachable!(),
                    }
                }
            }
        }
        
        // ファイルシステムからの読み込み
        let path = self.path_from_id(resource_id);
        
        // URI形式が要求された場合
        if options.load_as == LoadType::Uri {
            return Ok(ResourceData::Uri(self.get_resource_uri(resource_id)));
        }
        
        // ファイル拡張子から形式を判断
        let extension = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        
        // ファイルデータを読み込み
        let content = tokio::fs::read_to_string(&path).await
            .map_err(|e| ResourceError::IoError(format!("ファイル読み込みエラー: {}", e)))?;
        
        // 形式変換とキャッシュ更新
        match extension.as_str() {
            "json" => {
                let json_data: Value = serde_json::from_str(&content)
                    .map_err(|e| ResourceError::FormatError(format!("JSON解析エラー: {}", e)))?;
                
                // キャッシュ更新
                if options.cache_mode != CacheMode::NoCache {
                    let info = self.get_resource_info(resource_id).await?;
                    self.update_cache(resource_id, info, Some(json_data.clone()));
                }
                
                // 要求された形式で返却
                match options.load_as {
                    LoadType::Json => Ok(ResourceData::Json(json_data)),
                    LoadType::Text => Ok(ResourceData::Text(content)),
                    LoadType::Binary => Ok(ResourceData::Binary(content.into_bytes())),
                    LoadType::Uri => unreachable!(),
                }
            },
            _ => {
                // その他の形式はテキストとして処理
                match options.load_as {
                    LoadType::Text => Ok(ResourceData::Text(content)),
                    LoadType::Json => {
                        // 強制的にJSONとしてパース試行
                        serde_json::from_str(&content)
                            .map(ResourceData::Json)
                            .map_err(|e| ResourceError::FormatError(format!("JSONパースエラー: {}", e)))
                    },
                    LoadType::Binary => Ok(ResourceData::Binary(content.into_bytes())),
                    LoadType::Uri => unreachable!(),
                }
            }
        }
    }
    
    fn get_resource_uri(&self, resource_id: &ResourceId) -> String {
        // Tauri assetプロトコルの利用
        let path_str = resource_id.path.replace('\\', "/");
        
        // Windowsパスの場合、先頭の「/」を追加
        let normalized_path = if !path_str.starts_with('/') && !path_str.contains(':') {
            format!("/{}", path_str)
        } else {
            path_str
        };
        
        format!("asset://{}", normalized_path)
    }
    
    fn supports_resource_type(&self, resource_type: ResourceType) -> bool {
        match resource_type {
            ResourceType::Config => true,
            _ => false,
        }
    }
    
    async fn validate_resource(
        &self,
        resource_id: &ResourceId,
        validation_level: ValidationLevel
    ) -> Result<ValidationResult, ResourceError> {
        // 存在確認
        let exists = self.resource_exists(resource_id).await?;
        
        if !exists {
            return Ok(ValidationResult {
                is_valid: false,
                details: {
                    let mut details = HashMap::new();
                    details.insert("reason".to_string(), "file_not_found".into());
                    details
                },
                warnings: vec![],
            });
        }
        
        // Minimal検証
        if validation_level == ValidationLevel::Minimal {
            return Ok(ValidationResult {
                is_valid: true,
                details: HashMap::new(),
                warnings: vec![],
            });
        }
        
        // 拡張子チェック
        let path = self.path_from_id(resource_id);
        let extension = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        
        let mut details = HashMap::new();
        details.insert("extension".to_string(), extension.clone().into());
        
        // Basic検証
        if validation_level == ValidationLevel::Basic {
            let is_valid = match extension.as_str() {
                "json" | "toml" | "yaml" | "yml" => true,
                _ => false,
            };
            
            if !is_valid {
                details.insert("reason".to_string(), "unsupported_format".into());
            }
            
            return Ok(ValidationResult {
                is_valid,
                details,
                warnings: vec![],
            });
        }
        
        // Full検証: 内容を実際に解析
        let mut warnings = Vec::new();
        let content = match tokio::fs::read_to_string(&path).await {
            Ok(content) => content,
            Err(e) => {
                return Ok(ValidationResult {
                    is_valid: false,
                    details: {
                        details.insert("reason".to_string(), "read_error".into());
                        details.insert("error".to_string(), e.to_string().into());
                        details
                    },
                    warnings: vec![],
                });
            }
        };
        
        let is_valid = match extension.as_str() {
            "json" => {
                match serde_json::from_str::<Value>(&content) {
                    Ok(_) => true,
                    Err(e) => {
                        details.insert("reason".to_string(), "invalid_json".into());
                        details.insert("error".to_string(), e.to_string().into());
                        warnings.push(format!("JSONデータが不正です: {}", e));
                        false
                    }
                }
            },
            // TOMLやYAMLの検証も同様に実装可能
            _ => {
                // 未対応の形式は一応テキストとして扱う
                details.insert("format".to_string(), "text".into());
                true
            }
        };
        
        Ok(ValidationResult {
            is_valid,
            details,
            warnings,
        })
    }
}
```

## 4. Error Handling

### 4.1 エラー処理パターン

```rust
/// リソース読み込み時の基本的なエラー処理パターン
pub async fn load_resource_safely<T: ResourceLoader>(
    loader: &T,
    resource_id: &ResourceId,
    options: LoadOptions,
    recover_strategy: impl Fn(&ResourceError) -> Option<ResourceData>,
) -> Result<ResourceData, ResourceError> {
    // 前提条件チェック
    if !loader.supports_resource_type(resource_id.resource_type.clone()) {
        return Err(ResourceError::UnsupportedType(
            format!("このローダーは {:?} タイプに対応していません", resource_id.resource_type)
        ));
    }
    
    // 存在確認
    let exists = loader.resource_exists(resource_id).await?;
    if !exists {
        return Err(ResourceError::NotFound(
            format!("リソースが見つかりません: {:?}", resource_id)
        ));
    }
    
    // リソース読み込み試行
    match loader.load_resource(resource_id, options.clone()).await {
        Ok(data) => Ok(data),
        Err(err) => {
            // 回復戦略を適用
            if let Some(recovered_data) = recover_strategy(&err) {
                Ok(recovered_data)
            } else {
                // 回復不可能な場合は元のエラーを返す
                Err(err)
            }
        }
    }
}

/// リソース検証時の基本的なエラー処理パターン
pub async fn validate_resource_safely<T: ResourceLoader>(
    loader: &T,
    resource_id: &ResourceId,
    validation_level: ValidationLevel,
) -> ValidationResult {
    // 型チェック
    if !loader.supports_resource_type(resource_id.resource_type.clone()) {
        return ValidationResult {
            is_valid: false,
            details: {
                let mut details = HashMap::new();
                details.insert("reason".to_string(), "unsupported_type".into());
                details.insert("type".to_string(), format!("{:?}", resource_id.resource_type).into());
                details
            },
            warnings: vec![],
        };
    }
    
    // 検証実行
    match loader.validate_resource(resource_id, validation_level).await {
        Ok(result) => result,
        Err(error) => {
            // エラーが発生した場合も構造化された結果を返す
            ValidationResult {
                is_valid: false,
                details: {
                    let mut details = HashMap::new();
                    details.insert("reason".to_string(), "validation_error".into());
                    details.insert("error".to_string(), error.to_string().into());
                    details
                },
                warnings: vec![format!("検証中にエラーが発生しました: {}", error)],
            }
        }
    }
}
```

### 4.2 エラーログとテレメトリー

```rust
/// エラーログとテレメトリーの基本実装
pub struct ResourceErrorLogger {
    /// エラーログのレベル
    log_level: LogLevel,
    /// テレメトリーの有効化
    telemetry_enabled: bool,
    /// 最近発生したエラー
    recent_errors: RwLock<VecDeque<ResourceErrorInfo>>,
    /// エラー数の統計
    error_counts: RwLock<HashMap<ResourceErrorType, AtomicUsize>>,
}

/// ログレベル
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

/// リソースエラーの種類
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResourceErrorType {
    NotFound,
    IoError,
    InvalidResource,
    FormatError,
    AccessDenied,
    UnsupportedType,
    Other,
}

/// エラー情報
#[derive(Debug, Clone)]
pub struct ResourceErrorInfo {
    /// エラーの種類
    pub error_type: ResourceErrorType,
    /// エラーメッセージ
    pub message: String,
    /// 発生時刻
    pub timestamp: DateTime<Utc>,
    /// 関連リソースID
    pub resource_id: Option<ResourceId>,
}

impl ResourceErrorLogger {
    /// 新しいエラーロガーを作成
    pub fn new(log_level: LogLevel, telemetry_enabled: bool) -> Self {
        ResourceErrorLogger {
            log_level,
            telemetry_enabled,
            recent_errors: RwLock::new(VecDeque::with_capacity(100)),
            error_counts: RwLock::new(HashMap::new()),
        }
    }
    
    /// エラーを記録
    pub fn log_error(&self, error: &ResourceError, resource_id: Option<&ResourceId>) {
        // エラータイプの判別
        let error_type = match error {
            ResourceError::NotFound(_) => ResourceErrorType::NotFound,
            ResourceError::IoError(_) => ResourceErrorType::IoError,
            ResourceError::InvalidResource(_) => ResourceErrorType::InvalidResource,
            ResourceError::FormatError(_) => ResourceErrorType::FormatError,
            ResourceError::AccessDenied(_) => ResourceErrorType::AccessDenied,
            ResourceError::UnsupportedType(_) => ResourceErrorType::UnsupportedType,
            ResourceError::Other(_) => ResourceErrorType::Other,
        };
        
        // エラー情報の作成
        let error_info = ResourceErrorInfo {
            error_type,
            message: error.to_string(),
            timestamp: Utc::now(),
            resource_id: resource_id.cloned(),
        };
        
        // ログレベルに応じたログ出力
        match self.log_level {
            LogLevel::Debug => println!("DEBUG: リソースエラー: {}", error),
            LogLevel::Info if matches!(error_type, ResourceErrorType::NotFound) => {
                println!("INFO: リソースが見つかりません: {}", error)
            },
            LogLevel::Info => println!("INFO: リソースエラー: {}", error),
            LogLevel::Warning => eprintln!("WARNING: リソースエラー: {}", error),
            LogLevel::Error => eprintln!("ERROR: リソースエラー: {}", error),
        }
        
        // 最近のエラーに追加
        {
            let mut recent = self.recent_errors.write().unwrap();
            if recent.len() >= 100 {
                recent.pop_front();
            }
            recent.push_back(error_info.clone());
        }
        
        // エラーカウント更新
        {
            let mut counts = self.error_counts.write().unwrap();
            counts.entry(error_type)
                .or_insert_with(|| AtomicUsize::new(0))
                .fetch_add(1, Ordering::Relaxed);
        }
        
        // テレメトリーが有効なら送信
        if self.telemetry_enabled {
            self.send_telemetry(&error_info);
        }
    }
    
    /// エラーテレメトリー送信（仮実装）
    fn send_telemetry(&self, error_info: &ResourceErrorInfo) {
        // 実際のアプリケーションでは適切なテレメトリーシステムに送信
        println!("テレメトリー送信: {:?}", error_info);
    }
    
    /// エラー統計の取得
    pub fn get_error_stats(&self) -> HashMap<ResourceErrorType, usize> {
        let counts = self.error_counts.read().unwrap();
        counts.iter()
            .map(|(k, v)| (*k, v.load(Ordering::Relaxed)))
            .collect()
    }
    
    /// 最近のエラーを取得
    pub fn get_recent_errors(&self, limit: usize) -> Vec<ResourceErrorInfo> {
        let recent = self.recent_errors.read().unwrap();
        recent.iter()
            .rev()
            .take(limit)
            .cloned()
            .collect()
    }
}
```

## 5. Performance Considerations

### 5.1 キャッシュ最適化

```rust
/// キャッシュ管理のための拡張機能
pub trait CacheControlExtension: ResourceLoader {
    /// キャッシュ内のアイテム数
    fn cache_size(&self) -> usize;
    
    /// キャッシュメモリ使用量
    fn cache_memory_usage(&self) -> usize;
    
    /// キャッシュヒット率
    fn cache_hit_ratio(&self) -> f64;
    
    /// キャッシュクリア
    fn clear_cache(&self) -> usize;
    
    /// 指定したリソースをキャッシュから削除
    fn remove_from_cache(&self, resource_id: &ResourceId) -> bool;
    
    /// 未使用キャッシュのクリーンアップ
    fn cleanup_unused_cache(&self, older_than: Duration) -> usize;
    
    /// キャッシュサイズの調整
    fn resize_cache(&self, new_max_size: usize) -> Result<(), ResourceError>;
    
    /// キャッシュのウォームアップ
    async fn warmup_cache(&self, resource_ids: &[ResourceId]) -> Result<usize, ResourceError>;
}

/// LRUキャッシュの実装例
impl CacheControlExtension for ImageResourceLoader {
    fn cache_size(&self) -> usize {
        self.cache.read().unwrap().len()
    }
    
    fn cache_memory_usage(&self) -> usize {
        let cache = self.cache.read().unwrap();
        
        cache.values()
            .map(|resource| {
                // メタデータサイズ + データサイズ（存在する場合）
                let metadata_size = std::mem::size_of::<ResourceInfo>();
                let data_size = resource.data.as_ref()
                    .map(|data| data.len())
                    .unwrap_or(0);
                
                metadata_size + data_size
            })
            .sum()
    }
    
    fn cache_hit_ratio(&self) -> f64 {
        // 実際の実装ではヒット数とミス数を追跡する必要がある
        // ここでは仮の実装
        0.0
    }
    
    fn clear_cache(&self) -> usize {
        let mut cache = self.cache.write().unwrap();
        let size = cache.len();
        cache.clear();
        size
    }
    
    fn remove_from_cache(&self, resource_id: &ResourceId) -> bool {
        let mut cache = self.cache.write().unwrap();
        cache.remove(resource_id).is_some()
    }
    
    fn cleanup_unused_cache(&self, older_than: Duration) -> usize {
        let mut cache = self.cache.write().unwrap();
        let now = Utc::now();
        
        let before_size = cache.len();
        
        // 指定された期間より古いエントリを削除
        cache.retain(|_, resource| {
            now.signed_duration_since(resource.last_accessed) < older_than
        });
        
        before_size - cache.len()
    }
    
    fn resize_cache(&self, _new_max_size: usize) -> Result<(), ResourceError> {
        // 現在の実装はRwLockのHashMapを使用しており、
        // 実際のLRUキャッシュではないため、リサイズ機能は未実装
        Err(ResourceError::Other("リサイズ機能は未実装です".to_string()))
    }
    
    async fn warmup_cache(&self, resource_ids: &[ResourceId]) -> Result<usize, ResourceError> {
        let mut success_count = 0;
        
        for id in resource_ids {
            if self.resource_exists(id).await? {
                // キャッシュに既に存在するならスキップ
                if self.get_from_cache(id).is_some() {
                    continue;
                }
                
                // 情報のみ読み込み
                let info = self.get_resource_info(id).await?;
                
                // データを読み込むかどうかを判断（ここでは画像のみロード）
                if id.resource_type == ResourceType::Image {
                    let options = LoadOptions {
                        cache_mode: CacheMode::RefreshCache,
                        load_as: LoadType::Binary,
                        priority: LoadPriority::Low,
                        extra_options: HashMap::new(),
                    };
                    
                    if self.load_resource(id, options).await.is_ok() {
                        success_count += 1;
                    }
                } else {
                    // 情報のみキャッシュ
                    self.update_cache(id, info, None);
                    success_count += 1;
                }
            }
        }
        
        Ok(success_count)
    }
}
```

### 5.2 並列読み込み最適化

```rust
/// 並列リソース読み込みのヘルパー関数
pub async fn load_resources_parallel<T: ResourceLoader>(
    loader: &T,
    resource_ids: &[ResourceId],
    options: LoadOptions,
    max_concurrent: usize,
) -> Vec<Result<(ResourceId, ResourceData), (ResourceId, ResourceError)>> {
    use futures::stream::{self, StreamExt};
    
    // 並列数を制限してリソースを読み込む
    stream::iter(resource_ids.iter().cloned())
        .map(|id| {
            let options_clone = options.clone();
            let loader_ref = loader;
            
            // 各リソースの非同期読み込み
            async move {
                match loader_ref.load_resource(&id, options_clone).await {
                    Ok(data) => Ok((id, data)),
                    Err(err) => Err((id, err)),
                }
            }
        })
        .buffer_unordered(max_concurrent)
        .collect::<Vec<_>>()
        .await
}

/// リソースプリフェッチのヘルパー関数
pub struct ResourcePrefetcher<T: ResourceLoader> {
    loader: T,
    prefetch_queue: Arc<Mutex<VecDeque<ResourceId>>>,
    running: AtomicBool,
}

impl<T: ResourceLoader> ResourcePrefetcher<T> {
    /// 新しいリソースプリフェッチャーを作成
    pub fn new(loader: T) -> Self {
        ResourcePrefetcher {
            loader,
            prefetch_queue: Arc::new(Mutex::new(VecDeque::new())),
            running: AtomicBool::new(false),
        }
    }
    
    /// リソースをプリフェッチキューに追加
    pub fn queue_prefetch(&self, resource_id: ResourceId) {
        let mut queue = self.prefetch_queue.lock().unwrap();
        queue.push_back(resource_id);
    }
    
    /// 優先度付きでリソースをプリフェッチキューに追加
    pub fn queue_prefetch_priority(&self, resource_id: ResourceId) {
        let mut queue = self.prefetch_queue.lock().unwrap();
        queue.push_front(resource_id);
    }
    
    /// プリフェッチプロセスを開始
    pub async fn start_prefetching(&self, max_concurrent: usize) {
        // 既に実行中なら何もしない
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }
        
        let prefetch_queue = self.prefetch_queue.clone();
        let loader = &self.loader;
        let running = &self.running;
        
        tokio::spawn(async move {
            use futures::stream::{self, StreamExt};
            
            // 同時実行数を制限して処理
            stream::iter(std::iter::repeat(()))
                .map(|_| {
                    async {
                        // キューからリソースIDを取得
                        let resource_id = {
                            let mut queue = prefetch_queue.lock().unwrap();
                            queue.pop_front()
                        };
                        
                        // キューが空ならnullを返して処理終了の合図
                        let Some(id) = resource_id else {
                            return None;
                        };
                        
                        // 低優先度でリソースを読み込む
                        let options = LoadOptions {
                            cache_mode: CacheMode::RefreshCache,
                            load_as: LoadType::Binary,
                            priority: LoadPriority::Background,
                            extra_options: HashMap::new(),
                        };
                        
                        let _result = loader.load_resource(&id, options).await;
                        Some(())
                    }
                })
                .buffer_unordered(max_concurrent)
                .take_while(|x| futures::future::ready(x.is_some()))
                .collect::<Vec<_>>()
                .await;
            
            // 終了
            running.store(false, Ordering::SeqCst);
        });
    }
    
    /// プリフェッチキューのクリア
    pub fn clear_queue(&self) {
        let mut queue = self.prefetch_queue.lock().unwrap();
        queue.clear();
    }
    
    /// 現在のキューサイズを取得
    pub fn queue_size(&self) -> usize {
        let queue = self.prefetch_queue.lock().unwrap();
        queue.len()
    }
    
    /// 実行中かどうかを確認
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}
```

### 5.3 メモリ使用量最適化

```rust
/// メモリ使用最適化のためのユーティリティ
pub struct ResourceMemoryMonitor {
    /// メモリ使用制限（バイト）
    memory_limit: usize,
    /// 現在のメモリ使用量（バイト）
    current_usage: AtomicUsize,
    /// 高水準マーク（制限の割合）
    high_water_mark: f64,
    /// 低水準マーク（制限の割合）
    low_water_mark: f64,
}

impl ResourceMemoryMonitor {
    /// 新しいメモリモニタを作成
    pub fn new(memory_limit: usize, high_water_mark: f64, low_water_mark: f64) -> Self {
        ResourceMemoryMonitor {
            memory_limit,
            current_usage: AtomicUsize::new(0),
            high_water_mark: high_water_mark.clamp(0.0, 1.0),
            low_water_mark: low_water_mark.clamp(0.0, 1.0),
        }
    }
    
    /// メモリ使用量を記録
    pub fn record_memory_usage(&self, usage: usize) {
        self.current_usage.store(usage, Ordering::Relaxed);
    }
    
    /// 現在のメモリ使用量を取得
    pub fn get_current_usage(&self) -> usize {
        self.current_usage.load(Ordering::Relaxed)
    }
    
    /// メモリ使用率を取得
    pub fn get_usage_ratio(&self) -> f64 {
        let usage = self.get_current_usage() as f64;
        let limit = self.memory_limit as f64;
        usage / limit
    }
    
    /// 高水準を超えているか
    pub fn is_above_high_water_mark(&self) -> bool {
        self.get_usage_ratio() > self.high_water_mark
    }
    
    /// 低水準を下回っているか
    pub fn is_below_low_water_mark(&self) -> bool {
        self.get_usage_ratio() < self.low_water_mark
    }
    
    /// メモリ最適化が必要か
    pub fn needs_optimization(&self) -> bool {
        self.is_above_high_water_mark()
    }
    
    /// 目標削減量を計算
    pub fn calculate_target_reduction(&self) -> usize {
        if !self.needs_optimization() {
            return 0;
        }
        
        let current = self.get_current_usage();
        let target = (self.memory_limit as f64 * self.low_water_mark) as usize;
        
        if current > target {
            current - target
        } else {
            0
        }
    }
}

/// リソースローダーのメモリ最適化
impl<T: ResourceLoader + CacheControlExtension> ResourceMemoryMonitor {
    /// ローダーのキャッシュを最適化
    pub fn optimize_loader_cache(&self, loader: &T) -> usize {
        if !self.needs_optimization() {
            return 0;
        }
        
        // 目標削減量
        let target_reduction = self.calculate_target_reduction();
        
        // キャッシュから不要なアイテムを削除
        let removed = loader.cleanup_unused_cache(Duration::seconds(300)); // 5分以上アクセスのないアイテム
        
        // さらに削減が必要なら強制的にキャッシュクリア
        if removed == 0 && self.needs_optimization() {
            loader.clear_cache()
        } else {
            removed
        }
    }
}
```

## 6. Integration with Existing Code

### 6.1 poir-viewerとの統合

```rust
/// poir-viewerアプリへの統合の例
pub fn setup_resource_loaders(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // 画像リソースローダーを作成
    let image_loader = ImageResourceLoader::new(app_handle.clone());
    
    // 設定リソースローダーを作成
    let config_loader = ConfigResourceLoader::new(app_handle.clone());
    
    // コンポジットリソースローダーを作成
    let composite_loader = CompositeResourceLoader::new(vec![
        Box::new(image_loader.clone()),
        Box::new(config_loader.clone()),
    ]);
    
    // リソースサービスを作成
    let resource_service = ResourceService::new(composite_loader);
    
    // メモリモニタを作成（100MBを上限）
    let memory_monitor = ResourceMemoryMonitor::new(
        100 * 1024 * 1024, // 100MB
        0.8, // 80%で最適化開始
        0.6  // 60%まで削減
    );
    
    // エラーロガーを作成
    let error_logger = ResourceErrorLogger::new(LogLevel::Warning, false);
    
    // アプリケーションのステートとして登録
    app.manage(Arc::new(resource_service));
    app.manage(Arc::new(image_loader));
    app.manage(Arc::new(config_loader));
    app.manage(Arc::new(memory_monitor));
    app.manage(Arc::new(error_logger));
    
    // リソースローダーコマンドのセットアップ
    app.manage(ResourceCommandRegistry::new());
    
    Ok(())
}

/// コンポジットリソースローダー
pub struct CompositeResourceLoader {
    loaders: Vec<Box<dyn ResourceLoader>>,
}

impl CompositeResourceLoader {
    /// 新しいコンポジットローダーを作成
    pub fn new(loaders: Vec<Box<dyn ResourceLoader>>) -> Self {
        CompositeResourceLoader { loaders }
    }
    
    /// リソースタイプに対応するローダーを取得
    fn get_loader_for_type(&self, resource_type: &ResourceType) -> Option<&dyn ResourceLoader> {
        self.loaders.iter()
            .find(|loader| loader.supports_resource_type(resource_type.clone()))
            .map(|boxed| boxed.as_ref())
    }
}

impl ResourceLoader for CompositeResourceLoader {
    async fn resource_exists(&self, resource_id: &ResourceId) -> Result<bool, ResourceError> {
        if let Some(loader) = self.get_loader_for_type(&resource_id.resource_type) {
            loader.resource_exists(resource_id).await
        } else {
            Err(ResourceError::UnsupportedType(
                format!("対応するローダーが見つかりません: {:?}", resource_id.resource_type)
            ))
        }
    }
    
    async fn get_resource_info(&self, resource_id: &ResourceId) -> Result<ResourceInfo, ResourceError> {
        if let Some(loader) = self.get_loader_for_type(&resource_id.resource_type) {
            loader.get_resource_info(resource_id).await
        } else {
            Err(ResourceError::UnsupportedType(
                format!("対応するローダーが見つかりません: {:?}", resource_id.resource_type)
            ))
        }
    }
    
    async fn load_resource(
        &self,
        resource_id: &ResourceId,
        options: LoadOptions
    ) -> Result<ResourceData, ResourceError> {
        if let Some(loader) = self.get_loader_for_type(&resource_id.resource_type) {
            loader.load_resource(resource_id, options).await
        } else {
            Err(ResourceError::UnsupportedType(
                format!("対応するローダーが見つかりません: {:?}", resource_id.resource_type)
            ))
        }
    }
    
    fn get_resource_uri(&self, resource_id: &ResourceId) -> String {
        if let Some(loader) = self.get_loader_for_type(&resource_id.resource_type) {
            loader.get_resource_uri(resource_id)
        } else {
            // デフォルトURIを返す
            format!("resource://{}", resource_id.path)
        }
    }
    
    fn supports_resource_type(&self, resource_type: ResourceType) -> bool {
        self.loaders.iter()
            .any(|loader| loader.supports_resource_type(resource_type.clone()))
    }
    
    async fn validate_resource(
        &self,
        resource_id: &ResourceId,
        validation_level: ValidationLevel
    ) -> Result<ValidationResult, ResourceError> {
        if let Some(loader) = self.get_loader_for_type(&resource_id.resource_type) {
            loader.validate_resource(resource_id, validation_level).await
        } else {
            Err(ResourceError::UnsupportedType(
                format!("対応するローダーが見つかりません: {:?}", resource_id.resource_type)
            ))
        }
    }
}
```

### 6.2 Tauri コマンドとの統合

```rust
/// リソースサービス
pub struct ResourceService {
    loader: CompositeResourceLoader,
    error_logger: Arc<ResourceErrorLogger>,
    prefetchers: RwLock<HashMap<String, ResourcePrefetcher<Box<dyn ResourceLoader>>>>,
}

impl ResourceService {
    /// 新しいリソースサービスを作成
    pub fn new(loader: CompositeResourceLoader) -> Self {
        ResourceService {
            loader,
            error_logger: Arc::new(ResourceErrorLogger::new(LogLevel::Warning, false)),
            prefetchers: RwLock::new(HashMap::new()),
        }
    }
    
    /// リソースIDを構築
    pub fn build_resource_id(&self, path: &str, resource_type_str: &str) -> Result<ResourceId, ResourceError> {
        let resource_type = match resource_type_str.to_lowercase().as_str() {
            "image" => ResourceType::Image,
            "config" => ResourceType::Config,
            _ => ResourceType::Other(resource_type_str.to_string()),
        };
        
        Ok(ResourceId {
            path: path.to_string(),
            resource_type,
            metadata: HashMap::new(),
        })
    }
    
    /// リソースの一覧を取得
    pub async fn list_resources(
        &self,
        directory: &str,
        resource_type: Option<ResourceType>,
    ) -> Result<Vec<ResourceInfo>, ResourceError> {
        use tokio::fs;
        
        let mut entries = fs::read_dir(directory).await
            .map_err(|e| ResourceError::IoError(format!("ディレクトリ読み取りエラー: {}", e)))?;
        
        let mut resources = Vec::new();
        
        while let Some(entry) = entries.next_entry().await
            .map_err(|e| ResourceError::IoError(format!("エントリ読み取りエラー: {}", e)))? {
            
            let path = entry.path();
            
            if path.is_dir() {
                continue;
            }
            
            // 拡張子からリソースタイプを推測
            let extension = path.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            
            let inferred_type = match extension.as_str() {
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" => ResourceType::Image,
                "json" | "toml" | "yaml" | "yml" => ResourceType::Config,
                _ => ResourceType::Other(extension),
            };
            
            // リソースタイプフィルタ
            if let Some(filter_type) = &resource_type {
                if &inferred_type != filter_type {
                    continue;
                }
            }
            
            // ローダーのサポート確認
            if !self.loader.supports_resource_type(inferred_type.clone()) {
                continue;
            }
            
            // リソースIDを構築
            let resource_id = ResourceId {
                path: path.to_string_lossy().to_string(),
                resource_type: inferred_type,
                metadata: HashMap::new(),
            };
            
            // リソース情報を取得
            match self.loader.get_resource_info(&resource_id).await {
                Ok(info) => resources.push(info),
                Err(err) => {
                    self.error_logger.log_error(&err, Some(&resource_id));
                }
            }
        }
        
        Ok(resources)
    }
}

/// リソースコマンドレジストリ
pub struct ResourceCommandRegistry {
    commands: RwLock<HashMap<String, Box<dyn ResourceCommand>>>,
}

impl ResourceCommandRegistry {
    /// 新しいコマンドレジストリを作成
    pub fn new() -> Self {
        ResourceCommandRegistry {
            commands: RwLock::new(HashMap::new()),
        }
    }
    
    /// コマンドを登録
    pub fn register_command(&self, command: Box<dyn ResourceCommand>) {
        let mut commands = self.commands.write().unwrap();
        commands.insert(command.name().to_string(), command);
    }
    
    /// コマンドを実行
    pub async fn execute_command(
        &self,
        name: &str,
        args: Value,
    ) -> Result<Value, ResourceError> {
        let commands = self.commands.read().unwrap();
        
        if let Some(command) = commands.get(name) {
            command.execute(args).await
        } else {
            Err(ResourceError::Other(format!("コマンドが見つかりません: {}", name)))
        }
    }
}

/// リソースコマンドトレイト
pub trait ResourceCommand: Send + Sync {
    /// コマンド名
    fn name(&self) -> &str;
    
    /// コマンドの実行
    async fn execute(&self, args: Value) -> Result<Value, ResourceError>;
}

/// リソース読み込みコマンド
pub struct LoadResourceCommand {
    resource_service: Arc<ResourceService>,
}

impl ResourceCommand for LoadResourceCommand {
    fn name(&self) -> &str {
        "load_resource"
    }
    
    async fn execute(&self, args: Value) -> Result<Value, ResourceError> {
        // 引数の解析
        let path = args["path"].as_str()
            .ok_or_else(|| ResourceError::Other("pathパラメータが必要です".to_string()))?;
        
        let resource_type = args["type"].as_str()
            .unwrap_or("auto");
        
        let load_as = args["loadAs"].as_str()
            .unwrap_or("binary");
        
        // リソースIDの構築
        let resource_id = self.resource_service.build_resource_id(path, resource_type)?;
        
        // 読み込みオプションの構築
        let load_type = match load_as {
            "text" => LoadType::Text,
            "json" => LoadType::Json,
            "uri" => LoadType::Uri,
            _ => LoadType::Binary,
        };
        
        let options = LoadOptions {
            cache_mode: CacheMode::PreferCache,
            load_as: load_type,
            priority: LoadPriority::Normal,
            extra_options: HashMap::new(),
        };
        
        // リソースを読み込み
        let resource_data = self.resource_service.loader.load_resource(&resource_id, options).await?;
        
        // 結果をJSON形式で返す
        let result = match resource_data {
            ResourceData::Binary(data) => {
                json!({
                    "type": "binary",
                    "size": data.len(),
                    "base64": base64::encode(&data),
                })
            },
            ResourceData::Text(text) => {
                json!({
                    "type": "text",
                    "content": text,
                })
            },
            ResourceData::Json(json_data) => {
                json!({
                    "type": "json",
                    "content": json_data,
                })
            },
            ResourceData::Uri(uri) => {
                json!({
                    "type": "uri",
                    "uri": uri,
                })
            },
        };
        
        Ok(result)
    }
}

/// Tauriコマンドのセットアップ
pub fn register_resource_commands(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let resource_service = app.state::<Arc<ResourceService>>()
        .map_err(|_| "ResourceServiceが見つかりません")?;
    
    let registry = app.state::<ResourceCommandRegistry>()
        .map_err(|_| "ResourceCommandRegistryが見つかりません")?;
    
    // 各コマンドを登録
    registry.register_command(Box::new(LoadResourceCommand {
        resource_service: resource_service.clone(),
    }));
    
    // 他のコマンドも同様に登録
    
    Ok(())
}

/// Tauriコマンドハンドラ
#[tauri::command]
async fn execute_resource_command(
    app_handle: tauri::AppHandle,
    command: String,
    args: Value,
) -> Result<Value, String> {
    let registry = app_handle.state::<ResourceCommandRegistry>()
        .map_err(|_| "ResourceCommandRegistryが見つかりません".to_string())?;
    
    registry.execute_command(&command, args).await
        .map_err(|e| e.to_string())
}
```

### 6.3 既存コードとの段階的統合

```rust
/// ResourceConfigAdapterの例
pub struct ResourceConfigAdapter {
    resource_service: Arc<ResourceService>,
    state_controller: Arc<SimpleStateController>,
}

impl ResourceConfigAdapter {
    pub fn new(
        resource_service: Arc<ResourceService>,
        state_controller: Arc<SimpleStateController>,
    ) -> Self {
        ResourceConfigAdapter {
            resource_service,
            state_controller,
        }
    }
    
    /// 既存のload関数を新しいResourceLoaderを使って実装
    pub async fn load(&self, app_handle: &AppHandle) -> Result<ResourceConfig, String> {
        // 設定ファイルのパスを取得
        let config_path = ResourceConfig::get_config_path(app_handle)
            .to_string_lossy()
            .to_string();
        
        // ResourceLoaderを使って設定ファイルを読み込み
        let resource_id = self.resource_service.build_resource_id(&config_path, "config")
            .map_err(|e| format!("リソースID構築エラー: {}", e))?;
        
        let options = LoadOptions {
            cache_mode: CacheMode::RefreshCache, // 常に最新の設定を読み込む
            load_as: LoadType::Json,
            priority: LoadPriority::High,
            extra_options: HashMap::new(),
        };
        
        // 設定ファイルを読み込み
        let resource_data = self.resource_service.loader.load_resource(&resource_id, options).await
            .map_err(|e| format!("設定ファイル読み込みエラー: {}", e))?;
        
        // JSONデータをResourceConfigに変換
        match resource_data {
            ResourceData::Json(json_data) => {
                let config: ResourceConfig = serde_json::from_value(json_data)
                    .map_err(|e| format!("設定ファイル解析エラー: {}", e))?;
                
                // 状態も更新
                self.update_state(&config);
                
                Ok(config)
            },
            _ => Err("設定ファイルがJSON形式ではありません".to_string()),
        }
    }
    
    /// 既存のsave関数を新しいResourceLoaderを使って実装
    pub async fn save(&self, app_handle: &AppHandle, config: ResourceConfig) -> Result<(), String> {
        // 設定ファイルのパスを取得
        let config_path = ResourceConfig::get_config_path(app_handle)
            .to_string_lossy()
            .to_string();
        
        // JSONに変換
        let json_data = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("設定のシリアライズに失敗: {}", e))?;
        
        // ファイルに保存（ResourceLoaderは書き込み機能を提供しないため、標準ライブラリを使用）
        tokio::fs::write(&config_path, json_data).await
            .map_err(|e| format!("設定ファイルの保存に失敗: {}", e))?;
        
        // 状態を更新
        self.update_state(&config);
        
        Ok(())
    }
    
    /// 状態の更新
    fn update_state(&self, config: &ResourceConfig) {
        // SimpleStateControllerを使って状態を更新
        // （例: ResourceConfigStateを生成して更新）
    }
}
```

## 7. Future Enhancements

### 7.1 リソースキャッシング強化

```rust
/// 将来的な拡張: 高度なキャッシュ戦略
pub trait AdvancedCacheStrategy: Send + Sync {
    /// キャッシュ対象かどうか判断
    fn should_cache(&self, resource_id: &ResourceId, info: &ResourceInfo) -> bool;
    
    /// キャッシュからの削除対象かどうか判断
    fn should_evict(&self, resource_id: &ResourceId, last_access: DateTime<Utc>) -> bool;
    
    /// キャッシュ優先度を計算
    fn calculate_priority(&self, resource_id: &ResourceId, info: &ResourceInfo) -> u32;
    
    /// キャッシュ展開方針を判断
    fn eviction_strategy(&self) -> EvictionStrategy;
}

/// キャッシュ削除戦略
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvictionStrategy {
    /// 最近最も使われていないものから削除
    LRU,
    /// 最も頻度の低いものから削除
    LFU,
    /// サイズ優先（大きいものから削除）
    SizePriority,
    /// カスタム優先度に基づく削除
    PriorityBased,
}

/// 画像リソース用キャッシュ戦略
pub struct ImageCacheStrategy {
    /// 最大キャッシュサイズ
    max_cache_size: usize,
    /// 最小キャッシュ時間
    min_cache_time: Duration,
    /// キャッシュサイズ上限
    max_image_size: usize,
}

impl AdvancedCacheStrategy for ImageCacheStrategy {
    fn should_cache(&self, _resource_id: &ResourceId, info: &ResourceInfo) -> bool {
        // サイズ制限以下の画像のみキャッシュ
        info.size <= self.max_image_size as u64
    }
    
    fn should_evict(&self, _resource_id: &ResourceId, last_access: DateTime<Utc>) -> bool {
        // 最小キャッシュ時間を超えたものが削除対象
        Utc::now().signed_duration_since(last_access) > self.min_cache_time
    }
    
    fn calculate_priority(&self, _resource_id: &ResourceId, info: &ResourceInfo) -> u32 {
        // サイズに反比例する優先度（小さいほど優先度高）
        let size = info.size as usize;
        if size == 0 {
            return u32::MAX;
        }
        
        let priority = self.max_image_size / size;
        priority.min(u32::MAX as usize) as u32
    }
    
    fn eviction_strategy(&self) -> EvictionStrategy {
        // 優先度ベースの削除戦略
        EvictionStrategy::PriorityBased
    }
}
```

### 7.2 リソース変換パイプライン

```rust
/// 将来的な拡張: リソース変換パイプライン
pub trait ResourceTransformer: Send + Sync {
    /// 対応するリソースタイプ
    fn supported_types(&self) -> Vec<ResourceType>;
    
    /// 入力形式と出力形式
    fn input_output_formats(&self) -> Vec<(String, String)>;
    
    /// リソース変換
    async fn transform(
        &self,
        input: ResourceData,
        options: TransformOptions,
    ) -> Result<ResourceData, ResourceError>;
}

/// 変換オプション
#[derive(Debug, Clone)]
pub struct TransformOptions {
    /// 出力形式
    pub output_format: String,
    /// 変換パラメータ
    pub parameters: HashMap<String, Value>,
}

/// 画像リサイズ変換器
pub struct ImageResizeTransformer;

impl ResourceTransformer for ImageResizeTransformer {
    fn supported_types(&self) -> Vec<ResourceType> {
        vec![ResourceType::Image]
    }
    
    fn input_output_formats(&self) -> Vec<(String, String)> {
        vec![
            ("image/jpeg".to_string(), "image/jpeg".to_string()),
            ("image/png".to_string(), "image/png".to_string()),
            ("image/gif".to_string(), "image/png".to_string()),
            ("image/webp".to_string(), "image/webp".to_string()),
        ]
    }
    
    async fn transform(
        &self,
        input: ResourceData,
        options: TransformOptions,
    ) -> Result<ResourceData, ResourceError> {
        // 入力がバイナリであることを確認
        let binary_data = match input {
            ResourceData::Binary(data) => data,
            _ => return Err(ResourceError::InvalidResource("バイナリデータが必要です".to_string())),
        };
        
        // 変換パラメータを取得
        let width = options.parameters.get("width")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
            
        let height = options.parameters.get("height")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
            
        if width == 0 && height == 0 {
            return Err(ResourceError::InvalidResource("widthまたはheightが必要です".to_string()));
        }
        
        // 画像リサイズ処理（実際の実装では画像処理ライブラリを使用）
        // ここでは簡単のため、元のデータをそのまま返す
        Ok(ResourceData::Binary(binary_data))
    }
}

/// 変換パイプライン
pub struct TransformPipeline {
    transformers: HashMap<String, Box<dyn ResourceTransformer>>,
}

impl TransformPipeline {
    /// 新しい変換パイプラインを作成
    pub fn new() -> Self {
        TransformPipeline {
            transformers: HashMap::new(),
        }
    }
    
    /// 変換器を登録
    pub fn register_transformer(&mut self, name: &str, transformer: Box<dyn ResourceTransformer>) {
        self.transformers.insert(name.to_string(), transformer);
    }
    
    /// 変換処理を実行
    pub async fn apply_transformations(
        &self,
        input: ResourceData,
        transformations: Vec<(String, TransformOptions)>,
    ) -> Result<ResourceData, ResourceError> {
        let mut current = input;
        
        for (transformer_name, options) in transformations {
            if let Some(transformer) = self.transformers.get(&transformer_name) {
                current = transformer.transform(current, options).await?;
            } else {
                return Err(ResourceError::Other(format!("変換器が見つかりません: {}", transformer_name)));
            }
        }
        
        Ok(current)
    }
}
```

### 7.3 リソースフェデレーション

```rust
/// 将来的な拡張: リソースフェデレーション
pub trait FederatedResourceProvider: ResourceLoader {
    /// プロバイダIDを取得
    fn provider_id(&self) -> &str;
    
    /// プロバイダの優先度
    fn priority(&self) -> u32;
    
    /// 対応するスキーム
    fn supported_schemes(&self) -> Vec<String>;
    
    /// スキームからリソースIDに変換
    fn scheme_to_resource_id(&self, uri: &str) -> Result<ResourceId, ResourceError>;
}

/// リモートリソースプロバイダ
pub struct RemoteResourceProvider {
    /// プロバイダID
    id: String,
    /// 優先度
    priority: u32,
    /// ベースURL
    base_url: String,
    /// クライアントオプション
    client_options: HashMap<String, Value>,
}

impl FederatedResourceProvider for RemoteResourceProvider {
    fn provider_id(&self) -> &str {
        &self.id
    }
    
    fn priority(&self) -> u32 {
        self.priority
    }
    
    fn supported_schemes(&self) -> Vec<String> {
        vec!["http".to_string(), "https".to_string()]
    }
    
    fn scheme_to_resource_id(&self, uri: &str) -> Result<ResourceId, ResourceError> {
        // URLをパース
        let parsed_url = url::Url::parse(uri)
            .map_err(|e| ResourceError::InvalidResource(format!("URLパースエラー: {}", e)))?;
        
        // スキームをチェック
        let scheme = parsed_url.scheme();
        if !["http", "https"].contains(&scheme) {
            return Err(ResourceError::UnsupportedType(format!("未対応のスキーム: {}", scheme)));
        }
        
        // パスからリソースタイプを推測
        let path = parsed_url.path();
        let extension = path.split('.').last().unwrap_or("");
        
        let resource_type = match extension {
            "jpg" | "jpeg" | "png" | "gif" | "webp" => ResourceType::Image,
            "json" => ResourceType::Config,
            _ => ResourceType::Other(extension.to_string()),
        };
        
        // リソースIDを構築
        Ok(ResourceId {
            path: uri.to_string(),
            resource_type,
            metadata: HashMap::new(),
        })
    }
}

impl ResourceLoader for RemoteResourceProvider {
    // ResourceLoaderの実装（HTTPリクエストを使用）
    // ここでは省略
    
    async fn resource_exists(&self, resource_id: &ResourceId) -> Result<bool, ResourceError> {
        // HEADリクエストで存在確認
        // 実装は省略
        Ok(true)
    }
    
    async fn get_resource_info(&self, resource_id: &ResourceId) -> Result<ResourceInfo, ResourceError> {
        // HEADリクエストでメタデータ取得
        // 実装は省略
        
        Ok(ResourceInfo {
            id: resource_id.clone(),
            size: 0,
            modified: Utc::now(),
            mime_type: "application/octet-stream".to_string(),
            metadata: HashMap::new(),
        })
    }
    
    async fn load_resource(
        &self,
        resource_id: &ResourceId,
        _options: LoadOptions
    ) -> Result<ResourceData, ResourceError> {
        // GETリクエストでリソース取得
        // 実装は省略
        
        Ok(ResourceData::Binary(Vec::new()))
    }
    
    fn get_resource_uri(&self, resource_id: &ResourceId) -> String {
        // そのままURLを返す
        resource_id.path.clone()
    }
    
    fn supports_resource_type(&self, _resource_type: ResourceType) -> bool {
        true
    }
    
    async fn validate_resource(
        &self,
        _resource_id: &ResourceId,
        _validation_level: ValidationLevel
    ) -> Result<ValidationResult, ResourceError> {
        // 検証実装は省略
        
        Ok(ValidationResult {
            is_valid: true,
            details: HashMap::new(),
            warnings: vec![],
        })
    }
}

/// フェデレーションマネージャー
pub struct ResourceFederationManager {
    providers: HashMap<String, Box<dyn FederatedResourceProvider>>,
}

impl ResourceFederationManager {
    /// 新しいフェデレーションマネージャーを作成
    pub fn new() -> Self {
        ResourceFederationManager {
            providers: HashMap::new(),
        }
    }
    
    /// プロバイダを登録
    pub fn register_provider(&mut self, provider: Box<dyn FederatedResourceProvider>) {
        self.providers.insert(provider.provider_id().to_string(), provider);
    }
    
    /// URIからリソースIDとプロバイダを解決
    pub fn resolve_uri(
        &self,
        uri: &str,
    ) -> Result<(ResourceId, &dyn FederatedResourceProvider), ResourceError> {
        // スキームを抽出
        let scheme = uri.split(':').next().unwrap_or("");
        
        // スキームに対応するプロバイダを探す
        let matching_providers: Vec<_> = self.providers.values()
            .filter(|p| p.supported_schemes().contains(&scheme.to_string()))
            .collect();
        
        if matching_providers.is_empty() {
            return Err(ResourceError::UnsupportedType(format!("未対応のスキーム: {}", scheme)));
        }
        
        // 優先度の高いプロバイダを選択
        let provider = matching_providers.into_iter()
            .max_by_key(|p| p.priority())
            .unwrap();
        
        // リソースIDに変換
        let resource_id = provider.scheme_to_resource_id(uri)?;
        
        Ok((resource_id, provider.as_ref()))
    }
}
```

### 7.4 研究領域

1. **高度なメモリ管理**
   - ホットパスとコールドパスの分析に基づくキャッシュ戦略
   - プリフェッチ予測モデル
   - ユーザー行動分析に基づく先読み

2. **分散リソース管理**
   - P2Pリソース共有
   - コンテンツ配信ネットワーク統合
   - エッジキャッシング

3. **AI駆動リソース最適化**
   - 画像の適応的圧縮
   - コンテンツの重要性予測
   - ユーザー体験に基づく優先度調整
