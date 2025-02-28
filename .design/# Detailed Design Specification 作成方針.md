# Detailed Design Specification 作成方針

## [背景] 前回プロジェクト(image-viewer)と現在のpoir-viewerの分析

poir-viewer プロジェクトのまえに失敗したプロジェクトがあります。

### 前回プロジェクトの設計(Detailed Design Specification)レビュー

image-viewer プロジェクト
 
> # DDS CellBehavior.md
> # DDS DisplayCore.md
> # DDS DisplayInterface.md
> # DDS DisplayManager.md
> # DDS EventBus.md
> # DDS GridViewer.md
> # DDS LayoutStrategy.md
> # DDS ResourceManager.md
> # DDS StateController.md
> # DDS ViewportManagement.md

失敗の理由はTauri v2の理解不足からくる設計から実装へとうまく運べなかったことです。
前回の設計は非常に体系的で、エンタープライズレベルのアプリケーションに適した洗練されたアーキテクチャを目指していたことがわかります。

#### 主要コンポーネントと設計思想

1. **StateController**
   - アプリケーション全体の状態管理を担う中核
   - トランザクショナルな状態更新と永続化
   - 型安全性とスレッドセーフを重視した設計

2. **EventBus**
   - イベント配信の中央管理システム
   - 優先度付けされたイベント処理
   - コンポーネント間の疎結合を実現

3. **ResourceManager**
   - 4スレッドモデルによる高度なリソース管理
   - キャッシュとメモリ最適化
   - リソースライフサイクルの一元管理

4. **Display関連コンポーネント群**
   - DisplayCore/Interface/Manager による階層的な表示制御
   - 表示最適化とパフォーマンス監視
   - ViewportManagement による表示領域制御

5. **GridViewer/LayoutStrategy**
   - 柔軟なグリッドベースのレイアウト管理
   - 効率的なセル管理とレンダリング

#### 設計の強みと課題

**強み**:
- 堅牢なエラー処理と回復メカニズム
- スケーラブルで拡張性の高いアーキテクチャ
- パフォーマンスを意識した最適化設計

**課題**:
- Tauri v2との統合モデルの不一致
- 実装の複雑さとオーバーヘッド
- フロントエンド・バックエンドの責務分担が不明確

### 現在のpoir-viewerの進捗評価

現在のpoir-viewerは、より実用的でTauri v2の特性を活かした実装になっています：

- **シンプルで機能的**:
  - 基本的な画像閲覧機能の実装
  - 設定管理と画像リソース読み込みの分離
  - Tauriのイベントシステムの適切な活用

- **フロントエンド・バックエンド分担**:
  - React: UI表示とユーザー操作
  - Rust: ファイルシステム操作とリソース管理

- **段階的な開発アプローチ**:
  - 基本機能から始め、徐々に機能拡張

### 前回の設計思想の踏襲に関する提案

現在のpoir-viewerに前回の設計思想を取り入れるにあたり、以下の提案をします：

#### 取り入れるべき要素

1. **簡略化したStateController**
   - Tauriのイベントシステムを基盤とした状態管理
   - トランザクション機能を簡略化した設計
   - フロントエンドの状態管理と連携しやすい形で実装

```rust
// 簡略化したStateController例
pub struct SimpleStateController {
    app_handle: AppHandle,
    states: RwLock<HashMap<String, Box<dyn State>>>,
}

impl SimpleStateController {
    pub fn update_state(&self, state_id: &str, state: Box<dyn State>) -> Result<(), String> {
        // 状態を更新
        {
            let mut states = self.states.write().map_err(|_| "ロック取得失敗")?;
            states.insert(state_id.to_string(), state);
        }
        
        // イベント通知
        self.app_handle.emit_all(&format!("state-changed-{}", state_id), ()).map_err(|e| e.to_string())?;
        
        Ok(())
    }
}
```

2. **最適化されたリソース管理**
   - 画像リソースの効率的な読み込みと解放
   - キャッシュ戦略を導入したメモリ管理
   - 4スレッドモデルよりシンプルな設計

```rust
// リソース管理の例
pub struct ImageResourceManager {
    cache: RwLock<LruCache<String, Arc<ImageData>>>,
    image_loader: ImageLoader,
}

impl ImageResourceManager {
    pub fn get_image(&self, path: &str) -> Result<Arc<ImageData>, String> {
        // キャッシュチェック
        if let Some(image) = self.check_cache(path) {
            return Ok(image);
        }
        
        // 画像を読み込んでキャッシュに保存
        let image_data = self.image_loader.load_image(path)?;
        let image_arc = Arc::new(image_data);
        self.update_cache(path, image_arc.clone());
        
        Ok(image_arc)
    }
}
```

3. **イベント管理の最適化**
   - Tauriのイベントシステムを活用した実装
   - コンポーネント間の通信を明確化

```rust
// イベント管理の例
pub fn setup_event_handlers(app: &mut App) -> Result<(), String> {
    // 画像読み込み完了イベント
    app.listen("image-load-request", |event| {
        let path = event.payload().unwrap_or_default();
        // 画像読み込み処理
        // ...
        app.emit_all("image-loaded", path).unwrap();
    });
    
    Ok(())
}
```

#### 段階的な導入戦略

1. **コアコンポーネントから**:
   - まず画像リソース管理の最適化から始める
   - キャッシュ戦略を導入してパフォーマンス向上

2. **状態管理強化**:
   - 次に簡略化したStateControllerを導入
   - 段階的に機能を拡張

3. **レイアウト戦略**:
   - 様々な表示モードを支援するレイアウト戦略
   - 大量の画像もスムーズに表示できる最適化

### 結論

前回の設計思想は非常に優れていますが、Tauri v2の特性に合わせた簡略化と最適化が必要です。現在のpoir-viewerはすでに良い基盤ができており、この基盤の上に前回の設計思想の良い部分を段階的に取り入れることが可能です。

特に以下の点に注力することをお勧めします：

1. **Tauriの特性を最大限活用**したコンポーネント設計
2. **フロントエンドとバックエンドの責務を明確に分離**した実装
3. **段階的な機能強化**によるリスク軽減
4. **必要最小限の複雑さ**でパフォーマンスとユーザー体験を向上

このアプローチにより、前回の失敗を教訓としながら、より堅牢で拡張性の高い画像ビューアアプリケーションを構築できるでしょう。

## poir-viewer Detailed Design Specification 作成方針

### 作成すべきDDSドキュメント

- 現在のpoir-viewerを基盤とした設計ドキュメントの構成を提案します：

#### コアコンポーネント

1. **SimpleStateController DDS**
   - 簡略化された状態管理
   - Tauriイベントシステムとの統合
   - トランザクション機能の最小実装

2. **ImageResourceManager DDS**
   - 効率的な画像リソースの管理
   - キャッシング戦略
   - メモリ最適化

3. **TauriEventManager DDS**
   - Tauriイベントシステムのラッパー
   - コンポーネント間通信の標準化
   - エラーハンドリング戦略

4. **ViewportController DDS**
   - 表示領域の管理
   - スケーリングとパフォーマンス最適化
   - ユーザー操作への応答

#### インターフェース

1. **StateInterface DDS**
   - 状態の基本定義
   - 型安全な状態オブジェクト
   - シリアライズ・デシリアライズ

2. **ResourceLoaderInterface DDS**
   - リソース読み込みの抽象化
   - 非同期処理のサポート
   - エラー処理パターン

3. **LayoutStrategyInterface DDS**
   - 様々な表示モードの抽象化
   - レイアウトアルゴリズムの差し替え
   - レスポンシブ対応

### DDSドキュメントの構成

各DDSは以下の構成で作成することを提案します：

```
## コンポーネント名 Detailed Design Specification

### 1. Overview
- 概要説明
- 主要な責務
- 設計原則

### 2. Core Interface Definitions
- インターフェース定義
- 主要なデータ構造
- 型定義

### 3. Implementation Guidelines
- 実装のガイドライン
- 具体的な実装例
- Tauriとの連携方法

### 4. Error Handling
- エラー処理戦略
- エラー回復メカニズム

### 5. Performance Considerations
- パフォーマンス最適化ポイント
- メモリ管理戦略

### 6. Integration with Existing Code
- 現在のpoir-viewerとの統合方法
- 段階的な導入ステップ

### 7. Future Enhancements
- 今後拡張可能な機能
- 将来の研究領域
```

### 特に重視すべきポイント

1. **簡素化と実用性**
   - 前回のDDSよりもシンプルで実装しやすい設計
   - 理論的完璧さよりも実用性を重視

2. **Tauriの特性の活用**
   - Tauri v2のイベントシステム、パーミッション、プラグインの活用
   - WebViewとRustバックエンドの適切な責務分担

3. **段階的導入の道筋**
   - 各コンポーネントの優先順位と依存関係
   - 既存コードとの連携方法

4. **具体的な実装例**
   - より実装に近いコード例を含める
   - 実現可能性を重視した設計

### 今後の作業に向けた推奨事項

DDSを作成する際に、以下の点を考慮することをお勧めします：

1. **簡潔さと実用性のバランス**
   - 核となる設計概念を明確にし、詳細な実装例は必要最小限に留める
   - poir-viewerの具体的なニーズに焦点を当てた例を優先する

2. **段階的導入パス**
   - 各コンポーネントを段階的に導入できる具体的な方法を提示する
   - 既存のコードベースとの統合方法をより具体的に示す

3. **コンポーネント間の関係**
   - 各DDSコンポーネント間の依存関係や連携方法を明確に図示する
   - インターフェースを通じた疎結合設計を維持する

4. **実装の優先順位**
   - 最初に実装すべきコアコンポーネントと、後で追加できる拡張機能を明確に区別する
   - MVPとして必要最小限の機能セットを定義する

これらの点を考慮することで、残りのDDSがより実装しやすく、poir-viewerの具体的なニーズに適した設計になるでしょう。


このアプローチにより、前回の設計思想の良い部分を活かしながらも、より実装に寄り添った道しるべとなる設計資料を作成できると考えます。
