# TauriEventManager Detailed Design Specification

## 1. Overview

TauriEventManagerはpoir-viewerアプリケーションにおけるイベント管理の中核コンポーネントです。Tauri v2のイベントシステムを効果的に抽象化し、フロントエンドとバックエンド間、そしてバックエンド内部のコンポーネント間の標準化された通信を提供します。

### 1.1 Core Responsibilities
- フロントエンドとバックエンド間のイベント通信の標準化
- イベントの型安全な発行と購読
- イベントのカテゴリ分類と優先順位付け
- SimpleStateControllerなど他コンポーネントとの連携
- エラー状態のハンドリングと通知
- イベント通信のパフォーマンス最適化

### 1.2 Design Principles
- **型安全性**: Rustの型システムを活用した安全なイベント通信
- **明確なAPI**: 使いやすく、直感的なAPI設計
- **低結合性**: コンポーネント間の疎結合を促進
- **効率性**: 高効率なイベント処理と最小限のオーバーヘッド
- **拡張性**: 将来の機能拡張を容易にする設計
- **耐障害性**: エラーに強く、回復可能なシステム

## 2. Core Interface Definitions

### 2.1 イベント型定義

```rust
/// イベントの基本特性を定義するトレイト
pub trait Event: Send + Sync + 'static {
    /// イベントタイプの識別子
    fn event_type(&self) -> &'static str;
    
    /// イベントの優先度
    fn priority(&self) -> EventPriority;
    
    /// イベントのタイムスタンプ
    fn timestamp(&self) -> DateTime<Utc>;
    
    /// イベントのシリアライズ
    fn serialize(&self) -> Result<String, EventError>;
}

/// イベントの優先度
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EventPriority {
    Critical = 0,
    High = 1,
    Normal = 2,
    Low = 3,
    Background = 4,
}

/// イベントの方向
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventDirection {
    /// フロントエンドからバックエンドへ
    FrontToBack,
    /// バックエンドからフロントエンドへ
    BackToFront,
    /// バックエンド内部の通信
    Internal,
}

/// イベントカテゴリ
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum EventCategory {
    /// 状態変更関連イベント
    State,
    /// リソース操作関連イベント
    Resource,
    /// UI操作関連イベント
    UI,
    /// システム操作関連イベント
    System,
    /// カスタムカテゴリ
    Custom(String),
}
```

### 2.2 イベントエンベロープ

```rust
/// イベントエンベロープ - イベントのメタデータとペイロードをカプセル化
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope<T: Serialize + DeserializeOwned> {
    /// イベント識別子
    pub id: String,
    
    /// イベントタイプ
    pub event_type: String,
    
    /// イベントカテゴリ
    pub category: EventCategory,
    
    /// イベント優先度
    pub priority: EventPriority,
    
    /// タイムスタンプ
    pub timestamp: DateTime<Utc>,
    
    /// イベント方向
    pub direction: EventDirection,
    
    /// イベントペイロード
    pub payload: T,
    
    /// メタデータ
    pub metadata: HashMap<String, Value>,
}

impl<T: Serialize + DeserializeOwned> EventEnvelope<T> {
    pub fn new(event_type: &str, category: EventCategory, priority: EventPriority, 
               direction: EventDirection, payload: T) -> Self {
        EventEnvelope {
            id: Uuid::new_v4().to_string(),
            event_type: event_type.to_string(),
            category,
            priority,
            timestamp: Utc::now(),
            direction,
            payload,
            metadata: HashMap::new(),
        }
    }
    
    pub fn add_metadata<K: Into<String>, V: Into<Value>>(mut self, key: K, value: V) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }
}
```

### 2.3 イベントマネージャインターフェース

```rust
/// イベント管理の中核インターフェース
pub trait TauriEventManager: Send + Sync {
    /// イベントの発行
    /// 
    /// # パラメータ
    /// - `event_type`: イベントタイプ文字列
    /// - `payload`: イベントデータのペイロード
    /// - `category`: イベントのカテゴリ
    /// - `direction`: イベントの方向
    /// 
    /// # 戻り値
    /// - 成功した場合はイベントID、失敗した場合はエラー
    fn emit<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory,
        direction: EventDirection
    ) -> Result<String, EventError>;
    
    /// 優先度付きイベントの発行
    fn emit_with_priority<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory,
        direction: EventDirection,
        priority: EventPriority
    ) -> Result<String, EventError>;
    
    /// イベントの購読
    /// 
    /// # パラメータ
    /// - `event_type`: 購読するイベントタイプ
    /// - `handler`: イベント受信時に呼び出されるハンドラ関数
    /// 
    /// # 戻り値
    /// - 成功した場合は購読ID、失敗した場合はエラー
    fn listen<T: DeserializeOwned>(
        &self,
        event_type: &str,
        handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<SubscriptionId, EventError>;
    
    /// カテゴリによるイベントの購読
    fn listen_category<T: DeserializeOwned>(
        &self,
        category: EventCategory,
        handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<SubscriptionId, EventError>;
    
    /// 購読の解除
    fn unlisten(&self, subscription_id: &SubscriptionId) -> Result<(), EventError>;
    
    /// イベントの一回限りの購読
    fn listen_once<T: DeserializeOwned>(
        &self,
        event_type: &str,
        handler: Box<dyn FnOnce(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<SubscriptionId, EventError>;
    
    /// 特定のイベントIDに対する応答の待機
    async fn wait_for_response<T: DeserializeOwned>(
        &self,
        event_id: &str,
        timeout_ms: u64
    ) -> Result<T, EventError>;
}

/// 購読ID
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SubscriptionId(String);

impl SubscriptionId {
    pub fn new() -> Self {
        SubscriptionId(Uuid::new_v4().to_string())
    }
    
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

### 2.4 イベントリスナートレイト

```rust
/// イベントリスナー
pub trait EventListener: Send + Sync {
    /// リスナーの購読ID
    fn subscription_id(&self) -> &SubscriptionId;
    
    /// リスナーが処理できるイベントタイプ
    fn event_type(&self) -> &str;
    
    /// イベントハンドラの起動
    fn handle(&self, event_json: &str) -> Result<(), EventError>;
    
    /// リスナーの解放
    fn release(self: Box<Self>) -> Result<(), EventError>;
}
```

### 2.5 エラー型定義

```rust
/// イベント関連のエラー
#[derive(Debug, Clone)]
pub enum EventError {
    /// シリアライズエラー
    SerializationError(String),
    
    /// デシリアライズエラー
    DeserializationError(String),
    
    /// タイムアウトエラー
    TimeoutError(String),
    
    /// 無効なイベントタイプ
    InvalidEventType(String),
    
    /// 無効な購読ID
    InvalidSubscriptionId(String),
    
    /// Tauriイベントシステムエラー
    TauriEventError(String),
    
    /// 一般的なエラー
    GeneralError(String),
}

impl EventError {
    pub fn serialization<S: Into<String>>(message: S) -> Self {
        EventError::SerializationError(message.into())
    }
    
    pub fn deserialization<S: Into<String>>(message: S) -> Self {
        EventError::DeserializationError(message.into())
    }
    
    pub fn general<S: Into<String>>(message: S) -> Self {
        EventError::GeneralError(message.into())
    }
}

impl std::fmt::Display for EventError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventError::SerializationError(msg) => write!(f, "シリアライズエラー: {}", msg),
            EventError::DeserializationError(msg) => write!(f, "デシリアライズエラー: {}", msg),
            EventError::TimeoutError(msg) => write!(f, "タイムアウトエラー: {}", msg),
            EventError::InvalidEventType(msg) => write!(f, "無効なイベントタイプ: {}", msg),
            EventError::InvalidSubscriptionId(msg) => write!(f, "無効な購読ID: {}", msg),
            EventError::TauriEventError(msg) => write!(f, "Tauriイベントエラー: {}", msg),
            EventError::GeneralError(msg) => write!(f, "イベントエラー: {}", msg),
        }
    }
}

impl std::error::Error for EventError {}
```

## 3. Implementation Guidelines

### 3.1 基本実装

TauriEventManagerの基本実装を以下に示します。Tauri v2のイベントシステムを活用し、型安全なイベント通信を提供します。

```rust
/// TauriEventManagerの基本実装
pub struct TauriEventManagerImpl {
    /// Tauriアプリケーションハンドル
    app_handle: AppHandle,
    
    /// イベントリスナー管理
    listeners: Arc<RwLock<HashMap<SubscriptionId, Box<dyn EventListener>>>>,
    
    /// 応答待ちのイベント
    pending_responses: Arc<RwLock<HashMap<String, oneshot::Sender<String>>>>,
    
    /// メトリクス収集
    metrics: Arc<EventMetrics>,
}

impl TauriEventManagerImpl {
    pub fn new(app_handle: AppHandle) -> Self {
        TauriEventManagerImpl {
            app_handle,
            listeners: Arc::new(RwLock::new(HashMap::new())),
            pending_responses: Arc::new(RwLock::new(HashMap::new())),
            metrics: Arc::new(EventMetrics::new()),
        }
    }
    
    /// イベントチャネル名の構築
    fn build_channel_name(&self, event_type: &str, direction: EventDirection) -> String {
        match direction {
            EventDirection::FrontToBack => format!("frontend:{}", event_type),
            EventDirection::BackToFront => format!("backend:{}", event_type),
            EventDirection::Internal => format!("internal:{}", event_type),
        }
    }
    
    /// 応答イベントチャネル名の構築
    fn build_response_channel(&self, event_id: &str) -> String {
        format!("response:{}", event_id)
    }
    
    /// カテゴリチャネル名の構築
    fn build_category_channel(&self, category: &EventCategory) -> String {
        match category {
            EventCategory::State => "category:state".to_string(),
            EventCategory::Resource => "category:resource".to_string(),
            EventCategory::UI => "category:ui".to_string(),
            EventCategory::System => "category:system".to_string(),
            EventCategory::Custom(name) => format!("category:custom:{}", name),
        }
    }
}
```

### 3.2 エミッタ実装

```rust
impl TauriEventManager for TauriEventManagerImpl {
    fn emit<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory,
        direction: EventDirection
    ) -> Result<String, EventError> {
        self.emit_with_priority(event_type, payload, category, direction, EventPriority::Normal)
    }
    
    fn emit_with_priority<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory,
        direction: EventDirection,
        priority: EventPriority
    ) -> Result<String, EventError> {
        // イベントエンベロープの作成
        let envelope = EventEnvelope::new(
            event_type, 
            category.clone(), 
            priority, 
            direction, 
            payload
        );
        
        // メトリクスの更新
        self.metrics.record_emit(&envelope);
        
        // エンベロープのシリアライズ
        let json = serde_json::to_string(&envelope)
            .map_err(|e| EventError::serialization(format!("エンベロープのシリアライズに失敗: {}", e)))?;
        
        // イベントチャネル名の構築
        let channel = self.build_channel_name(event_type, direction);
        
        // Tauriイベントとして発行
        self.app_handle.emit_all(&channel, json.clone())
            .map_err(|e| EventError::TauriEventError(format!("Tauriイベント発行エラー: {}", e)))?;
        
        // カテゴリチャネルにも発行
        let category_channel = self.build_category_channel(&category);
        let _ = self.app_handle.emit_all(&category_channel, json.clone())
            .map_err(|e| EventError::TauriEventError(format!("カテゴリイベント発行エラー: {}", e)));
        
        Ok(envelope.id)
    }
    
    // 残りの実装は以下に続きます...
}
```

### 3.3 リスナー実装

```rust
impl TauriEventManager for TauriEventManagerImpl {
    fn listen<T: DeserializeOwned>(
        &self,
        event_type: &str,
        handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<SubscriptionId, EventError> {
        let subscription_id = SubscriptionId::new();
        
        // FrontToBack方向のリスナー設定
        let frontend_channel = self.build_channel_name(event_type, EventDirection::FrontToBack);
        let frontend_listener = self.create_listener::<T>(
            subscription_id.clone(), 
            event_type.to_string(), 
            handler.clone()
        )?;
        
        // BackToFront方向のリスナー設定はフロントエンド側で処理
        
        // Internal方向のリスナー設定
        let internal_channel = self.build_channel_name(event_type, EventDirection::Internal);
        let internal_listener = self.create_listener::<T>(
            subscription_id.clone(), 
            event_type.to_string(), 
            handler
        )?;
        
        // Tauriイベントリスナーのセットアップ
        let app_handle = self.app_handle.clone();
        let listener_subscription_id = subscription_id.clone();
        let listeners = self.listeners.clone();
        
        // フロントエンドからのリスナー
        let frontend_unlisten = app_handle.listen(frontend_channel, move |event| {
            if let Some(payload) = event.payload() {
                if let Some(listener) = listeners.read().unwrap().get(&listener_subscription_id) {
                    if let Err(e) = listener.handle(payload) {
                        eprintln!("フロントエンドイベントハンドリングエラー: {}", e);
                    }
                }
            }
        }).map_err(|e| EventError::TauriEventError(format!("リスナー設定エラー: {}", e)))?;
        
        // 内部イベントリスナー
        let internal_unlisten = app_handle.listen(internal_channel, move |event| {
            if let Some(payload) = event.payload() {
                if let Some(listener) = listeners.read().unwrap().get(&listener_subscription_id) {
                    if let Err(e) = listener.handle(payload) {
                        eprintln!("内部イベントハンドリングエラー: {}", e);
                    }
                }
            }
        }).map_err(|e| EventError::TauriEventError(format!("リスナー設定エラー: {}", e)))?;
        
        // リスナーを登録
        let mut listeners = self.listeners.write().unwrap();
        listeners.insert(subscription_id.clone(), Box::new(
            CompositeEventListener::new(
                subscription_id.clone(),
                event_type.to_string(),
                vec![Box::new(frontend_listener), Box::new(internal_listener)],
                vec![frontend_unlisten, internal_unlisten]
            )
        ));
        
        // メトリクスの更新
        self.metrics.record_subscription(event_type);
        
        Ok(subscription_id)
    }
    
    fn listen_category<T: DeserializeOwned>(
        &self,
        category: EventCategory,
        handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<SubscriptionId, EventError> {
        let subscription_id = SubscriptionId::new();
        let category_channel = self.build_category_channel(&category);
        
        // カテゴリリスナーの作成
        let category_listener = TypedEventListener::new(
            subscription_id.clone(),
            category_channel.clone(),
            handler
        );
        
        // Tauriイベントリスナーのセットアップ
        let app_handle = self.app_handle.clone();
        let listener_subscription_id = subscription_id.clone();
        let listeners = self.listeners.clone();
        
        let unlisten = app_handle.listen(category_channel, move |event| {
            if let Some(payload) = event.payload() {
                if let Some(listener) = listeners.read().unwrap().get(&listener_subscription_id) {
                    if let Err(e) = listener.handle(payload) {
                        eprintln!("カテゴリイベントハンドリングエラー: {}", e);
                    }
                }
            }
        }).map_err(|e| EventError::TauriEventError(format!("カテゴリリスナー設定エラー: {}", e)))?;
        
        // リスナーを登録
        let mut listeners = self.listeners.write().unwrap();
        listeners.insert(subscription_id.clone(), Box::new(
            SingleEventListener::new(
                subscription_id.clone(),
                category_channel,
                Box::new(category_listener),
                unlisten
            )
        ));
        
        // メトリクスの更新
        self.metrics.record_category_subscription(&category);
        
        Ok(subscription_id)
    }
    
    fn unlisten(&self, subscription_id: &SubscriptionId) -> Result<(), EventError> {
        let mut listeners = self.listeners.write().unwrap();
        
        if let Some(listener) = listeners.remove(subscription_id) {
            // リスナーの解放
            listener.release().map_err(|e| {
                listeners.insert(subscription_id.clone(), listener);
                e
            })?;
            
            // メトリクスの更新
            self.metrics.record_unsubscription(subscription_id.as_str());
            
            Ok(())
        } else {
            Err(EventError::InvalidSubscriptionId(
                format!("指定された購読IDのリスナーが見つかりません: {}", subscription_id.as_str())
            ))
        }
    }
    
    fn listen_once<T: DeserializeOwned>(
        &self,
        event_type: &str,
        handler: Box<dyn FnOnce(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<SubscriptionId, EventError> {
        let subscription_id = SubscriptionId::new();
        let self_clone = self.clone();
        let subscription_id_clone = subscription_id.clone();
        let event_type_clone = event_type.to_string();
        
        // 一度だけ実行するハンドラをラップ
        let wrapped_handler = Box::new(move |envelope: EventEnvelope<T>| -> Result<(), EventError> {
            // まずリスナーを解除
            let _ = self_clone.unlisten(&subscription_id_clone);
            
            // 元のハンドラを実行
            handler(envelope)
        });
        
        // 通常のリスナーとして登録
        self.listen::<T>(&event_type_clone, wrapped_handler)
    }
    
    async fn wait_for_response<T: DeserializeOwned>(
        &self,
        event_id: &str,
        timeout_ms: u64
    ) -> Result<T, EventError> {
        // レスポンスチャネルを作成
        let (tx, rx) = oneshot::channel::<String>();
        
        // 待機中のレスポンスとして登録
        {
            let mut pending = self.pending_responses.write().unwrap();
            pending.insert(event_id.to_string(), tx);
        }
        
        // レスポンスチャネル名
        let response_channel = self.build_response_channel(event_id);
        
        // 一時的なリスナーをセットアップ
        let app_handle = self.app_handle.clone();
        let pending_responses = self.pending_responses.clone();
        let event_id_owned = event_id.to_string();
        
        let _unlisten = app_handle.listen_once(response_channel, move |event| {
            if let Some(payload) = event.payload() {
                // 待機中のレスポンスを取得
                let tx_opt = {
                    let mut pending = pending_responses.write().unwrap();
                    pending.remove(&event_id_owned)
                };
                
                // レスポンスがあれば送信
                if let Some(tx) = tx_opt {
                    let _ = tx.send(payload.to_string());
                }
            }
        }).map_err(|e| EventError::TauriEventError(format!("レスポンスリスナー設定エラー: {}", e)))?;
        
        // タイムアウト付きで応答を待機
        let response = tokio::time::timeout(
            std::time::Duration::from_millis(timeout_ms), 
            rx
        ).await
        .map_err(|_| EventError::TimeoutError(format!("レスポンス待機タイムアウト: {}", event_id)))?
        .map_err(|_| EventError::general("レスポンスチャネルが閉じられました"))?;
        
        // レスポンスをデシリアライズ
        let payload: T = serde_json::from_str(&response)
            .map_err(|e| EventError::deserialization(format!("レスポンスデシリアライズエラー: {}", e)))?;
        
        Ok(payload)
    }
}

impl Clone for TauriEventManagerImpl {
    fn clone(&self) -> Self {
        TauriEventManagerImpl {
            app_handle: self.app_handle.clone(),
            listeners: self.listeners.clone(),
            pending_responses: self.pending_responses.clone(),
            metrics: self.metrics.clone(),
        }
    }
}
```

### 3.4 イベントリスナーの実装

```rust
/// 型付きイベントリスナー
pub struct TypedEventListener<T: DeserializeOwned> {
    subscription_id: SubscriptionId,
    event_type: String,
    handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>,
}

impl<T: DeserializeOwned> TypedEventListener<T> {
    pub fn new(
        subscription_id: SubscriptionId,
        event_type: String,
        handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Self {
        TypedEventListener {
            subscription_id,
            event_type,
            handler,
        }
    }
}

impl<T: DeserializeOwned> EventListener for TypedEventListener<T> {
    fn subscription_id(&self) -> &SubscriptionId {
        &self.subscription_id
    }
    
    fn event_type(&self) -> &str {
        &self.event_type
    }
    
    fn handle(&self, event_json: &str) -> Result<(), EventError> {
        // JSONをイベントエンベロープにデシリアライズ
        let envelope: EventEnvelope<T> = serde_json::from_str(event_json)
            .map_err(|e| EventError::deserialization(format!("イベントデシリアライズエラー: {}", e)))?;
        
        // ハンドラを呼び出し
        (self.handler)(envelope)
    }
    
    fn release(self: Box<Self>) -> Result<(), EventError> {
        // 特に開放処理は不要
        Ok(())
    }
}

/// 複合イベントリスナー
pub struct CompositeEventListener {
    subscription_id: SubscriptionId,
    event_type: String,
    listeners: Vec<Box<dyn EventListener>>,
    unlisteners: Vec<UnlistenFn>,
}

impl CompositeEventListener {
    pub fn new(
        subscription_id: SubscriptionId,
        event_type: String,
        listeners: Vec<Box<dyn EventListener>>,
        unlisteners: Vec<UnlistenFn>
    ) -> Self {
        CompositeEventListener {
            subscription_id,
            event_type,
            listeners,
            unlisteners,
        }
    }
}

impl EventListener for CompositeEventListener {
    fn subscription_id(&self) -> &SubscriptionId {
        &self.subscription_id
    }
    
    fn event_type(&self) -> &str {
        &self.event_type
    }
    
    fn handle(&self, event_json: &str) -> Result<(), EventError> {
        // すべてのリスナーに転送
        for listener in &self.listeners {
            if let Err(e) = listener.handle(event_json) {
                eprintln!("複合リスナーエラー: {}", e);
                // エラーがあっても処理を継続
            }
        }
        
        Ok(())
    }
    
    fn release(self: Box<Self>) -> Result<(), EventError> {
        // Tauriのリスナーを解除
        for unlisten in self.unlisteners {
            unlisten();
        }
        
        // 各リスナーを解放
        for listener in self.listeners {
            if let Err(e) = listener.release() {
                eprintln!("リスナー解放エラー: {}", e);
            }
        }
        
        Ok(())
    }
}

/// 単一イベントリスナー
pub struct SingleEventListener {
    subscription_id: SubscriptionId,
    event_type: String,
    listener: Box<dyn EventListener>,
    unlisten: UnlistenFn,
}

impl SingleEventListener {
    pub fn new(
        subscription_id: SubscriptionId,
        event_type: String,
        listener: Box<dyn EventListener>,
        unlisten: UnlistenFn
    ) -> Self {
        SingleEventListener {
            subscription_id,
            event_type,
            listener,
            unlisten,
        }
    }
}

impl EventListener for SingleEventListener {
    fn subscription_id(&self) -> &SubscriptionId {
        &self.subscription_id
    }
    
    fn event_type(&self) -> &str {
        &self.event_type
    }
    
    fn handle(&self, event_json: &str) -> Result<(), EventError> {
        self.listener.handle(event_json)
    }
    
    fn release(self: Box<Self>) -> Result<(), EventError> {
        // Tauriのリスナーを解除
        (self.unlisten)();
        
        // リスナーを解放
        self.listener.release()
    }
}

/// Tauriの解除関数の型
type UnlistenFn = Box<dyn FnOnce() + Send + Sync>;
```

### 3.5 メトリクス管理

```rust
/// イベントメトリクス
pub struct EventMetrics {
    emitted_events: AtomicUsize,
    received_events: AtomicUsize,
    error_count: AtomicUsize,
    active_subscriptions: RwLock<HashMap<String, usize>>,
    category_subscriptions: RwLock<HashMap<EventCategory, usize>>,
}

impl EventMetrics {
    pub fn new() -> Self {
        EventMetrics {
            emitted_events: AtomicUsize::new(0),
            received_events: AtomicUsize::new(0),
            error_count: AtomicUsize::new(0),
            active_subscriptions: RwLock::new(HashMap::new()),
            category_subscriptions: RwLock::new(HashMap::new()),
        }
    }
    
    pub fn record_emit<T: Serialize + DeserializeOwned>(&self, _envelope: &EventEnvelope<T>) {
        self.emitted_events.fetch_add(1, Ordering::Relaxed);
    }
    
    pub fn record_receive<T: DeserializeOwned>(&self, _envelope: &EventEnvelope<T>) {
        self.received_events.fetch_add(1, Ordering::Relaxed);
    }
    
    pub fn record_error(&self, _error: &EventError) {
        self.error_count.fetch_add(1, Ordering::Relaxed);
    }
    
    pub fn record_subscription(&self, event_type: &str) {
        let mut subs = self.active_subscriptions.write().unwrap();
        *subs.entry(event_type.to_string()).or_insert(0) += 1;
    }
    
    pub fn record_category_subscription(&self, category: &EventCategory) {
        let mut cats = self.category_subscriptions.write().unwrap();
        *cats.entry(category.clone()).or_insert(0) += 1;
    }
    
    pub fn record_unsubscription(&self, _subscription_id: &str) {
        // 特定の購読IDに紐づくイベントタイプがわからないため
        // ここでは単純に呼び出し回数のみを記録
    }
    
    pub fn get_stats(&self) -> EventMetricsStats {
        EventMetricsStats {
            emitted_count: self.emitted_events.load(Ordering::Relaxed),
            received_count: self.received_events.load(Ordering::Relaxed),
            error_count: self.error_count.load(Ordering::Relaxed),
            active_subscription_count: self.active_subscriptions.read().unwrap()
                .values().sum(),
            category_subscription_count: self.category_subscriptions.read().unwrap()
                .values().sum(),
        }
    }
}

/// イベントメトリクス統計情報
#[derive(Debug, Clone, Serialize)]
pub struct EventMetricsStats {
    pub emitted_count: usize,
    pub received_count: usize,
    pub error_count: usize,
    pub active_subscription_count: usize,
    pub category_subscription_count: usize,
}
```

### 3.6 ヘルパー関数の実装

```rust
impl TauriEventManagerImpl {
    /// 型付きリスナーを作成するヘルパーメソッド
    fn create_listener<T: DeserializeOwned>(
        &self,
        subscription_id: SubscriptionId,
        event_type: String,
        handler: Box<dyn Fn(EventEnvelope<T>) -> Result<(), EventError> + Send + Sync>
    ) -> Result<TypedEventListener<T>, EventError> {
        Ok(TypedEventListener::new(
            subscription_id,
            event_type,
            handler
        ))
    }
    
    /// 応答を送信
    pub fn send_response<T: Serialize>(
        &self,
        event_id: &str,
        response: T
    ) -> Result<(), EventError> {
        let response_channel = self.build_response_channel(event_id);
        
        // レスポンスをシリアライズ
        let json = serde_json::to_string(&response)
            .map_err(|e| EventError::serialization(format!("レスポンスシリアライズエラー: {}", e)))?;
        
        // Tauriイベントとして発行
        self.app_handle.emit_all(&response_channel, json)
            .map_err(|e| EventError::TauriEventError(format!("レスポンス発行エラー: {}", e)))?;
        
        Ok(())
    }
    
    /// イベントの方向をフロントエンドから設定するヘルパーメソッド
    pub fn create_frontend_event<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory
    ) -> Result<String, EventError> {
        self.emit(event_type, payload, category, EventDirection::FrontToBack)
    }
    
    /// イベントの方向をバックエンドから設定するヘルパーメソッド
    pub fn create_backend_event<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory
    ) -> Result<String, EventError> {
        self.emit(event_type, payload, category, EventDirection::BackToFront)
    }
    
    /// 内部イベントを作成するヘルパーメソッド
    pub fn create_internal_event<T: Serialize + DeserializeOwned>(
        &self,
        event_type: &str,
        payload: T,
        category: EventCategory
    ) -> Result<String, EventError> {
        self.emit(event_type, payload, category, EventDirection::Internal)
    }
}
```

## 4. Error Handling

### 4.1 エラー検出と通知

```rust
/// エラー処理と通知メカニズム
impl TauriEventManagerImpl {
    /// イベント処理中に発生したエラーを処理
    pub fn handle_event_error(
        &self,
        error: EventError,
        event_type: Option<&str>,
        context: Option<&str>
    ) {
        // エラーをログに記録
        let context_info = context.unwrap_or("不明");
        let event_info = event_type.unwrap_or("不明");
        eprintln!("イベントエラー [{}] {}: {}", context_info, event_info, error);
        
        // メトリクスを更新
        self.metrics.record_error(&error);
        
        // エラーイベントを発行
        let error_info = ErrorEventInfo {
            error_message: error.to_string(),
            event_type: event_type.map(String::from),
            context: context.map(String::from),
            timestamp: Utc::now(),
        };
        
        // エラーイベントは内部とフロントエンドの両方に通知
        let _ = self.emit(
            "event_error",
            error_info.clone(),
            EventCategory::System,
            EventDirection::Internal
        );
        
        let _ = self.emit(
            "event_error",
            error_info,
            EventCategory::System,
            EventDirection::BackToFront
        );
    }
    
    /// システムエラーを処理して通知
    pub fn notify_system_error<S: Into<String>>(&self, error_msg: S) {
        let error = EventError::general(error_msg);
        self.handle_event_error(error, None, Some("システムエラー"));
    }
    
    /// 特定のイベントに対するエラーを処理して通知
    pub fn notify_event_error<S: Into<String>>(
        &self,
        event_type: &str,
        error_msg: S
    ) {
        let error = EventError::general(error_msg);
        self.handle_event_error(error, Some(event_type), Some("イベント処理"));
    }
}

/// エラーイベント情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEventInfo {
    pub error_message: String,
    pub event_type: Option<String>,
    pub context: Option<String>,
    pub timestamp: DateTime<Utc>,
}
```

### 4.2 回復メカニズム

```rust
/// イベントシステムの回復メカニズム
impl TauriEventManagerImpl {
    /// リスナーの健全性チェック
    pub fn check_listeners_health(&self) -> Result<(), EventError> {
        let listeners = self.listeners.read().unwrap();
        let total = listeners.len();
        let mut problematic = Vec::new();
        
        // 健全性チェックの実装（簡略化）
        // 実際にはリスナーごとの適切なチェック方法を実装
        
        if !problematic.is_empty() {
            eprintln!("問題のあるリスナーが検出されました: {}/{}", problematic.len(), total);
        }
        
        Ok(())
    }
    
    /// イベントシステムのリセット（極端な場合のための機能）
    pub fn reset_event_system(&self) -> Result<(), EventError> {
        // すべてのリスナーを解除
        let subscription_ids: Vec<SubscriptionId> = {
            let listeners = self.listeners.read().unwrap();
            listeners.keys().cloned().collect()
        };
        
        for id in subscription_ids {
            let _ = self.unlisten(&id);
        }
        
        // 待機中のレスポンスをクリア
        {
            let mut pending = self.pending_responses.write().unwrap();
            pending.clear();
        }
        
        // リセット完了を通知
        let _ = self.emit(
            "system_reset",
            "イベントシステムがリセットされました",
            EventCategory::System,
            EventDirection::Internal
        );
        
        Ok(())
    }
    
    /// 重要なシステムイベントの再登録
    pub fn reestablish_system_listeners(&self) -> Result<Vec<SubscriptionId>, EventError> {
        let mut subscription_ids = Vec::new();
        
        // エラーイベントリスナー
        let error_sub_id = self.listen::<ErrorEventInfo>(
            "event_error",
            Box::new(|error_info| {
                eprintln!("システムエラー: {}", error_info.payload.error_message);
                Ok(())
            })
        )?;
        subscription_ids.push(error_sub_id);
        
        // システムリセットイベントリスナー
        let reset_sub_id = self.listen::<String>(
            "system_reset",
            Box::new(|_| {
                eprintln!("システムリセットが完了しました");
                Ok(())
            })
        )?;
        subscription_ids.push(reset_sub_id);
        
        Ok(subscription_ids)
    }
}
```

## 5. Performance Considerations

### 5.1 イベントバッチ処理

```rust
/// イベントバッチ処理
impl TauriEventManagerImpl {
    /// 複数のイベントをバッチで発行
    pub fn emit_batch<T: Serialize + DeserializeOwned>(
        &self,
        events: Vec<(String, T, EventCategory)>,
        direction: EventDirection
    ) -> Result<Vec<String>, EventError> {
        let mut event_ids = Vec::with_capacity(events.len());
        let mut errors = Vec::new();
        
        // まずすべてのイベントを生成
        let envelopes: Vec<_> = events.into_iter().map(|(event_type, payload, category)| {
            EventEnvelope::new(
                &event_type,
                category,
                EventPriority::Normal,
                direction,
                payload
            )
        }).collect();
        
        // イベントをシリアライズし、チャネル別にグループ化
        let mut channel_events: HashMap<String, Vec<String>> = HashMap::new();
        
        for envelope in envelopes {
            let event_id = envelope.id.clone();
            event_ids.push(event_id);
            
            // イベントをシリアライズ
            let json = match serde_json::to_string(&envelope) {
                Ok(json) => json,
                Err(e) => {
                    errors.push(EventError::serialization(format!("バッチシリアライズエラー: {}", e)));
                    continue;
                }
            };
            
            // チャネル名を構築
            let channel = self.build_channel_name(&envelope.event_type, direction);
            
            // チャネル別にイベントをグループ化
            channel_events.entry(channel).or_insert_with(Vec::new).push(json);
            
            // カテゴリチャネルにも追加
            let category_channel = self.build_category_channel(&envelope.category);
            channel_events.entry(category_channel).or_insert_with(Vec::new).push(json.clone());
        }
        
        // チャネルごとにバッチ送信
        for (channel, events) in channel_events {
            // 単一イベントの場合は通常の emit_all を使用
            if events.len() == 1 {
                if let Err(e) = self.app_handle.emit_all(&channel, events[0].clone()) {
                    errors.push(EventError::TauriEventError(format!("バッチ送信エラー: {}", e)));
                }
            } else {
                // 複数イベントの場合はバッチとして送信
                // 注: Tauri v2では標準のバッチ機能がないため、複数のイベントを配列としてラップ
                let batch_json = serde_json::to_string(&events)
                    .map_err(|e| EventError::serialization(format!("バッチラップエラー: {}", e)))?;
                
                if let Err(e) = self.app_handle.emit_all(&format!("{}:batch", channel), batch_json) {
                    errors.push(EventError::TauriEventError(format!("バッチ送信エラー: {}", e)));
                }
            }
        }
        
        // エラーがあった場合は最初のエラーを返す
        if let Some(first_error) = errors.first() {
            return Err(first_error.clone());
        }
        
        Ok(event_ids)
    }
}
```

### 5.2 メモリ最適化

```rust
/// メモリ使用最適化
impl TauriEventManagerImpl {
    /// リスナーのクリーンアップ
    pub fn cleanup_listeners(&self) -> Result<usize, EventError> {
        let mut listeners_to_remove = Vec::new();
        
        // 使用していないリスナーを特定
        {
            let listeners = self.listeners.read().unwrap();
            for (id, _) in listeners.iter() {
                // 判断基準を実装する必要あり
                // この例では単純化のためすべて維持
            }
        }
        
        // 不要なリスナーを削除
        for id in &listeners_to_remove {
            let _ = self.unlisten(id);
        }
        
        Ok(listeners_to_remove.len())
    }
    
    /// メモリ使用状況の確認
    pub fn check_memory_usage(&self) -> usize {
        let listeners_count = self.listeners.read().unwrap().len();
        let pending_count = self.pending_responses.read().unwrap().len();
        
        // 簡易的なメモリ使用量の見積もり
        // 実際には各コンポーネントの詳細なメモリ使用量計算が必要
        listeners_count * 1000 + pending_count * 500
    }
    
    /// 一時的なリスナーの自動解除
    fn setup_auto_cleanup(&self) {
        let self_clone = self.clone();
        
        // 定期的なクリーンアップを設定
        std::thread::spawn(move || {
            loop {
                // 10秒ごとにクリーンアップ
                std::thread::sleep(std::time::Duration::from_secs(10));
                
                if let Err(e) = self_clone.cleanup_listeners() {
                    eprintln!("リスナークリーンアップエラー: {}", e);
                }
            }
        });
    }
}
```

### 5.3 レート制限

```rust
/// イベントレート制限
pub struct EventRateLimiter {
    // イベントタイプごとのレート制限情報
    limits: RwLock<HashMap<String, RateLimit>>,
    // カテゴリごとのレート制限情報
    category_limits: RwLock<HashMap<EventCategory, RateLimit>>,
}

impl EventRateLimiter {
    pub fn new() -> Self {
        let mut limiter = EventRateLimiter {
            limits: RwLock::new(HashMap::new()),
            category_limits: RwLock::new(HashMap::new()),
        };
        
        // デフォルトのレート制限を設定
        limiter.set_default_limits();
        
        limiter
    }
    
    fn set_default_limits(&mut self) {
        let mut categories = self.category_limits.write().unwrap();
        
        // UI更新は高頻度で許可
        categories.insert(EventCategory::UI, RateLimit::new(100, 1000)); // 1秒間に100回まで
        
        // 状態更新は中程度
        categories.insert(EventCategory::State, RateLimit::new(50, 1000)); // 1秒間に50回まで
        
        // リソース操作は低頻度
        categories.insert(EventCategory::Resource, RateLimit::new(10, 1000)); // 1秒間に10回まで
        
        // システムイベントは優先
        categories.insert(EventCategory::System, RateLimit::new(1000, 1000)); // 実質無制限
    }
    
    /// イベントの発行が許可されるかチェック
    pub fn should_allow_event<T: Serialize + DeserializeOwned>(
        &self,
        envelope: &EventEnvelope<T>
    ) -> bool {
        // クリティカル優先度のイベントは常に許可
        if envelope.priority == EventPriority::Critical {
            return true;
        }
        
        // カテゴリの制限をチェック
        {
            let categories = self.category_limits.read().unwrap();
            if let Some(limit) = categories.get(&envelope.category) {
                if !limit.should_allow() {
                    return false;
                }
            }
        }
        
        // イベントタイプの制限をチェック
        {
            let limits = self.limits.read().unwrap();
            if let Some(limit) = limits.get(&envelope.event_type) {
                return limit.should_allow();
            }
        }
        
        // 制限がない場合は許可
        true
    }
    
    /// 特定のイベントタイプにレート制限を設定
    pub fn set_event_limit(&self, event_type: &str, max_events: usize, time_window_ms: u64) {
        let mut limits = self.limits.write().unwrap();
        limits.insert(event_type.to_string(), RateLimit::new(max_events, time_window_ms));
    }
}

/// レート制限情報
pub struct RateLimit {
    max_events: usize,
    time_window_ms: u64,
    events: Mutex<VecDeque<DateTime<Utc>>>,
}

impl RateLimit {
    pub fn new(max_events: usize, time_window_ms: u64) -> Self {
        RateLimit {
            max_events,
            time_window_ms,
            events: Mutex::new(VecDeque::with_capacity(max_events)),
        }
    }
    
    pub fn should_allow(&self) -> bool {
        let now = Utc::now();
        let time_window = chrono::Duration::milliseconds(self.time_window_ms as i64);
        
        let mut events = self.events.lock().unwrap();
        
        // 時間枠外のイベントを削除
        while let Some(event_time) = events.front() {
            if now - *event_time > time_window {
                events.pop_front();
            } else {
                break;
            }
        }
        
        // イベント数がmax_eventsを超えていなければ許可
        if events.len() < self.max_events {
            events.push_back(now);
            true
        } else {
            false
        }
    }
}
```

## 6. Integration with Existing Code

### 6.1 EventManagerの初期化と設定

```rust
// main.rs または lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // TauriEventManagerを初期化
            let event_manager = TauriEventManagerImpl::new(app.handle());
            
            // アプリケーションのステートとして登録
            app.manage(Arc::new(event_manager));
            
            // システムイベントリスナーを設定
            setup_system_event_listeners(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // イベント関連のコマンド
            get_event_metrics,
            send_event,
            
            // 既存のハンドラ
            greet,
            read_file_content,
            load_resource_config,
            save_resource_config,
            initialize_config,
            get_executable_dir,
            validate_resource_path,
            add_resource_path,
            
            // 画像関連ハンドラ
            get_image_list,
            validate_image_path,
            get_paginated_images,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// システムイベントリスナーの設定
fn setup_system_event_listeners(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // イベントマネージャを取得
    let event_manager = app_handle.state::<Arc<TauriEventManagerImpl>>();
    
    if let Some(event_manager) = event_manager {
        // システムイベントリスナーを設定
        event_manager.reestablish_system_listeners()?;
        
        // ImageViewerのイベントリスナーを設定
        setup_image_viewer_listeners(&event_manager)?;
        
        // ResourceConfigのイベントリスナーを設定
        setup_resource_config_listeners(&event_manager)?;
    }
    
    Ok(())
}

/// Tauri コマンド: イベントメトリクスの取得
#[tauri::command]
fn get_event_metrics(app_handle: AppHandle) -> Result<EventMetricsStats, String> {
    let event_manager = app_handle.state::<Arc<TauriEventManagerImpl>>()
        .ok_or_else(|| "EventManager not found".to_string())?;
    
    Ok(event_manager.metrics.get_stats())
}

/// Tauri コマンド: イベントの送信
#[tauri::command]
fn send_event(
    app_handle: AppHandle,
    event_type: String,
    payload: Value,
    category: String
) -> Result<String, String> {
    let event_manager = app_handle.state::<Arc<TauriEventManagerImpl>>()
        .ok_or_else(|| "EventManager not found".to_string())?;
    
    // カテゴリの変換
    let event_category = match category.as_str() {
        "state" => EventCategory::State,
        "resource" => EventCategory::Resource,
        "ui" => EventCategory::UI,
        "system" => EventCategory::System,
        _ => EventCategory::Custom(category),
    };
    
    // バックエンドからフロントエンドへのイベントとして発行
    event_manager.create_backend_event(&event_type, payload, event_category)
        .map_err(|e| e.to_string())
}
```

### 6.2 既存のResourceConfigとの統合

```rust
/// ResourceConfigのイベントリスナーを設定
fn setup_resource_config_listeners(
    event_manager: &Arc<TauriEventManagerImpl>
) -> Result<(), EventError> {
    // 設定更新イベントリスナー
    event_manager.listen::<ResourceConfigUpdateEvent>(
        "resource_config_update",
        Box::new(move |event| {
            let config = event.payload;
            println!("設定更新イベント受信: {}", config.id);
            
            // ここで適切な処理を実装
            // 例: StateControllerを使って状態を更新
            
            Ok(())
        })
    )?;
    
    // 設定検証イベントリスナー
    event_manager.listen::<ResourceConfigValidateEvent>(
        "resource_config_validate",
        Box::new(move |event| {
            let path = event.payload.path;
            println!("パス検証イベント受信: {}", path);
            
            // ここで適切な処理を実装
            // 例: パスの検証処理
            
            Ok(())
        })
    )?;
    
    Ok(())
}

/// 設定更新イベント
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConfigUpdateEvent {
    pub id: String,
    pub name: String,
    pub filters: ResourceFilters,
}

/// 設定検証イベント
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConfigValidateEvent {
    pub path: String,
}

/// 設定フィルター
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceFilters {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}
```

### 6.3 既存のImageViewerとの統合

```rust
/// ImageViewerのイベントリスナーを設定
fn setup_image_viewer_listeners(
    event_manager: &Arc<TauriEventManagerImpl>
) -> Result<(), EventError> {
    // 画像読み込みイベントリスナー
    event_manager.listen::<ImageLoadEvent>(
        "image_load",
        Box::new(move |event| {
            let path = event.payload.path;
            println!("画像読み込みイベント受信: {}", path);
            
            // ここで適切な処理を実装
            // 例: 画像の読み込み処理
            
            Ok(())
        })
    )?;
    
    // 画像表示モード変更イベントリスナー
    event_manager.listen::<ViewModeChangeEvent>(
        "view_mode_change",
        Box::new(move |event| {
            let mode = event.payload.mode;
            println!("表示モード変更イベント受信: {}", mode);
            
            // ここで適切な処理を実装
            // 例: 表示モードの変更処理
            
            Ok(())
        })
    )?;
    
    Ok(())
}

/// 画像読み込みイベント
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageLoadEvent {
    pub path: String,
    pub index: usize,
}

/// 表示モード変更イベント
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewModeChangeEvent {
    pub mode: String,
    pub size: Option<String>,
}
```

### 6.4 段階的導入パターン

```rust
/// 段階的導入のためのアダプター
pub struct EventAdapterService {
    event_manager: Arc<TauriEventManagerImpl>,
    app_handle: AppHandle,
}

impl EventAdapterService {
    pub fn new(event_manager: Arc<TauriEventManagerImpl>, app_handle: AppHandle) -> Self {
        EventAdapterService {
            event_manager,
            app_handle,
        }
    }
    
    /// 既存の emit_to を EventManager の emit に変換
    pub fn emit_legacy<T: Serialize>(
        &self,
        target: &str,
        event: &str,
        payload: T
    ) -> Result<(), String> {
        let category = match event {
            ev if ev.starts_with("config-") => EventCategory::State,
            ev if ev.starts_with("image-") => EventCategory::Resource,
            ev if ev.starts_with("ui-") => EventCategory::UI,
            _ => EventCategory::Custom("legacy".to_string()),
        };
        
        // 適切な方向を判断
        let direction = match target {
            "main" => EventDirection::BackToFront,
            _ => EventDirection::Internal,
        };
        
        self.event_manager.emit(event, payload, category, direction)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    
    /// 既存のリスナーを EventManager のリスナーに変換
    pub fn listen_legacy<F, T>(
        &self,
        event: &str,
        handler: F
    ) -> Result<SubscriptionId, String>
    where
        F: Fn(T) -> () + Send + Sync + 'static,
        T: DeserializeOwned + 'static,
    {
        let category = match event {
            ev if ev.starts_with("config-") => EventCategory::State,
            ev if ev.starts_with("image-") => EventCategory::Resource,
            ev if ev.starts_with("ui-") => EventCategory::UI,
            _ => EventCategory::Custom("legacy".to_string()),
        };
        
        let wrapped_handler = Box::new(move |envelope: EventEnvelope<T>| {
            handler(envelope.payload);
            Ok(())
        });
        
        self.event_manager.listen(event, wrapped_handler)
            .map_err(|e| e.to_string())
    }
    
    /// 既存の invoke を EventManager を介して行う
    pub async fn invoke_via_events<T: DeserializeOwned>(
        &self,
        command: &str,
        args: Option<Value>
    ) -> Result<T, String> {
        // コマンドとパラメータから一意なイベントIDを生成
        let event_id = format!("invoke:{}:{}", command, Uuid::new_v4());
        
        // バックエンドに送信するイベントを作成
        let payload = InvokeEventPayload {
            command: command.to_string(),
            args,
            response_id: event_id.clone(),
        };
        
        // イベントを発行
        self.event_manager.emit(
            "invoke_command",
            payload,
            EventCategory::System,
            EventDirection::FrontToBack
        ).map_err(|e| e.to_string())?;
        
        // レスポンスを待機
        self.event_manager.wait_for_response::<T>(&event_id, 5000)
            .await
            .map_err(|e| e.to_string())
    }
}

/// invoke_commandイベントのペイロード
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvokeEventPayload {
    pub command: String,
    pub args: Option<Value>,
    pub response_id: String,
}

/// invoke_commandのリスナー設定
fn setup_invoke_command_listener(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // イベントマネージャを取得
    let event_manager = app_handle.state::<Arc<TauriEventManagerImpl>>()
        .ok_or_else(|| "EventManager not found".to_string())?;
    
    // invoke_commandリスナーを設定
    event_manager.listen::<InvokeEventPayload>(
        "invoke_command",
        Box::new(move |event| {
            let payload = event.payload;
            let response_id = payload.response_id.clone();
            let app_handle = app_handle.clone();
            let event_manager = event_manager.clone();
            
            // 非同期でコマンドを実行
            tauri::async_runtime::spawn(async move {
                let result = match payload.command.as_str() {
                    "greet" => {
                        let name = payload.args.and_then(|args| args.get("name"))
                            .and_then(|name| name.as_str())
                            .unwrap_or("Guest");
                        
                        // 既存のgreetコマンドを呼び出し
                        let greeting = format!("Hello, {}! You've been greeted via events!", name);
                        serde_json::to_value(greeting).unwrap_or(Value::Null)
                    },
                    // 他のコマンドも同様に実装
                    _ => Value::Null,
                };
                
                // 結果をレスポンスとして送信
                let _ = event_manager.send_response(&response_id, result);
            });
            
            Ok(())
        })
    )?;
    
    Ok(())
}
```

## 7. Future Enhancements

### 7.1 拡張機能

```rust
/// イベント履歴の実装
pub struct EventHistory {
    history: RwLock<VecDeque<EventHistoryEntry>>,
    max_entries: usize,
}

impl EventHistory {
    pub fn new(max_entries: usize) -> Self {
        EventHistory {
            history: RwLock::new(VecDeque::with_capacity(max_entries)),
            max_entries,
        }
    }
    
    pub fn add_entry<T: Serialize + DeserializeOwned>(&self, envelope: &EventEnvelope<T>) {
        let entry = EventHistoryEntry {
            id: envelope.id.clone(),
            event_type: envelope.event_type.clone(),
            category: envelope.category.clone(),
            priority: envelope.priority,
            timestamp: envelope.timestamp,
            direction: envelope.direction,
            // ペイロードは保存しない
        };
        
        let mut history = self.history.write().unwrap();
        
        if history.len() >= self.max_entries {
            history.pop_front();
        }
        
        history.push_back(entry);
    }
    
    pub fn get_recent_entries(&self, limit: usize) -> Vec<EventHistoryEntry> {
        let history = self.history.read().unwrap();
        let start = history.len().saturating_sub(limit);
        history.iter().skip(start).cloned().collect()
    }
    
    pub fn get_entries_by_type(&self, event_type: &str, limit: usize) -> Vec<EventHistoryEntry> {
        let history = self.history.read().unwrap();
        history.iter()
            .filter(|entry| entry.event_type == event_type)
            .take(limit)
            .cloned()
            .collect()
    }
}

/// イベント履歴エントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventHistoryEntry {
    pub id: String,
    pub event_type: String,
    pub category: EventCategory,
    pub priority: EventPriority,
    pub timestamp: DateTime<Utc>,
    pub direction: EventDirection,
}
```

### 7.2 イベントフィルタリング

```rust
/// イベントフィルタリング機能
pub struct EventFilter {
    filters: RwLock<HashMap<String, Box<dyn Fn(&Value) -> bool + Send + Sync>>>,
}

impl EventFilter {
    pub fn new() -> Self {
        EventFilter {
            filters: RwLock::new(HashMap::new()),
        }
    }
    
    /// フィルタを追加
    pub fn add_filter<F>(&self, event_type: &str, filter: F)
    where
        F: Fn(&Value) -> bool + Send + Sync + 'static,
    {
        let mut filters = self.filters.write().unwrap();
        filters.insert(event_type.to_string(), Box::new(filter));
    }
    
    /// イベントがフィルタを通過するかチェック
    pub fn should_process(&self, event_type: &str, payload: &Value) -> bool {
        let filters = self.filters.read().unwrap();
        
        if let Some(filter) = filters.get(event_type) {
            filter(payload)
        } else {
            true // フィルタがなければ常に通過
        }
    }
}
```

### 7.3 イベントパイプライン

```rust
/// イベント処理パイプライン
pub struct EventPipeline {
    stages: Vec<Box<dyn EventPipelineStage>>,
}

impl EventPipeline {
    pub fn new() -> Self {
        EventPipeline {
            stages: Vec::new(),
        }
    }
    
    /// 処理ステージを追加
    pub fn add_stage(&mut self, stage: Box<dyn EventPipelineStage>) {
        self.stages.push(stage);
    }
    
    /// イベントをパイプラインで処理
    pub fn process_event<T: Serialize + DeserializeOwned>(
        &self,
        envelope: EventEnvelope<T>
    ) -> Result<EventEnvelope<T>, EventError> {
        let mut current_envelope = envelope;
        
        for stage in &self.stages {
            current_envelope = stage.process(current_envelope)?;
        }
        
        Ok(current_envelope)
    }
}

/// イベントパイプラインステージのトレイト
pub trait EventPipelineStage: Send + Sync {
    fn process<T: Serialize + DeserializeOwned>(
        &self,
        envelope: EventEnvelope<T>
    ) -> Result<EventEnvelope<T>, EventError>;
}

/// メタデータ追加ステージの例
pub struct MetadataStage {
    metadata: HashMap<String, Value>,
}

impl EventPipelineStage for MetadataStage {
    fn process<T: Serialize + DeserializeOwned>(
        &self,
        mut envelope: EventEnvelope<T>
    ) -> Result<EventEnvelope<T>, EventError> {
        // メタデータを追加
        for (key, value) in &self.metadata {
            envelope.metadata.insert(key.clone(), value.clone());
        }
        
        Ok(envelope)
    }
}

/// フィルタリングステージの例
pub struct FilterStage {
    filter: EventFilter,
}

impl EventPipelineStage for FilterStage {
    fn process<T: Serialize + DeserializeOwned>(
        &self,
        envelope: EventEnvelope<T>
    ) -> Result<EventEnvelope<T>, EventError> {
        // ペイロードをValueに変換
        let payload_value = serde_json::to_value(&envelope.payload)
            .map_err(|e| EventError::serialization(format!("ペイロード変換エラー: {}", e)))?;
        
        // フィルタチェック
        if self.filter.should_process(&envelope.event_type, &payload_value) {
            Ok(envelope)
        } else {
            Err(EventError::general("イベントがフィルタリングされました"))
        }
    }
}
```

### 7.4 将来の研究領域

1. **分散イベント処理**:
   - 複数のプロセス/マシン間でのイベント同期
   - イベントの整合性保証メカニズム
   - 遅延/非同期イベント配信戦略

2. **AI駆動のイベント最適化**:
   - イベントパターンの学習と予測
   - 自動的な優先度調整
   - アノマリー検出と自動回復

3. **高度なセキュリティ機能**:
   - イベントの認証と認可
   - イベントペイロードの暗号化
   - イベントチェーン検証（blockchain-like）

4. **イベントストリーム処理**:
   - 複雑なイベント処理ルール（CEP）
   - イベントの集約と変換
   - 時系列分析とパターン認識
