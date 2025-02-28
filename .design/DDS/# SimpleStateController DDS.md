# SimpleStateController Detailed Design Specification

## 1. Overview

SimpleStateControllerは、poir-viewerにおける軽量で効率的な状態管理コンポーネントです。前回のStateControllerを簡略化し、Tauri v2のイベントシステムと統合することで、フロントエンドとバックエンド間の状態同期を実現します。

### 1.1 Core Responsibilities
- アプリケーション状態の中央管理
- 状態変更のトランザクション管理（簡略化）
- フロントエンドとの状態同期
- 状態変更の通知
- エラー処理と回復

### 1.2 Design Principles
- **簡素化**: 最小限の複雑さで必要な機能を提供
- **Tauri統合**: Tauriのイベントシステムを最大限活用
- **スレッドセーフ**: 安全な並行処理
- **パフォーマンス**: 効率的なメモリ使用と操作
- **拡張性**: 将来的な機能追加を容易にする設計

## 2. Core Interface Definitions

### 2.1 状態コンテキスト

```rust
/// 状態操作のコンテキスト情報を提供
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateContext {
    /// 操作のタイムスタンプ
    pub timestamp: u64,
    /// 操作の種類
    pub operation_type: StateOperationType,
    /// トランザクションID（オプショナル）
    pub transaction_id: Option<String>,
    /// メタデータ
    pub metadata: HashMap<String, Value>,
}

/// 状態操作の種類
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum StateOperationType {
    Create,
    Update,
    Delete,
    Validate,
}
```

### 2.2 状態インターフェース

```rust
/// 状態オブジェクトの基本インターフェース
pub trait State: Send + Sync + 'static {
    /// 状態の一意なID
    fn state_id(&self) -> String;
    
    /// 状態の型名
    fn state_type(&self) -> String;
    
    /// 状態のバージョン
    fn version(&self) -> u64;
    
    /// 状態が有効かどうか検証
    fn validate(&self) -> Result<(), String>;
    
    /// 状態をシリアライズ
    fn serialize(&self) -> Result<String, String>;
    
    /// 状態変更を適用
    fn apply_changes(&mut self, changes: StateChanges) -> Result<(), String>;
}

/// 状態変更を表す構造体
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateChanges {
    /// 変更のリスト
    pub changes: Vec<StateChange>,
    /// 変更グループのID
    pub batch_id: String,
    /// 変更のタイムスタンプ
    pub timestamp: u64,
}

/// 個々の状態変更
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateChange {
    /// 状態ID
    pub state_id: String,
    /// 操作の種類
    pub operation_type: StateOperationType,
    /// 変更前の状態（JSONシリアライズ形式、オプショナル）
    pub before: Option<String>,
    /// 変更後の状態（JSONシリアライズ形式、オプショナル）
    pub after: Option<String>,
    /// 変更のタイムスタンプ
    pub timestamp: u64,
    /// メタデータ
    pub metadata: HashMap<String, Value>,
}
```

### 2.3 SimpleStateController インターフェース

SimpleStateControllerは状態管理の中核となるトレイトです。以下に完全なインターフェース定義を示します。

```rust
/// 状態管理の中核インターフェース
pub trait SimpleStateController: Send + Sync {
    /// 状態の取得
    /// 
    /// 指定されたIDの状態を取得します。状態が存在しない場合はNoneを返します。
    /// 
    /// # パラメータ
    /// - `id`: 取得する状態のID
    /// 
    /// # 戻り値
    /// - `Result<Option<T>, String>`: 成功した場合は状態オブジェクト、失敗した場合はエラーメッセージ
    fn get_state<T: State + DeserializeOwned>(&self, id: &str) -> Result<Option<T>, String>;
    
    /// 状態の更新
    /// 
    /// 指定された状態を更新します。状態が存在しない場合は新規作成します。
    /// トランザクション内での呼び出しの場合、実際の更新はコミット時に行われます。
    /// 
    /// # パラメータ
    /// - `context`: 操作コンテキスト
    /// - `state`: 更新する状態オブジェクト
    /// 
    /// # 戻り値
    /// - `Result<(), String>`: 成功した場合は空、失敗した場合はエラーメッセージ
    fn update_state(&self, context: StateContext, state: Box<dyn State>) -> Result<(), String>;
    
    /// 状態の削除
    /// 
    /// 指定されたIDの状態を削除します。
    /// 
    /// # パラメータ
    /// - `context`: 操作コンテキスト
    /// - `id`: 削除する状態のID
    /// 
    /// # 戻り値
    /// - `Result<(), String>`: 成功した場合は空、失敗した場合はエラーメッセージ
    fn delete_state(&self, context: StateContext, id: &str) -> Result<(), String>;
    
    /// トランザクション開始
    /// 
    /// 複数の状態変更をアトミックに扱うトランザクションを開始します。
    /// 
    /// # パラメータ
    /// - `context`: 操作コンテキスト
    /// 
    /// # 戻り値
    /// - `Result<String, String>`: 成功した場合はトランザクションID、失敗した場合はエラーメッセージ
    fn begin_transaction(&self, context: StateContext) -> Result<String, String>;
    
    /// トランザクションコミット
    /// 
    /// トランザクション内の全ての変更を確定します。
    /// 
    /// # パラメータ
    /// - `context`: 操作コンテキスト
    /// - `id`: コミットするトランザクションのID
    /// 
    /// # 戻り値
    /// - `Result<(), String>`: 成功した場合は空、失敗した場合はエラーメッセージ
    fn commit_transaction(&self, context: StateContext, id: &str) -> Result<(), String>;
    
    /// トランザクションロールバック
    /// 
    /// トランザクション内の全ての変更を取り消します。
    /// 
    /// # パラメータ
    /// - `context`: 操作コンテキスト
    /// - `id`: ロールバックするトランザクションのID
    /// 
    /// # 戻り値
    /// - `Result<(), String>`: 成功した場合は空、失敗した場合はエラーメッセージ
    fn rollback_transaction(&self, context: StateContext, id: &str) -> Result<(), String>;
    
    /// 状態変化の購読
    /// 
    /// 指定された状態型の変更イベントをリッスンします。
    /// 
    /// # パラメータ
    /// - `state_type`: 購読する状態の型名
    /// - `callback`: 状態変更時に呼び出すコールバック関数
    /// 
    /// # 戻り値
    /// - `Result<String, String>`: 成功した場合は購読ID、失敗した場合はエラーメッセージ
    fn subscribe(&self, state_type: &str, callback: Box<dyn Fn(StateEvent) + Send + Sync>) -> Result<String, String>;
    
    /// 購読解除
    /// 
    /// 指定された購読を解除します。
    /// 
    /// # パラメータ
    /// - `subscription_id`: 解除する購読のID
    /// 
    /// # 戻り値
    /// - `Result<(), String>`: 成功した場合は空、失敗した場合はエラーメッセージ
    fn unsubscribe(&self, subscription_id: &str) -> Result<(), String>;
}
```

### 2.4 イベント型

```rust
/// 状態変更イベント
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateEvent {
    /// イベントコンテキスト
    pub context: StateContext,
    /// 状態ID
    pub state_id: String,
    /// 状態タイプ
    pub state_type: String,
    /// イベントタイプ
    pub event_type: StateEventType,
}

/// 状態イベントの種類
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum StateEventType {
    Created,
    Updated,
    Deleted,
    Invalid,
}

impl StateEventType {
    /// イベントタイプを文字列に変換
    pub fn as_str(&self) -> &'static str {
        match self {
            StateEventType::Created => "created",
            StateEventType::Updated => "updated",
            StateEventType::Deleted => "deleted",
            StateEventType::Invalid => "invalid",
        }
    }
}
```

## 3. Implementation Guidelines

この節では、SimpleStateControllerの実装例を示します。まず基本的な実装から始め、トランザクション管理、Tauriイベントシステムとの統合へと進みます。

### 3.1 基本実装

```rust
/// SimpleStateControllerの基本実装
pub struct SimpleStateControllerImpl {
    /// アプリハンドル
    app_handle: AppHandle,
    /// 状態ストア
    states: RwLock<HashMap<String, Box<dyn State>>>,
    /// トランザクション
    transactions: RwLock<HashMap<String, Transaction>>,
    /// 購読ID管理
    subscriptions: RwLock<HashMap<String, SubscriptionInfo>>,
}

/// トランザクション情報
struct Transaction {
    id: String,
    changes: Vec<StateChange>,
    status: TransactionStatus,
    timestamp: u64,
}

/// トランザクションの状態
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TransactionStatus {
    Active,
    Committing,
    Committed,
    RollingBack,
    RolledBack,
    Failed,
}

/// 購読情報
struct SubscriptionInfo {
    id: String,
    state_type: String,
    callback: Box<dyn Fn(StateEvent) + Send + Sync>,
}

impl SimpleStateControllerImpl {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            states: RwLock::new(HashMap::new()),
            transactions: RwLock::new(HashMap::new()),
            subscriptions: RwLock::new(HashMap::new()),
        }
    }
    
    /// 現在のタイムスタンプを取得
    fn now_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}
```

### 3.2 状態操作の実装

SimpleStateControllerトレイトの主要メソッドの実装例を示します。

```rust
impl SimpleStateController for SimpleStateControllerImpl {
    fn get_state<T: State + DeserializeOwned>(&self, id: &str) -> Result<Option<T>, String> {
        let states = self.states.read().map_err(|_| "ロック取得失敗")?;
        
        if let Some(state) = states.get(id) {
            // 状態をシリアライズしてから目的の型にデシリアライズ
            let json = state.serialize()?;
            let typed_state: T = serde_json::from_str(&json)
                .map_err(|e| format!("デシリアライズエラー: {}", e))?;
            
            Ok(Some(typed_state))
        } else {
            Ok(None)
        }
    }

    fn update_state(&self, context: StateContext, state: Box<dyn State>) -> Result<(), String> {
        let state_id = state.state_id();
        let state_type = state.state_type();
        
        // トランザクション処理
        if let Some(transaction_id) = &context.transaction_id {
            return self.add_to_transaction(transaction_id, context, state);
        }
        
        // 状態を検証
        state.validate()?;
        
        // 状態の更新
        {
            let mut states = self.states.write().map_err(|_| "ロック取得失敗")?;
            states.insert(state_id.clone(), state);
        }
        
        // イベント通知
        let event = StateEvent {
            context,
            state_id,
            state_type: state_type.clone(),
            event_type: StateEventType::Updated,
        };
        
        self.emit_state_event(&event)?;
        
        Ok(())
    }

    fn delete_state(&self, context: StateContext, id: &str) -> Result<(), String> {
        // トランザクション処理
        if let Some(transaction_id) = &context.transaction_id {
            let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
            
            let transaction = transactions.get_mut(transaction_id)
                .ok_or_else(|| format!("トランザクションが見つかりません: {}", transaction_id))?;
                
            if transaction.status != TransactionStatus::Active {
                return Err(format!("トランザクションがアクティブではありません: {:?}", transaction.status));
            }
            
            // 既存の状態を取得（存在する場合）
            let old_state_json = {
                let states = self.states.read().map_err(|_| "ロック取得失敗")?;
                states.get(id)
                    .map(|s| s.serialize().unwrap_or_default())
                    .unwrap_or_default()
            };
            
            // 変更を記録
            let change = StateChange {
                state_id: id.to_string(),
                operation_type: StateOperationType::Delete,
                before: if old_state_json.is_empty() { None } else { Some(old_state_json) },
                after: None,
                timestamp: Self::now_timestamp(),
                metadata: HashMap::new(),
            };
            
            transaction.changes.push(change);
            
            return Ok(());
        }
        
        // トランザクション外での削除処理
        let state_type = {
            let states = self.states.read().map_err(|_| "ロック取得失敗")?;
            match states.get(id) {
                Some(state) => state.state_type(),
                None => return Ok(()),  // 存在しない状態の削除は成功とみなす
            }
        };
        
        // 状態を削除
        {
            let mut states = self.states.write().map_err(|_| "ロック取得失敗")?;
            states.remove(id);
        }
        
        // イベント通知
        let event = StateEvent {
            context,
            state_id: id.to_string(),
            state_type,
            event_type: StateEventType::Deleted,
        };
        
        self.emit_state_event(&event)?;
        
        Ok(())
    }

    fn begin_transaction(&self, context: StateContext) -> Result<String, String> {
        let transaction_id = Uuid::new_v4().to_string();
        
        let transaction = Transaction {
            id: transaction_id.clone(),
            changes: Vec::new(),
            status: TransactionStatus::Active,
            timestamp: context.timestamp,
        };
        
        let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
        transactions.insert(transaction_id.clone(), transaction);
        
        Ok(transaction_id)
    }
    
    // 他のメソッドの実装は省略...
}
```

### 3.3 トランザクション管理の実装

トランザクション関連の実装詳細を示します。

```rust
impl SimpleStateControllerImpl {
    /// トランザクションに変更を追加
    fn add_to_transaction(&self, 
                         transaction_id: &str, 
                         context: StateContext, 
                         state: Box<dyn State>) -> Result<(), String> {
        // 状態を検証
        state.validate()?;
        
        let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
        
        let transaction = transactions.get_mut(transaction_id)
            .ok_or_else(|| format!("トランザクションが見つかりません: {}", transaction_id))?;
            
        if transaction.status != TransactionStatus::Active {
            return Err(format!("トランザクションがアクティブではありません: {:?}", transaction.status));
        }
        
        // 現在の状態を取得（存在する場合）
        let old_state_json = {
            let states = self.states.read().map_err(|_| "ロック取得失敗")?;
            states.get(&state.state_id())
                .map(|s| s.serialize().unwrap_or_default())
        };
        
        // 新しい状態をシリアライズ
        let new_state_json = state.serialize()?;
        
        // 変更を記録
        let change = StateChange {
            state_id: state.state_id(),
            state_type: state.state_type(),
            operation_type: context.operation_type,
            before: old_state_json,
            after: Some(new_state_json),
            timestamp: Self::now_timestamp(),
            metadata: context.metadata.clone(),
        };
        
        transaction.changes.push(change);
        
        Ok(())
    }
}

impl SimpleStateController for SimpleStateControllerImpl {
    fn commit_transaction(&self, context: StateContext, id: &str) -> Result<(), String> {
        // トランザクションを取得して状態をコミット中に変更
        let changes_to_apply = {
            let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
            
            let transaction = transactions.get_mut(id)
                .ok_or_else(|| format!("トランザクションが見つかりません: {}", id))?;
                
            if transaction.status != TransactionStatus::Active {
                return Err(format!("トランザクションがアクティブではありません: {:?}", transaction.status));
            }
            
            transaction.status = TransactionStatus::Committing;
            transaction.changes.clone()
        };
        
        // 変更を適用
        let mut states = self.states.write().map_err(|_| "ロック取得失敗")?;
        
        for change in &changes_to_apply {
            match change.operation_type {
                StateOperationType::Create | StateOperationType::Update => {
                    if let Some(new_state_json) = &change.after {
                        // 状態型に応じたデシリアライズ（この例では簡略化）
                        // 実際の実装では、状態型に合わせた適切なデシリアライザを使用する必要がある
                        let _state_type = &change.state_type;
                        
                        // ここでは既存の状態を更新
                        if let Some(existing_state) = states.get_mut(&change.state_id) {
                            let changes = StateChanges {
                                changes: vec![change.clone()],
                                batch_id: Uuid::new_v4().to_string(),
                                timestamp: Self::now_timestamp(),
                            };
                            
                            if let Err(e) = existing_state.apply_changes(changes) {
                                // トランザクションをロールバック
                                self.mark_transaction_failed(id)?;
                                return Err(format!("状態更新エラー: {}", e));
                            }
                        }
                        // 新しい状態の場合は追加処理が必要（簡略化のため省略）
                    }
                },
                StateOperationType::Delete => {
                    states.remove(&change.state_id);
                },
                _ => {}
            }
        }
        
        // トランザクションを完了状態に
        {
            let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
            if let Some(transaction) = transactions.get_mut(id) {
                transaction.status = TransactionStatus::Committed;
            }
        }
        
        // 全ての変更についてイベントを発火
        for change in changes_to_apply {
            let event_type = match change.operation_type {
                StateOperationType::Create => StateEventType::Created,
                StateOperationType::Update => StateEventType::Updated,
                StateOperationType::Delete => StateEventType::Deleted,
                _ => continue,
            };
            
            let event = StateEvent {
                context: context.clone(),
                state_id: change.state_id,
                state_type: change.state_type,
                event_type,
            };
            
            // イベント発火でエラーが発生しても続行
            if let Err(e) = self.emit_state_event(&event) {
                eprintln!("イベント発火エラー: {}", e);
            }
        }
        
        Ok(())
    }

    fn rollback_transaction(&self, _context: StateContext, id: &str) -> Result<(), String> {
        let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
        
        let transaction = transactions.get_mut(id)
            .ok_or_else(|| format!("トランザクションが見つかりません: {}", id))?;
            
        if transaction.status != TransactionStatus::Active {
            return Err(format!("トランザクションがアクティブではありません: {:?}", transaction.status));
        }
        
        transaction.status = TransactionStatus::RolledBack;
        transaction.changes.clear();
        
        Ok(())
    }
}

impl SimpleStateControllerImpl {
    /// トランザクションを失敗状態にマーク
    fn mark_transaction_failed(&self, id: &str) -> Result<(), String> {
        let mut transactions = self.transactions.write().map_err(|_| "ロック取得失敗")?;
        
        if let Some(transaction) = transactions.get_mut(id) {
            transaction.status = TransactionStatus::Failed;
        }
        
        Ok(())
    }
}
```

## 4. Tauri イベントシステムとの統合

Tauriのイベントシステムを活用して、バックエンドからフロントエンドへの状態変更通知と、フロントエンドからバックエンドへの更新要求を実装します。

### 4.1 状態イベントの発火

```rust
impl SimpleStateControllerImpl {
    /// 状態イベントを発火
    fn emit_state_event(&self, event: &StateEvent) -> Result<(), String> {
        // 複数のイベントチャネルを通じて同じイベントを発火
        
        // 1. 特定の状態タイプに対するイベント
        // 例: "state-user-updated"
        let type_event_channel = format!("state-{}-{}", 
                                       event.state_type, 
                                       event.event_type.as_str());
        
        // 2. 特定の状態IDに対するイベント
        // 例: "state-id-user123-updated"
        let id_event_channel = format!("state-id-{}-{}", 
                                     event.state_id, 
                                     event.event_type.as_str());
        
        // 3. すべての状態イベント
        // 例: "state-all-updated"
        let all_event_channel = format!("state-all-{}", 
                                      event.event_type.as_str());
        
        // 各チャネルでイベントを発火
        self.app_handle.emit_all(&type_event_channel, event)
            .map_err(|e| format!("イベント発火エラー (type): {}", e))?;
            
        self.app_handle.emit_all(&id_event_channel, event)
            .map_err(|e| format!("イベント発火エラー (id): {}", e))?;
            
        self.app_handle.emit_all(&all_event_channel, event)
            .map_err(|e| format!("イベント発火エラー (all): {}", e))?;
        
        // 登録済みのコールバックにも通知
        self.notify_subscribers(event)?;
        
        Ok(())
    }
    
    /// 登録済みのコールバックに通知
    fn notify_subscribers(&self, event: &StateEvent) -> Result<(), String> {
        let subscriptions = self.subscriptions.read().map_err(|_| "ロック取得失敗")?;
        
        for sub_info in subscriptions.values() {
            // 状態タイプが一致するサブスクリプションにのみ通知
            if sub_info.state_type == event.state_type {
                (sub_info.callback)(event.clone());
            }
        }
        
        Ok(())
    }
}
```

### 4.2 購読管理の実装

```rust
impl SimpleStateController for SimpleStateControllerImpl {
    fn subscribe(&self, state_type: &str, callback: Box<dyn Fn(StateEvent) + Send + Sync>) -> Result<String, String> {
        let subscription_id = Uuid::new_v4().to_string();
        
        let subscription = SubscriptionInfo {
            id: subscription_id.clone(),
            state_type: state_type.to_string(),
            callback,
        };
        
        let mut subscriptions = self.subscriptions.write().map_err(|_| "ロック取得失敗")?;
        subscriptions.insert(subscription_id.clone(), subscription);
        
        Ok(subscription_id)
    }

    fn unsubscribe(&self, subscription_id: &str) -> Result<(), String> {
        let mut subscriptions = self.subscriptions.write().map_err(|_| "ロック取得失敗")?;
        
        if subscriptions.remove(subscription_id).is_none() {
            return Err(format!("サブスクリプションが見つかりません: {}", subscription_id));
        }
        
        Ok(())
    }
}
```

### 4.3 Tauriイベントリスナーのセットアップ

アプリケーション起動時に、フロントエンドからの更新要求をリッスンするイベントリスナーをセットアップします。

```rust
// lib.rs または適切なモジュールで
/// アプリケーション起動時にSimpleStateControllerとイベントリスナーをセットアップ
fn setup_state_controller(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // StateControllerの初期化
    let state_controller = SimpleStateControllerImpl::new(app.handle());
    
    // アプリステートとして登録
    app.manage(Arc::new(state_controller));
    
    // フロントエンドからの更新リクエストをリッスン
    setup_frontend_listeners(app)?;
    
    Ok(())
}

/// フロントエンドからの状態更新リクエストをリッスンするセットアップ
fn setup_frontend_listeners(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    
    // 状態更新リクエストのリスナー
    app.listen("frontend-state-update", move |event| {
        if let Some(state_controller) = app_handle.state::<Arc<SimpleStateControllerImpl>>() {
            if let Some(payload) = event.payload() {
                // ペイロードをパース
                let update_request: Result<StateUpdateRequest, _> = serde_json::from_str(payload);
                
                match update_request {
                    Ok(request) => {
                        // 状態更新を実行
                        let context = StateContext {
                            timestamp: SimpleStateControllerImpl::now_timestamp(),
                            operation_type: request.operation_type,
                            transaction_id: None,
                            metadata: request.metadata,
                        };
                        
                        // 新しい実装では、状態オブジェクトの生成はフロントエンドからの
                        // 要求データに基づいて行います
                        if let Err(e) = process_frontend_update(&state_controller, context, &request) {
                            // エラーをフロントエンドに通知
                            let _ = app_handle.emit_all("state-update-error", StateUpdateError {
                                request_id: request.request_id,
                                error: e,
                            });
                        }
                    },
                    Err(e) => {
                        let _ = app_handle.emit_all("state-update-error", StateUpdateError {
                            request_id: "unknown".to_string(),
                            error: format!("無効な更新リクエスト: {}", e),
                        });
                    }
                }
            }
        }
    });
    
    // 他のリスナーも同様に設定...
    
    Ok(())
}

/// フロントエンドからの状態更新リクエスト
#[derive(Deserialize)]
struct StateUpdateRequest {
    request_id: String,
    state_id: String,
    state_type: String,
    operation_type: StateOperationType,
    data: Value,
    metadata: HashMap<String, Value>,
}

/// 状態更新エラー
#[derive(Serialize)]
struct StateUpdateError {
    request_id: String,
    error: String,
}

/// フロントエンドからの更新リクエストを処理
fn process_frontend_update(
    state_controller: &SimpleStateControllerImpl,
    context: StateContext,
    request: &StateUpdateRequest
) -> Result<(), String> {
    // 状態タイプに応じて適切な処理を行う
    match request.state_type.as_str() {
        "user" => {
            // ユーザー状態の更新
            let user_data: UserState = serde_json::from_value(request.data.clone())
                .map_err(|e| format!("無効なユーザーデータ: {}", e))?;
                
            // 新しい状態オブジェクト作成
            let state = Box::new(user_data);
            
            // 状態を更新
            state_controller.update_state(context, state)
        },
        "resource" => {
            // リソース状態の更新
            let resource_data: ResourceState = serde_json::from_value(request.data.clone())
                .map_err(|e| format!("無効なリソースデータ: {}", e))?;
                
            // 新しい状態オブジェクト作成
            let state = Box::new(resource_data);
            
            // 状態を更新
            state_controller.update_state(context, state)
        },
        _ => Err(format!("未知の状態タイプ: {}", request.state_type)),
    }
}
```

### 4.4 フロントエンドでの状態管理連携

フロントエンド（Reactなど）と状態管理システムを連携する方法を示します。

```typescript
// フロントエンド側の実装例（TypeScript）
import { listen, emit } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';

// 状態更新リクエストを送信する関数
export async function updateState<T>(
  stateType: string, 
  stateId: string, 
  data: T, 
  operationType: 'Create' | 'Update' | 'Delete' = 'Update'
): Promise<void> {
  const requestId = uuidv4();
  
  // 更新リクエストを送信
  await emit('frontend-state-update', {
    request_id: requestId,
    state_id: stateId,
    state_type: stateType,
    operation_type: operationType,
    data,
    metadata: {
      client_timestamp: Date.now(),
      user_initiated: true
    }
  });
  
  // 更新結果を待機
  return new Promise((resolve, reject) => {
    // 成功イベントのリスナー
    const successUnlisten = listen<any>(`state-id-${stateId}-updated`, () => {
      // クリーンアップして解決
      successUnlisten.then(fn => fn());
      errorUnlisten.then(fn => fn());
      resolve();
    });
    
    // エラーイベントのリスナー
    const errorUnlisten = listen<any>('state-update-error', (event) => {
      if (event.payload.request_id === requestId) {
        // クリーンアップして拒否
        successUnlisten.then(fn => fn());
        errorUnlisten.then(fn => fn());
        reject(new Error(event.payload.error));
      }
    });
    
    // タイムアウト処理
    setTimeout(() => {
      successUnlisten.then(fn => fn());
      errorUnlisten.then(fn => fn());
      reject(new Error('状態更新のタイムアウト'));
    }, 5000);
  });
}

// 状態変更を購読するフック
export function useStateSubscription<T>(
  stateType: string, 
  callback: (data: T) => void
) {
  React.useEffect(() => {
    // 状態変更イベントを購読
    const unlisten = listen<any>(`state-${stateType}-updated`, (event) => {
      // バックエンドから来た状態データをコールバックに渡す
      callback(event.payload.data);
    });
    
    // クリーンアップ関数
    return () => {
      unlisten.then(fn => fn());
    };
  }, [stateType, callback]);
}

// 具体的な状態管理フック例（ユーザー情報）
export function useUserState(userId: string) {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  
  // 初回読み込み
  React.useEffect(() => {
    async function loadUser() {
      try {
        // バックエンドから状態を取得（例: カスタムTauri APIを使用）
        const userData = await invoke<any>('get_state', { id: userId, stateType: 'user' });
        setUser(userData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    }
    
    loadUser();
  }, [userId]);
  
  // 状態変更の購読
  useStateSubscription<any>('user', (updatedUser) => {
    // 自分が関心を持つユーザーの場合のみ更新
    if (updatedUser.id === userId) {
      setUser(updatedUser);
    }
  });
  
  // 状態更新メソッド
  const updateUser = React.useCallback(async (data: Partial<any>) => {
    try {
      // 既存のデータと更新データをマージ
      const updatedData = { ...user, ...data };
      
      // バックエンドに更新要求
      await updateState('user', userId, updatedData);
      
      // ローカル状態の更新はuseStateSubscriptionで自動的に行われる
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [user, userId]);
  
  return { user, loading, error, updateUser };
}
```

## 5. Error Handling

### 5.1 エラー型

```rust
/// 状態管理に関するエラーを表す列挙型
#[derive(Debug, Serialize, Deserialize)]
pub enum StateControllerError {
    /// ロックエラー
    LockError(String),
    /// トランザクションエラー
    TransactionError(String),
    /// 状態エラー
    StateError(String),
    /// シリアライズエラー
    SerializationError(String),
    /// イベントエラー
    EventError(String),
}

impl From<StateControllerError> for String {
    fn from(error: StateControllerError) -> Self {
        match error {
            StateControllerError::LockError(msg) => format!("ロックエラー: {}", msg),
            StateControllerError::TransactionError(msg) => format!("トランザクションエラー: {}", msg),
            StateControllerError::StateError(msg) => format!("状態エラー: {}", msg),
            StateControllerError::SerializationError(msg) => format!("シリアライズエラー: {}", msg),
            StateControllerError::EventError(msg) => format!("イベントエラー: {}", msg),
        }
    }
}
```

### 5.2 エラー回復戦略

```rust
impl SimpleStateControllerImpl {
    /// エラー発生時にトランザクションをロールバック
    fn handle_transaction_error(&self, transaction_id: &str, error: &str) -> Result<(), String> {
        println!("トランザクションエラー: {} (ID: {})", error, transaction_id);
        
        // エラーイベントを発火
        self.app_handle
            .emit_all("state-transaction-error", json!({
                "transaction_id": transaction_id,
                "error": error
            }))
            .map_err(|e| format!("エラーイベント発火失敗: {}", e))?;
            
        // トランザクションをロールバック
        self.rollback_transaction(
            StateContext {
                timestamp: Self::now_timestamp(),
                operation_type: StateOperationType::Update,
                transaction_id: None,
                metadata: HashMap::new(),
            },
            transaction_id
        )
    }
    
    /// 無効な状態の処理
    fn handle_invalid_state(&self, state_id: &str, error: &str) -> Result<(), String> {
        println!("無効な状態: {} (ID: {})", error, state_id);
        
        // 無効状態イベントを発火
        let event = StateEvent {
            context: StateContext {
                timestamp: Self::now_timestamp(),
                operation_type: StateOperationType::Validate,
                transaction_id: None,
                metadata: HashMap::new(),
            },
            state_id: state_id.to_string(),
            state_type: "unknown".to_string(), // または適切な型
            event_type: StateEventType::Invalid,
        };
        
        self.emit_state_event(&event)?;
        
        Ok(())
    }
}
```

## 6. フロントエンド統合の詳細

この節では、フロントエンド（特にReact）でStateControllerを活用するためのパターンをより詳細に説明します。

### 6.1 React Context Providerによる統合

フロントエンドのアプリケーション全体に状態管理を提供する方法としてContext Providerパターンを示します。

```tsx
// StateProvider.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { v4 as uuidv4 } from 'uuid';

// 状態コンテキスト
interface StateContextType {
  // 状態取得
  getState: <T>(stateId: string, stateType: string) => Promise<T | null>;
  
  // 状態更新
  updateState: <T>(stateType: string, stateId: string, data: T) => Promise<void>;
  
  // 状態削除
  deleteState: (stateType: string, stateId: string) => Promise<void>;
  
  // トランザクション
  beginTransaction: () => Promise<string>;
  commitTransaction: (transactionId: string) => Promise<void>;
  rollbackTransaction: (transactionId: string) => Promise<void>;
  
  // 購読
  subscribeToState: <T>(
    stateType: string, 
    callback: (event: { stateId: string, data: T }) => void
  ) => () => void;
}

// コンテキスト作成
const StateContext = createContext<StateContextType | null>(null);

// StateProvider コンポーネント
export function StateProvider({ children }: { children: React.ReactNode }) {
  // 現在のトランザクションID
  const [pendingTransactions, setPendingTransactions] = useState<string[]>([]);
  
  // 状態取得
  const getState = useCallback(async <T,>(stateId: string, stateType: string): Promise<T | null> => {
    try {
      return await invoke<T | null>('get_state', { id: stateId, stateType });
    } catch (err) {
      console.error(`状態取得エラー (${stateType}/${stateId}):`, err);
      return null;
    }
  }, []);
  
  // 状態更新
  const updateState = useCallback(async <T,>(
    stateType: string, 
    stateId: string, 
    data: T
  ): Promise<void> => {
    const requestId = uuidv4();
    
    // 更新リクエストを送信
    await emit('frontend-state-update', {
      request_id: requestId,
      state_id: stateId,
      state_type: stateType,
      operation_type: 'Update',
      data,
      metadata: {
        client_timestamp: Date.now(),
        user_initiated: true
      }
    });
    
    // 更新結果を待機
    return new Promise((resolve, reject) => {
      // 成功イベントのリスナー
      const successUnlisten = listen<any>(`state-id-${stateId}-updated`, () => {
        // クリーンアップして解決
        successUnlisten.then(fn => fn());
        errorUnlisten.then(fn => fn());
        resolve();
      });
      
      // エラーイベントのリスナー
      const errorUnlisten = listen<any>('state-update-error', (event) => {
        if (event.payload.request_id === requestId) {
          // クリーンアップして拒否
          successUnlisten.then(fn => fn());
          errorUnlisten.then(fn => fn());
          reject(new Error(event.payload.error));
        }
      });
      
      // タイムアウト処理
      setTimeout(() => {
        successUnlisten.then(fn => fn());
        errorUnlisten.then(fn => fn());
        reject(new Error('状態更新のタイムアウト'));
      }, 5000);
    });
  }, []);
  
  // 状態削除
  const deleteState = useCallback(async (
    stateType: string, 
    stateId: string
  ): Promise<void> => {
    const requestId = uuidv4();
    
    // 削除リクエストを送信
    await emit('frontend-state-delete', {
      request_id: requestId,
      state_id: stateId,
      state_type: stateType,
      metadata: {
        client_timestamp: Date.now(),
        user_initiated: true
      }
    });
    
    // 削除結果を待機
    return new Promise((resolve, reject) => {
      // 成功イベントのリスナー
      const successUnlisten = listen<any>(`state-id-${stateId}-deleted`, () => {
        // クリーンアップして解決
        successUnlisten.then(fn => fn());
        errorUnlisten.then(fn => fn());
        resolve();
      });
      
      // エラーイベントのリスナー
      const errorUnlisten = listen<any>('state-delete-error', (event) => {
        if (event.payload.request_id === requestId) {
          // クリーンアップして拒否
          successUnlisten.then(fn => fn());
          errorUnlisten.then(fn => fn());
          reject(new Error(event.payload.error));
        }
      });
      
      // タイムアウト処理
      setTimeout(() => {
        successUnlisten.then(fn => fn());
        errorUnlisten.then(fn => fn());
        reject(new Error('状態削除のタイムアウト'));
      }, 5000);
    });
  }, []);
  
  // トランザクション開始
  const beginTransaction = useCallback(async (): Promise<string> => {
    try {
      const transactionId = await invoke<string>('begin_transaction');
      setPendingTransactions(prev => [...prev, transactionId]);
      return transactionId;
    } catch (err) {
      console.error('トランザクション開始エラー:', err);
      throw err;
    }
  }, []);
  
  // トランザクションコミット
  const commitTransaction = useCallback(async (transactionId: string): Promise<void> => {
    try {
      await invoke<void>('commit_transaction', { id: transactionId });
      setPendingTransactions(prev => prev.filter(id => id !== transactionId));
    } catch (err) {
      console.error(`トランザクションコミットエラー (${transactionId}):`, err);
      throw err;
    }
  }, []);
  
  // トランザクションロールバック
  const rollbackTransaction = useCallback(async (transactionId: string): Promise<void> => {
    try {
      await invoke<void>('rollback_transaction', { id: transactionId });
      setPendingTransactions(prev => prev.filter(id => id !== transactionId));
    } catch (err) {
      console.error(`トランザクションロールバックエラー (${transactionId}):`, err);
      throw err;
    }
  }, []);
  
  // 状態購読
  const subscribeToState = useCallback(<T,>(
    stateType: string,
    callback: (event: { stateId: string, data: T }) => void
  ): (() => void) => {
    // 更新イベントの購読
    const updatePromise = listen<any>(`state-${stateType}-updated`, (event) => {
      callback({
        stateId: event.payload.state_id,
        data: event.payload.data
      });
    });
    
    // クリーンアップ関数
    return () => {
      updatePromise.then(unlisten => unlisten());
    };
  }, []);
  
  // 未完了トランザクションのクリーンアップ
  useEffect(() => {
    return () => {
      // コンポーネントのアンマウント時に未完了のトランザクションをロールバック
      pendingTransactions.forEach(id => {
        invoke('rollback_transaction', { id })
          .catch(err => console.error(`自動ロールバックエラー (${id}):`, err));
      });
    };
  }, [pendingTransactions]);
  
  // コンテキスト値を作成
  const contextValue: StateContextType = {
    getState,
    updateState,
    deleteState,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
    subscribeToState,
  };
  
  return (
    <StateContext.Provider value={contextValue}>
      {children}
    </StateContext.Provider>
  );
}

// カスタムフック
export function useStateController() {
  const context = useContext(StateContext);
  
  if (!context) {
    throw new Error('useStateController must be used within a StateProvider');
  }
  
  return context;
}
```

### 6.2 カスタム状態フックの例

特定の状態タイプ（例：リソース設定）を管理するためのカスタムフックを示します。

```tsx
// useResourceConfig.tsx
import { useState, useEffect, useCallback } from 'react';
import { useStateController } from './StateProvider';

// リソース設定の型
interface ResourceConfig {
  id: string;
  name: string;
  filters: {
    include: string[];
    exclude: string[];
  };
}

// リソース設定フック
export function useResourceConfig() {
  const { getState, updateState, subscribeToState } = useStateController();
  const [config, setConfig] = useState<ResourceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // 初回読み込み
  useEffect(() => {
    async function loadConfig() {
      try {
        const configData = await getState<ResourceConfig>('resource_config', 'ResourceConfig');
        setConfig(configData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    }
    
    loadConfig();
  }, [getState]);
  
  // 変更の購読
  useEffect(() => {
    const unsubscribe = subscribeToState<ResourceConfig>('ResourceConfig', (event) => {
      if (event.stateId === 'resource_config') {
        setConfig(event.data);
      }
    });
    
    return unsubscribe;
  }, [subscribeToState]);
  
  // フォルダパスの追加
  const addIncludePath = useCallback(async (path: string) => {
    if (!config) return;
    
    try {
      // 既存の設定をコピーして更新
      const updatedConfig = { 
        ...config,
        filters: {
          ...config.filters,
          include: [...config.filters.include, path]
        }
      };
      
      // バックエンドに更新要求
      await updateState<ResourceConfig>('ResourceConfig', 'resource_config', updatedConfig);
      
      // 注: 実際の状態更新は購読を通じて自動的に行われる
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [config, updateState]);
  
  // フォルダパスの削除
  const removeIncludePath = useCallback(async (path: string) => {
    if (!config) return;
    
    try {
      // 既存の設定をコピーして更新
      const updatedConfig = { 
        ...config,
        filters: {
          ...config.filters,
          include: config.filters.include.filter(p => p !== path)
        }
      };
      
      // バックエンドに更新要求
      await updateState<ResourceConfig>('ResourceConfig', 'resource_config', updatedConfig);
      
      // 注: 実際の状態更新は購読を通じて自動的に行われる
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [config, updateState]);
  
  return {
    config,
    loading,
    error,
    addIncludePath,
    removeIncludePath
  };
}
```

### 6.3 コンポーネントでの使用例

状態フックをコンポーネントで使用する例を示します。

```tsx
// ResourceConfigComponent.tsx
import React, { useState } from 'react';
import { useResourceConfig } from './useResourceConfig';
import { open } from '@tauri-apps/api/dialog';

export function ResourceConfigComponent() {
  const { config, loading, error, addIncludePath, removeIncludePath } = useResourceConfig();
  const [inputPath, setInputPath] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // フォルダ選択ダイアログ
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "リソースフォルダを選択"
      });
      
      if (selected && typeof selected === 'string') {
        setInputPath(selected);
      }
    } catch (err) {
      console.error('フォルダ選択エラー:', err);
    }
  };
  
  // パス追加
  const handleAddPath = async () => {
    if (!inputPath.trim()) return;
    
    setIsProcessing(true);
    try {
      await addIncludePath(inputPath);
      setInputPath('');
    } catch (err) {
      console.error('パス追加エラー:', err);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // パス削除
  const handleRemovePath = async (path: string) => {
    setIsProcessing(true);
    try {
      await removeIncludePath(path);
    } catch (err) {
      console.error('パス削除エラー:', err);
    } finally {
      setIsProcessing(false);
    }
  };
  
  if (loading) {
    return <div>設定を読み込み中...</div>;
  }
  
  if (error) {
    return <div className="error">エラー: {error.message}</div>;
  }
  
  if (!config) {
    return <div>設定が見つかりません</div>;
  }
  
  return (
    <div className="resource-config">
      <h2>リソース設定</h2>
      
      <div className="config-form">
        <div className="input-group">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            placeholder="フォルダパスを入力"
            disabled={isProcessing}
          />
          <button onClick={handleSelectFolder} disabled={isProcessing}>
            参照...
          </button>
          <button onClick={handleAddPath} disabled={isProcessing || !inputPath.trim()}>
            追加
          </button>
        </div>
      </div>
      
      <div className="path-list">
        <h3>フォルダパス一覧</h3>
        {config.filters.include.length === 0 ? (
          <p>フォルダが設定されていません</p>
        ) : (
          <ul>
            {config.filters.include.map((path, index) => (
              <li key={index}>
                <span>{path}</span>
                <button
                  onClick={() => handleRemovePath(path)}
                  disabled={isProcessing}
                  className="remove-btn"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

### 6.4 アプリケーションでの統合例

アプリケーションのエントリーポイントで状態管理システムを統合します。

```tsx
// App.tsx
import React from 'react';
import { StateProvider } from './StateProvider';
import { ResourceConfigComponent } from './ResourceConfigComponent';
import { ImageViewerComponent } from './ImageViewerComponent'; // 仮実装

function App() {
  return (
    <StateProvider>
      <div className="app-container">
        <h1>Poir Viewer</h1>
        
        {/* 設定コンポーネント */}
        <ResourceConfigComponent />
        
        {/* 画像ビューアコンポーネント */}
        <ImageViewerComponent />
      </div>
    </StateProvider>
  );
}

export default App;
```

## 7. Performance Considerations

### 7.1 キャッシュと最適化

```rust
impl SimpleStateControllerImpl {
    /// キャッシュヒント付き状態取得
    pub fn get_state_with_cache<T: State + DeserializeOwned>(&self, 
                                                           id: &str, 
                                                           use_cache: bool) -> Result<Option<T>, String> {
        // フロントエンドキャッシュを優先
        if use_cache {
            // キャッシュイベントの発火
            self.app_handle.emit_all(&format!("state-cache-check-{}", id), id)
                .map_err(|e| format!("キャッシュチェックエラー: {}", e))?;
                
            // キャッシュレスポンスを待つ実装（簡略化のため省略）
        }
        
        // バックエンドから状態取得
        self.get_state(id)
    }
    
    /// バッチ操作の最適化
    pub fn batch_update(&self, 
                       context: StateContext, 
                       states: Vec<Box<dyn State>>) -> Result<(), String> {
        // トランザクションの開始
        let transaction_id = self.begin_transaction(context.clone())?;
        let context_with_tx = StateContext {
            transaction_id: Some(transaction_id.clone()),
            ..context
        };
        
        // すべての状態を更新
        for state in states {
            if let Err(e) = self.update_state(context_with_tx.clone(), state) {
                // エラー発生時はトランザクションをロールバックして終了
                self.rollback_transaction(context.clone(), &transaction_id)?;
                return Err(e);
            }
        }
        
        // 成功した場合はコミット
        self.commit_transaction(context, &transaction_id)
    }
}
```

### 7.2 イベント最適化

イベント発火の最適化戦略を実装します。

```rust
impl SimpleStateControllerImpl {
    /// イベント発火の最適化
    fn optimize_event_emission(&self, events: Vec<StateEvent>) -> Result<(), String> {
        // 同一タイプのイベントをグループ化
        let mut grouped_events: HashMap<String, Vec<StateEvent>> = HashMap::new();
        
        for event in events {
            let key = format!("{}-{}", event.state_type, event.event_type.as_str());
            grouped_events.entry(key).or_insert_with(Vec::new).push(event);
        }
        
        // バッチ処理で発火
        for (channel, events) in grouped_events {
            // 10個以上のイベントはバッチ処理
            if events.len() >= 10 {
                let batch_channel = format!("{}-batch", channel);
                self.app_handle.emit_all(&batch_channel, events)
                    .map_err(|e| format!("バッチイベント発火エラー: {}", e))?;
            } else {
                // 少数のイベントは個別に発火
                for event in events {
                    self.emit_state_event(&event)?;
                }
            }
        }
        
        Ok(())
    }
    
    /// イベントレート制限
    fn apply_event_rate_limiting(&self, event: &StateEvent) -> bool {
        // イベントタイプに応じてレート制限を適用
        match event.event_type {
            // 重要なイベントはレート制限なし
            StateEventType::Created | StateEventType::Deleted => true,
            
            // 頻繁に発生するイベントはレート制限を適用
            StateEventType::Updated => {
                // 例: 同じ状態に対する更新イベントを制限（実装は省略）
                true // 実際には適切なレート制限ロジックを実装
            },
            
            // その他のイベント
            _ => true,
        }
    }
}
```

## 8. Future Enhancements

### 8.1 将来の拡張

1. **永続化と同期**
   - 状態の永続化機能
   - リモートバックエンドとの同期

```rust
/// 将来の拡張 - 状態の永続化
pub trait StatePersistence: Send + Sync {
    /// 状態を永続化
    fn persist_state(&self, state: &dyn State) -> Result<(), String>;
    
    /// 永続化された状態を読み込み
    fn load_state(&self, state_id: &str, state_type: &str) -> Result<Box<dyn State>, String>;
    
    /// 状態の存在を確認
    fn state_exists(&self, state_id: &str) -> Result<bool, String>;
    
    /// 永続化された状態を削除
    fn delete_state(&self, state_id: &str) -> Result<(), String>;
}

/// ファイルベースの永続化実装
pub struct FilePersistence {
    storage_dir: PathBuf,
    deserializer_registry: Arc<StateDeserializerRegistry>,
}

impl FilePersistence {
    pub fn new(storage_dir: PathBuf, deserializer_registry: Arc<StateDeserializerRegistry>) -> Self {
        FilePersistence {
            storage_dir,
            deserializer_registry,
        }
    }
    
    /// 状態のファイルパスを取得
    fn get_state_path(&self, state_id: &str, state_type: &str) -> PathBuf {
        let filename = format!("{}_{}.json", state_type, state_id);
        self.storage_dir.join(filename)
    }
}

impl StatePersistence for FilePersistence {
    fn persist_state(&self, state: &dyn State) -> Result<(), String> {
        let path = self.get_state_path(&state.state_id(), &state.state_type());
        
        // 状態をシリアライズ
        let json = state.serialize()?;
        
        // ファイルに書き込み
        fs::write(&path, json)
            .map_err(|e| format!("状態の永続化に失敗: {}", e))?;
            
        Ok(())
    }
    
    fn load_state(&self, state_id: &str, state_type: &str) -> Result<Box<dyn State>, String> {
        let path = self.get_state_path(state_id, state_type);
        
        // ファイルが存在するか確認
        if !path.exists() {
            return Err(format!("状態ファイルが見つかりません: {}", path.display()));
        }
        
        // ファイルを読み込み
        let json = fs::read_to_string(&path)
            .map_err(|e| format!("状態ファイルの読み込みに失敗: {}", e))?;
            
        // 状態型に基づいてデシリアライズ
        let state_type_obj = StateType::new(state_type);
        self.deserializer_registry.deserialize(&state_type_obj, &json)
            .map_err(|e| format!("状態のデシリアライズに失敗: {}", e))
    }
    
    fn state_exists(&self, state_id: &str, state_type: &str) -> Result<bool, String> {
        let path = self.get_state_path(state_id, state_type);
        Ok(path.exists())
    }
    
    fn delete_state(&self, state_id: &str, state_type: &str) -> Result<(), String> {
        let path = self.get_state_path(state_id, state_type);
        
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("状態ファイルの削除に失敗: {}", e))?;
        }
        
        Ok(())
    }
}
```

2. **競合解決**
   - 複数クライアント間の競合解決メカニズム
   - マージ戦略の改善

```rust
/// 将来の拡張 - 競合解決
pub trait StateConflictResolver: Send + Sync {
    /// 競合する状態をマージ
    fn resolve_conflict(&self, 
                       local: &dyn State, 
                       remote: &dyn State, 
                       base: Option<&dyn State>) -> Result<Box<dyn State>, String>;
}

/// 最終更新優先の競合解決戦略
pub struct LastWriteWinsResolver;

impl StateConflictResolver for LastWriteWinsResolver {
    fn resolve_conflict(&self, 
                       local: &dyn State, 
                       remote: &dyn State, 
                       _base: Option<&dyn State>) -> Result<Box<dyn State>, String> {
        // タイムスタンプに基づいて最新の状態を選択
        if remote.timestamp() > local.timestamp() {
            // リモート状態が新しい
            if let Some(cloned) = remote.clone_state() {
                Ok(cloned)
            } else {
                Err("リモート状態のクローンに失敗".to_string())
            }
        } else {
            // ローカル状態が新しい
            if let Some(cloned) = local.clone_state() {
                Ok(cloned)
            } else {
                Err("ローカル状態のクローンに失敗".to_string())
            }
        }
    }
}
```

3. **設定と拡張性**
   - プラグイン形式の状態処理拡張
   - カスタムシリアライザーのサポート

```rust
/// 将来の拡張 - プラグイン拡張
pub trait StateControllerPlugin: Send + Sync {
    /// プラグインの名前
    fn name(&self) -> &str;
    
    /// プラグインの初期化
    fn initialize(&mut self, controller: Arc<dyn SimpleStateController>) -> Result<(), String>;
    
    /// 状態更新前のフック
    fn before_update(&self, 
                    context: &StateContext, 
                    state: &dyn State) -> Result<(), String>;
    
    /// 状態更新後のフック
    fn after_update(&self, 
                   context: &StateContext, 
                   state: &dyn State) -> Result<(), String>;
    
    /// プラグインのクリーンアップ
    fn cleanup(&mut self) -> Result<(), String>;
}

/// プラグイン対応のStateController拡張
pub struct PluggableStateController {
    inner: Arc<dyn SimpleStateController>,
    plugins: Vec<Box<dyn StateControllerPlugin>>,
}

impl PluggableStateController {
    pub fn new(inner: Arc<dyn SimpleStateController>) -> Self {
        PluggableStateController {
            inner,
            plugins: Vec::new(),
        }
    }
    
    /// プラグインを追加
    pub fn add_plugin(&mut self, mut plugin: Box<dyn StateControllerPlugin>) -> Result<(), String> {
        plugin.initialize(self.inner.clone())?;
        self.plugins.push(plugin);
        Ok(())
    }
    
    /// すべてのプラグインをクリーンアップ
    pub fn cleanup_plugins(&mut self) -> Result<(), String> {
        for plugin in &mut self.plugins {
            if let Err(e) = plugin.cleanup() {
                eprintln!("プラグイン {} のクリーンアップに失敗: {}", plugin.name(), e);
            }
        }
        
        Ok(())
    }
}

impl SimpleStateController for PluggableStateController {
    fn update_state(&self, context: StateContext, state: Box<dyn State>) -> Result<(), String> {
        // 更新前のプラグインフック
        for plugin in &self.plugins {
            if let Err(e) = plugin.before_update(&context, state.as_ref()) {
                return Err(format!("プラグイン {} の前処理に失敗: {}", plugin.name(), e));
            }
        }
        
        // 実際の更新処理
        self.inner.update_state(context.clone(), state.clone())?;
        
        // 更新後のプラグインフック
        for plugin in &self.plugins {
            if let Err(e) = plugin.after_update(&context, state.as_ref()) {
                eprintln!("プラグイン {} の後処理に失敗: {}", plugin.name(), e);
            }
        }
        
        Ok(())
    }
    
    // 他のメソッドも同様に委譲...
    
    // 例としてget_stateの実装
    fn get_state<T: State + DeserializeOwned>(&self, id: &str) -> Result<Option<T>, String> {
        self.inner.get_state(id)
    }
    
    // 他のメソッドの実装は省略...
}
```

### 8.2 研究領域

1. **最適な状態分割**
   - 効率的な状態粒度の特定
   - コンテキスト特化型の状態管理

2. **パフォーマンス最適化**
   - 差分ベースの更新戦略
   - ストリーミング状態の効率的処理

3. **セキュリティとアクセス制御**
   - 状態に対する細かなアクセス権限管理
   - 監査ログと変更履歴

```rust
/// 研究領域 - 差分ベースの状態更新
pub struct DiffBasedStateController {
    inner: Arc<dyn SimpleStateController>,
    diff_processor: DiffProcessor,
}

impl DiffBasedStateController {
    pub fn new(inner: Arc<dyn SimpleStateController>) -> Self {
        DiffBasedStateController {
            inner,
            diff_processor: DiffProcessor::new(),
        }
    }
}

/// 差分処理エンジン
pub struct DiffProcessor {
    cache: LruCache<String, String>,
}

impl DiffProcessor {
    pub fn new() -> Self {
        DiffProcessor {
            cache: LruCache::new(100),
        }
    }
    
    /// JSONの差分を計算
    pub fn compute_diff(&self, before: &str, after: &str) -> Result<Value, String> {
        // JSON Patchライブラリを使用して差分を計算（簡略化）
        let before_value: Value = serde_json::from_str(before)
            .map_err(|e| format!("JSONパースエラー: {}", e))?;
            
        let after_value: Value = serde_json::from_str(after)
            .map_err(|e| format!("JSONパースエラー: {}", e))?;
            
        // 差分計算（実際の実装では適切なJSONパッチライブラリを使用）
        let diff = json!({
            "operations": [
                { "type": "example", "path": "/exampleField", "value": "newValue" }
            ]
        });
        
        Ok(diff)
    }
    
    /// パッチを適用
    pub fn apply_patch(&self, original: &str, patch: &Value) -> Result<String, String> {
        // パッチを適用（簡略化）
        // 実際の実装では適切なJSONパッチライブラリを使用
        Err("未実装".to_string())
    }
}

impl SimpleStateController for DiffBasedStateController {
    fn update_state(&self, context: StateContext, state: Box<dyn State>) -> Result<(), String> {
        let state_id = state.state_id();
        
        // 以前の状態を取得
        let previous = self.inner.get_state::<Box<dyn State>>(&state_id)?;
        
        if let Some(prev_state) = previous {
            // 差分に基づく更新
            let prev_json = prev_state.serialize()?;
            let new_json = state.serialize()?;
            
            // 差分を計算
            let diff = self.diff_processor.compute_diff(&prev_json, &new_json)?;
            
            // メタデータに差分情報を追加
            let mut metadata = context.metadata.clone();
            metadata.insert("diff".to_string(), diff);
            
            // 更新コンテキストを作成
            let diff_context = StateContext {
                metadata,
                ..context
            };
            
            // 実際の更新
            self.inner.update_state(diff_context, state)
        } else {
            // 新規状態は通常通り更新
            self.inner.update_state(context, state)
        }
    }
    
    // 他のメソッドは内部コントローラに委譲
    fn get_state<T: State + DeserializeOwned>(&self, id: &str) -> Result<Option<T>, String> {
        self.inner.get_state(id)
    }
    
    // 他のメソッドの実装は省略...
}
```

## 9. Integration with Existing Code

既存のpoir-viewerコードとの統合方法を示します。

### 9.1 段階的な統合パターン

```rust
// ResourceConfigの移行アダプタ
pub struct ResourceConfigAdapter {
    state_controller: Arc<dyn SimpleStateController>,
}

impl ResourceConfigAdapter {
    pub fn new(state_controller: Arc<dyn SimpleStateController>) -> Self {
        ResourceConfigAdapter { state_controller }
    }
    
    // 既存の関数をラップして状態管理システムを使用
    pub fn load(&self, app_handle: &AppHandle) -> Result<ResourceConfig, String> {
        // 状態管理システムから設定を取得
        match self.state_controller.get_state::<ResourceConfigState>("resource_config") {
            Ok(Some(state)) => Ok(state.config),
            Ok(None) => {
                // 存在しない場合は従来の方法でロード
                let config = ResourceConfig::load(app_handle)?;
                
                // 状態管理システムに保存
                self.save(app_handle, config.clone())?;
                
                Ok(config)
            },
            Err(e) => Err(e),
        }
    }
    
    pub fn save(&self, app_handle: &AppHandle, config: ResourceConfig) -> Result<(), String> {
        // 状態管理システムに保存
        let state = ResourceConfigState {
            id: "resource_config".to_string(),
            version: SimpleStateControllerImpl::now_timestamp(),
            config: config.clone(),
        };
        
        let context = StateContext {
            timestamp: SimpleStateControllerImpl::now_timestamp(),
            operation_type: StateOperationType::Update,
            transaction_id: None,
            metadata: HashMap::new(),
        };
        
        // 状態を更新
        self.state_controller.update_state(context, Box::new(state))?;
        
        // 既存の方法でも保存（移行期間中）
        config.save(app_handle)
    }
}

// ResourceConfigの状態表現
#[derive(Clone, Serialize, Deserialize)]
pub struct ResourceConfigState {
    pub id: String,
    pub version: u64,
    pub config: ResourceConfig,
}

impl State for ResourceConfigState {
    fn state_id(&self) -> String {
        self.id.clone()
    }
    
    fn state_type(&self) -> String {
        "ResourceConfig".to_string()
    }
    
    fn version(&self) -> u64 {
        self.version
    }
    
    fn validate(&self) -> Result<(), String> {
        // 基本的な検証
        if self.id.is_empty() {
            return Err("ID が空です".to_string());
        }
        
        // 設定内容の検証
        if self.config.filters.include.is_empty() {
            return Err("フィルタが空です".to_string());
        }
        
        Ok(())
    }
    
    fn serialize(&self) -> Result<String, String> {
        serde_json::to_string(self)
            .map_err(|e| format!("シリアライズエラー: {}", e))
    }
    
    fn apply_changes(&mut self, changes: StateChanges) -> Result<(), String> {
        // 変更を適用
        for change in &changes.changes {
            if let Some(json) = &change.after {
                match serde_json::from_str::<ResourceConfigState>(json) {
                    Ok(updated) => {
                        self.version = updated.version;
                        self.config = updated.config;
                    },
                    Err(e) => return Err(format!("状態の解析に失敗: {}", e)),
                }
            }
        }
        
        Ok(())
    }
}
```

### 9.2 アプリケーションへの統合

```rust
// main.rs または lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // StateControllerをセットアップ
            let state_controller = Arc::new(SimpleStateControllerImpl::new(app.handle()));
            
            // アプリステートとして登録
            app.manage(state_controller.clone());
            
            // ResourceConfigアダプタを登録
            let config_adapter = ResourceConfigAdapter::new(state_controller);
            app.manage(config_adapter);
            
            // イベントリスナーをセットアップ
            setup_frontend_listeners(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 既存のハンドラ
            greet,
            read_file_content,
            
            // 状態管理のハンドラを追加
            get_state,
            begin_transaction,
            commit_transaction,
            rollback_transaction,
            
            // 従来のリソース管理ハンドラ（アダプタ経由）
            load_resource_config,
            save_resource_config,
            validate_resource_path,
            
            // 画像関連ハンドラ
            get_image_list,
            validate_image_path,
            get_paginated_images,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 新しい状態管理ハンドラ
#[tauri::command]
async fn get_state(app_handle: AppHandle, id: String, state_type: String) -> Result<Value, String> {
    let state_controller = app_handle.state::<Arc<SimpleStateControllerImpl>>();
    
    if let Some(controller) = state_controller {
        // 状態タイプに応じた取得処理
        match state_type.as_str() {
            "ResourceConfig" => {
                let state = controller.get_state::<ResourceConfigState>(&id)?;
                
                if let Some(config_state) = state {
                    // 設定データをJSONに変換して返す
                    let json = serde_json::to_value(config_state.config)
                        .map_err(|e| format!("JSONシリアライズエラー: {}", e))?;
                    
                    Ok(json)
                } else {
                    Ok(Value::Null)
                }
            },
            // 他の状態タイプも同様に処理
            _ => Err(format!("未対応の状態タイプ: {}", state_type)),
        }
    } else {
        Err("状態コントローラが見つかりません".to_string())
    }
}

// 従来のリソース設定ハンドラ（アダプタ経由）
#[tauri::command]
async fn load_resource_config(app_handle: AppHandle) -> Result<ResourceConfig, String> {
    let adapter = app_handle.state::<ResourceConfigAdapter>();
    
    if let Some(adapter) = adapter {
        adapter.load(&app_handle)
    } else {
        // フォールバック: 従来の方法で直接ロード
        ResourceConfig::load(&app_handle)
    }
}
```
