# StateInterface Detailed Design Specification

## 1. Overview

StateInterfaceはpoir-viewerにおける状態管理の基盤となるインターフェースを定義します。このインターフェースはシンプルかつ型安全な状態管理を実現し、Tauri v2のイベントシステムとの連携を容易にします。

### 1.1 Core Responsibilities
- アプリケーション状態を表現する型安全なインターフェース提供
- 状態の一意な識別と検証
- 状態変更の追跡
- シリアライズ/デシリアライズを通じたフロントエンド連携
- パフォーマンスとメモリ効率の最適化

### 1.2 Design Principles
- **シンプルさ**: 実装が容易な最小限のインターフェース設計
- **型安全性**: Rustの型システムを活用した安全性確保
- **Tauriとの親和性**: Tauriのイベントシステムとの自然な統合
- **拡張性**: 将来的な機能追加を妨げない柔軟な設計
- **実用性**: poir-viewerの具体的なユースケースに適した設計

## 2. Core Interface Definitions

### 2.1 基本型定義

```rust
/// 状態の一意な識別子
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StateId(pub String);

impl StateId {
    pub fn new<S: Into<String>>(id: S) -> Self {
        StateId(id.into())
    }
    
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// 状態の種類を表す型
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StateType(pub String);

impl StateType {
    pub fn new<S: Into<String>>(type_name: S) -> Self {
        StateType(type_name.into())
    }
    
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// 状態のバージョン情報
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct StateVersion(pub u64);

impl StateVersion {
    pub fn new(version: u64) -> Self {
        StateVersion(version)
    }
    
    pub fn increment(&self) -> Self {
        StateVersion(self.0 + 1)
    }
    
    pub fn as_u64(&self) -> u64 {
        self.0
    }
}
```

### 2.2 State インターフェース（シンプル化）

```rust
/// すべての状態オブジェクトが実装すべき基本インターフェース
pub trait State: Send + Sync + 'static {
    // 必須メソッド
    
    /// 状態の一意な識別子を取得
    fn state_id(&self) -> StateId;
    
    /// 状態の種類を取得
    fn state_type(&self) -> StateType;
    
    /// 状態のバージョンを取得
    fn version(&self) -> StateVersion;
    
    /// 状態が有効かどうかを検証
    fn validate(&self) -> Result<(), StateError>;
    
    /// 状態をシリアライズ
    fn serialize(&self) -> Result<String, StateError>;
    
    // 拡張メソッド（デフォルト実装あり）
    
    /// 状態変更を適用（デフォルトは未実装）
    fn apply_changes(&mut self, _changes: StateChange) -> Result<(), StateError> {
        Err(StateError::general("apply_changes は実装されていません"))
    }
    
    /// 状態のクローンを作成（オプショナル）
    fn clone_state(&self) -> Option<Box<dyn State>> {
        None
    }
}
```

### 2.3 状態変更と履歴

```rust
/// 状態の変更を表す構造体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateChange {
    /// 変更対象の状態ID
    pub state_id: StateId,
    
    /// 変更前の状態（オプショナル）
    pub before: Option<String>,
    
    /// 変更後の状態（オプショナル）
    pub after: Option<String>,
    
    /// 変更のタイムスタンプ
    pub timestamp: DateTime<Utc>,
    
    /// 変更に関するメタデータ
    pub metadata: HashMap<String, Value>,
}
```

### 2.4 エラー型定義（簡略化）

```rust
/// 状態操作に関するエラーを表す列挙型
#[derive(Debug, Clone)]
pub enum StateError {
    /// 検証エラー
    ValidationError {
        state_id: StateId,
        message: String,
    },
    
    /// シリアライズエラー
    SerializationError {
        state_id: StateId,
        message: String,
    },
    
    /// デシリアライズエラー
    DeserializationError {
        state_type: StateType,
        message: String,
    },
    
    /// 状態が見つからないエラー
    NotFoundError {
        state_id: StateId,
    },
    
    /// 一般的なエラー
    GeneralError {
        message: String,
    },
}

impl StateError {
    /// ValidationErrorを作成するヘルパーメソッド
    pub fn validation<S: Into<String>>(state_id: &StateId, message: S) -> Self {
        StateError::ValidationError {
            state_id: state_id.clone(),
            message: message.into(),
        }
    }
    
    /// 一般的なエラーを作成するヘルパーメソッド
    pub fn general<S: Into<String>>(message: S) -> Self {
        StateError::GeneralError {
            message: message.into(),
        }
    }
}
```

## 3. Implementation Guidelines

### 3.1 基本的な状態実装例 - ResourceConfig

```rust
/// リソース設定の状態実装例
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConfigState {
    /// 状態ID
    id: String,
    
    /// 状態のバージョン
    version: u64,
    
    /// 状態の作成・更新時刻
    timestamp: DateTime<Utc>,
    
    /// リソース設定の実際のデータ
    pub config: ResourceConfig,
}

impl ResourceConfigState {
    pub fn new(config: ResourceConfig) -> Self {
        ResourceConfigState {
            id: "resource_config".to_string(),
            version: 1,
            timestamp: Utc::now(),
            config,
        }
    }
    
    pub fn update_config(&mut self, config: ResourceConfig) {
        self.config = config;
        self.version += 1;
        self.timestamp = Utc::now();
    }
}

impl State for ResourceConfigState {
    fn state_id(&self) -> StateId {
        StateId::new(&self.id)
    }
    
    fn state_type(&self) -> StateType {
        StateType::new("ResourceConfig")
    }
    
    fn version(&self) -> StateVersion {
        StateVersion::new(self.version)
    }
    
    fn validate(&self) -> Result<(), StateError> {
        // 基本的な検証
        if self.id.is_empty() {
            return Err(StateError::validation(&self.state_id(), "IDが空です"));
        }
        
        // 設定内容の検証
        if self.config.filters.include.is_empty() {
            return Err(StateError::validation(&self.state_id(), "フォルダパスが設定されていません"));
        }
        
        // フォルダパスの存在確認は省略
        
        Ok(())
    }
    
    fn serialize(&self) -> Result<String, StateError> {
        serde_json::to_string(self)
            .map_err(|e| StateError::SerializationError {
                state_id: self.state_id(),
                message: format!("シリアライズエラー: {}", e),
            })
    }
    
    fn apply_changes(&mut self, change: StateChange) -> Result<(), StateError> {
        if let Some(after) = change.after {
            let updated_state: ResourceConfigState = serde_json::from_str(&after)
                .map_err(|e| StateError::DeserializationError {
                    state_type: self.state_type(),
                    message: format!("JSONパースエラー: {}", e),
                })?;
            
            // 内容を更新
            self.config = updated_state.config;
            self.version = updated_state.version;
            self.timestamp = Utc::now();
        }
        
        Ok(())
    }
    
    fn clone_state(&self) -> Option<Box<dyn State>> {
        Some(Box::new(self.clone()))
    }
}
```

### 3.2 基本的な状態実装例 - ImageViewerState

```rust
/// 画像ビューア状態
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageViewerState {
    /// 状態ID
    id: String,
    
    /// 状態のバージョン
    version: u64,
    
    /// 状態の作成・更新時刻
    timestamp: DateTime<Utc>,
    
    /// 現在選択中の画像ID
    pub selected_image_id: Option<String>,
    
    /// 現在のページ
    pub current_page: usize,
    
    /// ページあたりのアイテム数
    pub items_per_page: usize,
    
    /// 表示モード
    pub view_mode: ViewMode,
    
    /// サムネイルサイズ
    pub thumbnail_size: ThumbnailSize,
}

/// 表示モード
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ViewMode {
    Grid,
    Detail,
}

/// サムネイルサイズ
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThumbnailSize {
    Small,
    Medium,
    Large,
}

impl ImageViewerState {
    pub fn new() -> Self {
        ImageViewerState {
            id: "image_viewer".to_string(),
            version: 1,
            timestamp: Utc::now(),
            selected_image_id: None,
            current_page: 0,
            items_per_page: 50,
            view_mode: ViewMode::Grid,
            thumbnail_size: ThumbnailSize::Medium,
        }
    }
    
    pub fn select_image(&mut self, image_id: Option<String>) {
        self.selected_image_id = image_id;
        self.version += 1;
        self.timestamp = Utc::now();
    }
    
    pub fn set_page(&mut self, page: usize) {
        self.current_page = page;
        self.version += 1;
        self.timestamp = Utc::now();
    }
    
    pub fn set_view_mode(&mut self, mode: ViewMode) {
        self.view_mode = mode;
        self.version += 1;
        self.timestamp = Utc::now();
    }
    
    pub fn set_thumbnail_size(&mut self, size: ThumbnailSize) {
        self.thumbnail_size = size;
        self.version += 1;
        self.timestamp = Utc::now();
    }
}

impl State for ImageViewerState {
    fn state_id(&self) -> StateId {
        StateId::new(&self.id)
    }
    
    fn state_type(&self) -> StateType {
        StateType::new("ImageViewer")
    }
    
    fn version(&self) -> StateVersion {
        StateVersion::new(self.version)
    }
    
    fn validate(&self) -> Result<(), StateError> {
        // 基本的な検証
        if self.id.is_empty() {
            return Err(StateError::validation(&self.state_id(), "IDが空です"));
        }
        
        if self.current_page > 1000 {
            return Err(StateError::validation(&self.state_id(), "ページ番号が大きすぎます"));
        }
        
        if self.items_per_page > 200 {
            return Err(StateError::validation(&self.state_id(), "ページ表示数が大きすぎます"));
        }
        
        Ok(())
    }
    
    fn serialize(&self) -> Result<String, StateError> {
        serde_json::to_string(self)
            .map_err(|e| StateError::SerializationError {
                state_id: self.state_id(),
                message: format!("シリアライズエラー: {}", e),
            })
    }
    
    fn apply_changes(&mut self, change: StateChange) -> Result<(), StateError> {
        if let Some(after) = change.after {
            let updated_state: ImageViewerState = serde_json::from_str(&after)
                .map_err(|e| StateError::DeserializationError {
                    state_type: self.state_type(),
                    message: format!("JSONパースエラー: {}", e),
                })?;
            
            // 内容を更新
            self.selected_image_id = updated_state.selected_image_id;
            self.current_page = updated_state.current_page;
            self.items_per_page = updated_state.items_per_page;
            self.view_mode = updated_state.view_mode;
            self.thumbnail_size = updated_state.thumbnail_size;
            self.version = updated_state.version;
            self.timestamp = Utc::now();
        }
        
        Ok(())
    }
    
    fn clone_state(&self) -> Option<Box<dyn State>> {
        Some(Box::new(self.clone()))
    }
}
```

### 3.3 デシリアライザの登録と管理（簡略化）

```rust
/// 状態をデシリアライズするためのインターフェース
pub trait StateDeserializer: Send + Sync {
    /// この deserializer が対応する状態型
    fn state_type(&self) -> StateType;
    
    /// JSON文字列から状態オブジェクトを復元
    fn deserialize(&self, json: &str) -> Result<Box<dyn State>, StateError>;
}

/// ResourceConfigStateのデシリアライザ
pub struct ResourceConfigDeserializer;

impl StateDeserializer for ResourceConfigDeserializer {
    fn state_type(&self) -> StateType {
        StateType::new("ResourceConfig")
    }
    
    fn deserialize(&self, json: &str) -> Result<Box<dyn State>, StateError> {
        serde_json::from_str::<ResourceConfigState>(json)
            .map(|state| Box::new(state) as Box<dyn State>)
            .map_err(|e| StateError::DeserializationError {
                state_type: self.state_type(),
                message: format!("JSONパースエラー: {}", e),
            })
    }
}

/// ImageViewerStateのデシリアライザ
pub struct ImageViewerDeserializer;

impl StateDeserializer for ImageViewerDeserializer {
    fn state_type(&self) -> StateType {
        StateType::new("ImageViewer")
    }
    
    fn deserialize(&self, json: &str) -> Result<Box<dyn State>, StateError> {
        serde_json::from_str::<ImageViewerState>(json)
            .map(|state| Box::new(state) as Box<dyn State>)
            .map_err(|e| StateError::DeserializationError {
                state_type: self.state_type(),
                message: format!("JSONパースエラー: {}", e),
            })
    }
}

/// デシリアライザレジストリ（シンプル版）
pub struct DeserializerRegistry {
    deserializers: HashMap<StateType, Box<dyn StateDeserializer>>,
}

impl DeserializerRegistry {
    pub fn new() -> Self {
        let mut registry = DeserializerRegistry {
            deserializers: HashMap::new(),
        };
        
        // 標準デシリアライザを登録
        registry.register(Box::new(ResourceConfigDeserializer));
        registry.register(Box::new(ImageViewerDeserializer));
        
        registry
    }
    
    pub fn register(&mut self, deserializer: Box<dyn StateDeserializer>) {
        let state_type = deserializer.state_type();
        self.deserializers.insert(state_type, deserializer);
    }
    
    pub fn deserialize(&self, state_type: &StateType, json: &str) -> Result<Box<dyn State>, StateError> {
        if let Some(deserializer) = self.deserializers.get(state_type) {
            deserializer.deserialize(json)
        } else {
            Err(StateError::general(format!("対応するデシリアライザが見つかりません: {}", state_type.as_str())))
        }
    }
}
```

## 4. Error Handling

### 4.1 エラー処理の基本パターン

```rust
/// 状態操作における簡単なエラー処理パターン
pub fn update_state_safely<T: State + Clone>(
    state: &mut T, 
    update_fn: impl FnOnce(&mut T) -> Result<(), StateError>
) -> Result<StateChange, StateError> {
    // 事前状態をシリアライズ（エラー処理のため）
    let before_json = state.serialize()?;
    
    // 変更を試みる
    update_fn(state)?;
    
    // 検証を実行
    state.validate()?;
    
    // 事後状態をシリアライズ
    let after_json = state.serialize()?;
    
    // 変更を記録して返す
    Ok(StateChange {
        state_id: state.state_id(),
        before: Some(before_json),
        after: Some(after_json),
        timestamp: Utc::now(),
        metadata: HashMap::new(),
    })
}

/// ResourceConfigの変更例
pub fn update_resource_config(
    state: &mut ResourceConfigState,
    config: ResourceConfig
) -> Result<StateChange, StateError> {
    update_state_safely(state, |s| {
        // 設定を更新
        s.update_config(config);
        Ok(())
    })
}

/// 画像ビューア状態の更新例
pub fn select_image_in_viewer(
    state: &mut ImageViewerState,
    image_id: Option<String>
) -> Result<StateChange, StateError> {
    update_state_safely(state, |s| {
        s.select_image(image_id);
        
        // 詳細ビューへ切り替え
        if image_id.is_some() {
            s.set_view_mode(ViewMode::Detail);
        }
        
        Ok(())
    })
}
```

### 4.2 検証エラーの処理

```rust
/// 状態の検証を行う一般的な関数
pub fn validate_state<T: State>(state: &T) -> Vec<StateError> {
    let mut errors = Vec::new();
    
    // 基本検証
    if let Err(e) = state.validate() {
        errors.push(e);
    }
    
    // 状態の種類に応じた追加検証
    match state.state_type().as_str() {
        "ResourceConfig" => {
            if let Some(resource_config) = state.as_any().downcast_ref::<ResourceConfigState>() {
                // ResourceConfigの追加検証
                for path in &resource_config.config.filters.include {
                    if !Path::new(path).exists() {
                        errors.push(StateError::validation(
                            &state.state_id(),
                            format!("パスが存在しません: {}", path)
                        ));
                    }
                }
            }
        },
        "ImageViewer" => {
            if let Some(image_viewer) = state.as_any().downcast_ref::<ImageViewerState>() {
                // ImageViewerの追加検証
                if let Some(image_id) = &image_viewer.selected_image_id {
                    if image_id.is_empty() {
                        errors.push(StateError::validation(
                            &state.state_id(),
                            "選択された画像IDが空です"
                        ));
                    }
                }
            }
        },
        _ => {} // 他の状態タイプの検証
    }
    
    errors
}

// AsAnyのトレイト拡張（downcast用）
pub trait AsAny {
    fn as_any(&self) -> &dyn Any;
}

impl<T: 'static> AsAny for T {
    fn as_any(&self) -> &dyn Any {
        self
    }
}
```

## 5. Performance Considerations

### 5.1 シンプルなキャッシュ戦略

```rust
/// シンプルなキャッシュ機能を持つ状態ラッパー
pub struct CachedState<T: State + Clone> {
    /// 内部状態
    state: T,
    /// シリアライズキャッシュ
    serialized_cache: Option<(StateVersion, String)>,
}

impl<T: State + Clone> CachedState<T> {
    pub fn new(state: T) -> Self {
        CachedState {
            state,
            serialized_cache: None,
        }
    }
    
    pub fn get_state(&self) -> &T {
        &self.state
    }
    
    pub fn get_mut_state(&mut self) -> &mut T {
        // キャッシュを無効化
        self.serialized_cache = None;
        &mut self.state
    }
    
    /// 効率的なシリアライズ（キャッシュ活用）
    pub fn serialize(&mut self) -> Result<String, StateError> {
        // バージョンが変わっていなければキャッシュを返す
        if let Some((cached_version, cached_json)) = &self.serialized_cache {
            if *cached_version == self.state.version() {
                return Ok(cached_json.clone());
            }
        }
        
        // 新しくシリアライズ
        let json = self.state.serialize()?;
        
        // キャッシュを更新
        self.serialized_cache = Some((self.state.version(), json.clone()));
        
        Ok(json)
    }
}

impl<T: State + Clone> State for CachedState<T> {
    fn state_id(&self) -> StateId {
        self.state.state_id()
    }
    
    fn state_type(&self) -> StateType {
        self.state.state_type()
    }
    
    fn version(&self) -> StateVersion {
        self.state.version()
    }
    
    fn validate(&self) -> Result<(), StateError> {
        self.state.validate()
    }
    
    fn serialize(&self) -> Result<String, StateError> {
        // 内部的には不変参照しかないのでクローンして処理
        let mut cloned = self.clone();
        cloned.serialize()
    }
    
    fn apply_changes(&mut self, change: StateChange) -> Result<(), StateError> {
        // キャッシュを無効化
        self.serialized_cache = None;
        
        // 内部状態に変更を適用
        self.state.apply_changes(change)
    }
    
    fn clone_state(&self) -> Option<Box<dyn State>> {
        Some(Box::new(self.clone()))
    }
}

impl<T: State + Clone> Clone for CachedState<T> {
    fn clone(&self) -> Self {
        CachedState {
            state: self.state.clone(),
            serialized_cache: self.serialized_cache.clone(),
        }
    }
}
```

### 5.2 メモリ効率の基本原則

```rust
/// メモリ効率を考慮した状態配信
pub struct StateStore {
    /// 状態ストア
    states: HashMap<StateId, Box<dyn State>>,
    /// デシリアライザレジストリ
    deserializer_registry: DeserializerRegistry,
}

impl StateStore {
    pub fn new() -> Self {
        StateStore {
            states: HashMap::new(),
            deserializer_registry: DeserializerRegistry::new(),
        }
    }
    
    /// 状態の追加・更新
    pub fn update_state(&mut self, state: Box<dyn State>) -> Result<(), StateError> {
        // 状態の検証
        state.validate()?;
        
        // 状態を追加
        self.states.insert(state.state_id(), state);
        
        Ok(())
    }
    
    /// 状態の取得（クローンではなくシリアライズ/デシリアライズで複製）
    pub fn get_state<T: State + DeserializeOwned>(&self, id: &StateId) -> Result<Option<T>, StateError> {
        if let Some(state) = self.states.get(id) {
            // 状態をシリアライズ
            let json = state.serialize()?;
            
            // 新しいインスタンスにデシリアライズ
            let typed_state: T = serde_json::from_str(&json)
                .map_err(|e| StateError::DeserializationError {
                    state_type: state.state_type(),
                    message: format!("デシリアライズエラー: {}", e),
                })?;
                
            Ok(Some(typed_state))
        } else {
            Ok(None)
        }
    }
    
    /// メモリ使用量の見積もり
    pub fn estimate_memory_usage(&self) -> usize {
        let mut total_size = 0;
        
        for state in self.states.values() {
            // 各状態のサイズを近似的に計算
            if let Ok(json) = state.serialize() {
                total_size += json.len();
            }
        }
        
        total_size
    }
    
    /// 不要な状態の削除
    pub fn cleanup_unused_states(&mut self, recent_threshold: Duration) -> usize {
        let now = Utc::now();
        let mut removed_count = 0;
        
        // 最終アクセスが閾値より古い状態を削除
        self.states.retain(|_, state| {
            let state_time = state.version().as_u64();
            let state_datetime = Utc.timestamp_opt(state_time as i64, 0).unwrap();
            
            if now.signed_duration_since(state_datetime) > recent_threshold {
                removed_count += 1;
                false
            } else {
                true
            }
        });
        
        removed_count
    }
}
```

## 6. Integration with Existing Code

### 6.1 既存のResourceConfigとの統合例

```rust
/// ResourceConfigとStateInterfaceの橋渡しアダプタ
pub struct ResourceConfigAdapter {
    state_store: Arc<Mutex<StateStore>>,
}

impl ResourceConfigAdapter {
    pub fn new(state_store: Arc<Mutex<StateStore>>) -> Self {
        ResourceConfigAdapter { state_store }
    }
    
    /// 既存コードから呼び出すロード関数
    pub fn load(&self, app_handle: &AppHandle) -> Result<ResourceConfig, String> {
        let state_id = StateId::new("resource_config");
        
        // 状態ストアから取得
        let state_result = {
            let store = self.state_store.lock().unwrap();
            store.get_state::<ResourceConfigState>(&state_id)
        };
        
        match state_result {
            Ok(Some(state)) => {
                // 状態から設定を抽出
                Ok(state.config.clone())
            },
            _ => {
                // 既存方式でロード
                let config = ResourceConfig::load(app_handle)
                    .map_err(|e| format!("ResourceConfig読み込みエラー: {}", e))?;
                
                // 状態ストアに保存
                let state = ResourceConfigState::new(config.clone());
                
                let mut store = self.state_store.lock().unwrap();
                if let Err(e) = store.update_state(Box::new(state)) {
                    eprintln!("状態保存エラー: {}", e);
                }
                
                Ok(config)
            }
        }
    }
    
    /// 既存コードから呼び出すセーブ関数
    pub fn save(&self, app_handle: &AppHandle, config: ResourceConfig) -> Result<(), String> {
        // 状態ストアの状態を更新
        let state_id = StateId::new("resource_config");
        let mut state_updated = false;
        
        // 既存の状態を取得して更新
        {
            let mut store = self.state_store.lock().unwrap();
            
            if let Ok(Some(mut state)) = store.get_state::<ResourceConfigState>(&state_id) {
                state.update_config(config.clone());
                if let Err(e) = store.update_state(Box::new(state)) {
                    eprintln!("状態更新エラー: {}", e);
                } else {
                    state_updated = true;
                }
            }
        }
        
        // 状態が見つからなかった場合は新規作成
        if !state_updated {
            let state = ResourceConfigState::new(config.clone());
            let mut store = self.state_store.lock().unwrap();
            if let Err(e) = store.update_state(Box::new(state)) {
                eprintln!("状態作成エラー: {}", e);
            }
        }
        
        // 既存方式でも保存
        config.save(app_handle)
    }
}
```

### 6.2 段階的な導入パターン

```rust
/// Tauri アプリのセットアップ時に状態管理を初期化
fn setup_state_management(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // 状態ストアを作成
    let state_store = Arc::new(Mutex::new(StateStore::new()));
    
    // アプリステートとして登録
    app.manage(state_store.clone());
    
    // ResourceConfigアダプタを登録
    let config_adapter = ResourceConfigAdapter::new(state_store.clone());
    app.manage(config_adapter);
    
    // その他の状態アダプタも同様に登録
    
    // フロントエンドからの状態操作リクエストをリスン
    setup_state_listeners(app, state_store)?;
    
    Ok(())
}

/// 状態関連のイベントリスナーを設定
fn setup_state_listeners(
    app: &mut tauri::App,
    state_store: Arc<Mutex<StateStore>>
) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // 状態取得リクエストのリスナー
    app.listen("get-state", move |event| {
        if let Some(payload) = event.payload() {
            let request: StateGetRequest = match serde_json::from_str(payload) {
                Ok(req) => req,
                Err(e) => {
                    let _ = app_handle.emit_all("state-error", format!("無効なリクエスト: {}", e));
                    return;
                }
            };
            
            let state_id = StateId::new(&request.state_id);
            let response = {
                let store = state_store.lock().unwrap();
                match store.get_state::<serde_json::Value>(&state_id) {
                    Ok(Some(json_value)) => StateGetResponse {
                        request_id: request.request_id,
                        success: true,
                        data: Some(json_value),
                        error: None,
                    },
                    Ok(None) => StateGetResponse {
                        request_id: request.request_id,
                        success: false,
                        data: None,
                        error: Some("状態が見つかりません".to_string()),
                    },
                    Err(e) => StateGetResponse {
                        request_id: request.request_id,
                        success: false,
                        data: None,
                        error: Some(format!("エラー: {:?}", e)),
                    },
                }
            };
            
            // 応答を送信
            let _ = app_handle.emit_all("state-response", response);
        }
    });
    
    // 状態更新リクエストのリスナーも同様に実装
    
    Ok(())
}

/// 状態取得リクエスト
#[derive(Debug, Deserialize)]
struct StateGetRequest {
    request_id: String,
    state_id: String,
    state_type: String,
}

/// 状態取得レスポンス
#[derive(Debug, Serialize)]
struct StateGetResponse {
    request_id: String,
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}
```

## 7. Future Enhancements

### 7.1 現実的な拡張候補

```rust
/// 1. 履歴管理と状態の巻き戻し
pub struct StateHistory {
    history: Vec<StateChange>,
    max_history_size: usize,
}

impl StateHistory {
    pub fn new(max_size: usize) -> Self {
        StateHistory {
            history: Vec::with_capacity(max_size),
            max_history_size: max_size,
        }
    }
    
    pub fn add_change(&mut self, change: StateChange) {
        self.history.push(change);
        
        // 最大サイズを超えたら古いものを削除
        if self.history.len() > self.max_history_size {
            self.history.remove(0);
        }
    }
    
    pub fn get_history(&self) -> &[StateChange] {
        &self.history
    }
    
    pub fn clear(&mut self) {
        self.history.clear();
    }
}

/// 2. 永続化サポート
pub trait StatePersistence {
    fn save_state(&self, state: &dyn State) -> Result<(), StateError>;
    fn load_state(&self, state_id: &StateId, state_type: &StateType) -> Result<Box<dyn State>, StateError>;
}

/// 3. リアルタイム状態同期
pub trait StateSync {
    fn notify_state_change(&self, state: &dyn State) -> Result<(), StateError>;
    fn process_remote_change(&self, change: StateChange) -> Result<(), StateError>;
}
```

### 7.2 研究領域（簡潔に）

```rust
/// 状態更新の最適化戦略
pub enum StateUpdateStrategy {
    /// 完全な状態更新
    FullUpdate,
    
    /// パス指定による部分更新
    PathUpdate,
    
    /// 差分ベースの更新
    DiffUpdate,
}

/// 状態の依存関係管理
pub struct StateDependencyManager {
    // 状態間の依存関係を管理
    dependencies: HashMap<StateId, Vec<StateId>>,
}

impl StateDependencyManager {
    /// 依存関係を追加
    pub fn add_dependency(&mut self, dependent: StateId, dependency: StateId) {
        self.dependencies.entry(dependent)
            .or_insert_with(Vec::new)
            .push(dependency);
    }
    
    /// 依存する状態のリストを取得
    pub fn get_dependencies(&self, state_id: &StateId) -> Vec<StateId> {
        self.dependencies.get(state_id)
            .cloned()
            .unwrap_or_default()
    }
    
    /// 依存状態が変更された際の処理
    pub fn handle_dependency_change(&self, changed_id: &StateId) -> Vec<StateId> {
        let mut affected = Vec::new();
        
        for (dependent, dependencies) in &self.dependencies {
            if dependencies.contains(changed_id) {
                affected.push(dependent.clone());
            }
        }
        
        affected
    }
}
```
