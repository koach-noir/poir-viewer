# ViewportController Detailed Design Specification

## 1. Overview

ViewportControllerは、poir-viewerアプリケーションにおける表示領域の管理と制御を担当する核心コンポーネントです。

### 1.1 Core Responsibilities
- 表示領域のサイズ、スケール、位置の管理
- ズーム、パン、回転などの表示操作の制御
- レイアウト最適化
- デバイス解像度への適応
- パフォーマンス監視と最適化

### 1.2 Design Principles
- 柔軟性
- 即応性
- パフォーマンス効率
- デバイス適応性
- 最小限の状態管理

## 2. Core Interface Definitions

```rust
// 必要なインポート
use std::sync::atomic::{AtomicBool, Ordering};
use chrono::{DateTime, Utc};
```

### 2.1 基本型定義

```rust
/// デバイス情報
pub struct DeviceInfo {
    pub screen_width: u32,
    pub screen_height: u32,
    pub pixel_density: f32,
    pub device_type: DeviceType,
}

/// デバイスタイプ
pub enum DeviceType {
    Desktop,
    Mobile,
    Tablet,
    Other(String),
}

/// 表示モード
pub enum DisplayMode {
    Normal,
    Fullscreen,
    Presentation,
    Custom(String),
}

/// スケーリングモード
pub enum ScalingMode {
    Fit,
    Fill,
    Stretch,
    Crop,
    Custom(f32),
}

/// 回転方向
pub enum RotationAngle {
    Degrees0,
    Degrees90,
    Degrees180,
    Degrees270,
}

/// 表示領域情報
pub struct ViewportInfo {
    pub width: u32,
    pub height: u32,
    pub scale: f32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub rotation: RotationAngle,
    pub mode: DisplayMode,
    pub scaling: ScalingMode,
}

/// パフォーマンスモニタリング情報
pub struct ViewportPerformance {
    pub fps: f32,
    pub render_time_ms: f32,
    pub memory_usage: u64,
}
```

### 2.2 イベントと状態

```rust
/// ビューポート変更イベント
pub struct ViewportChangeEvent {
    pub previous: ViewportInfo,
    pub current: ViewportInfo,
    pub timestamp: DateTime<Utc>,
}

/// イベントカテゴリ
pub enum EventCategory {
    Viewport,
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

/// ビューポートイベントの種類
pub enum ViewportEventType {
    Resized,
    Scaled,
    Moved,
    Rotated,
    ModeChanged,
    PerformanceUpdate,
}
```

### 2.3 コアインターフェース

```rust
/// ビューポート管理のコアインターフェース
pub trait ViewportController {
    /// 現在のビューポート情報を取得
    fn get_current_viewport(&self) -> ViewportInfo;
    
    /// ビューポートのサイズを設定
    fn set_size(&mut self, width: u32, height: u32) -> Result<(), ViewportError>;
    
    /// ズーム操作
    fn zoom(&mut self, factor: f32) -> Result<(), ViewportError>;
    
    /// パン（移動）操作
    fn pan(&mut self, delta_x: f32, delta_y: f32) -> Result<(), ViewportError>;
    
    /// 回転操作
    fn rotate(&mut self, angle: RotationAngle) -> Result<(), ViewportError>;
    
    /// 表示モードの変更
    fn set_display_mode(&mut self, mode: DisplayMode) -> Result<(), ViewportError>;
    
    /// スケーリングモードの変更
    fn set_scaling_mode(&mut self, mode: ScalingMode) -> Result<(), ViewportError>;
    
    /// デバイス情報の更新
    fn update_device_info(&mut self, device_info: DeviceInfo) -> Result<(), ViewportError>;
    
    /// パフォーマンス情報の取得
    fn get_performance(&self) -> ViewportPerformance;
    
    /// パフォーマンス最適化
    fn optimize_performance(&mut self) -> Result<(), ViewportError>;
}

/// ビューポート変更オブザーバー
pub trait ViewportObserver {
    fn on_viewport_change(&mut self, event: &ViewportChangeEvent);
}
```

### 2.4 関連データ型

```rust
/// ビューポート制約
pub struct ViewportConstraints {
    pub min_scale: f32,
    pub max_scale: f32,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub min_width: Option<u32>,
    pub min_height: Option<u32>,
}

/// パフォーマンス最適化オプション
pub struct PerformanceOptimizationOptions {
    pub target_fps: f32,
    pub memory_threshold: u64,
    pub quality_level: QualityLevel,
}

/// 画質レベル
pub enum QualityLevel {
    Low,
    Medium,
    High,
    Ultra,
}
```

### 2.5 エラー型

```rust
/// ビューポート関連のエラー
pub enum ViewportError {
    ResizeError(String),
    ZoomError(String),
    PanError(String),
    RotationError(String),
    PerformanceError(String),
    DeviceConfigError(String),
    Other(String),
}

impl std::fmt::Display for ViewportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ViewportError::ResizeError(msg) => write!(f, "サイズ変更エラー: {}", msg),
            ViewportError::ZoomError(msg) => write!(f, "ズームエラー: {}", msg),
            ViewportError::PanError(msg) => write!(f, "移動エラー: {}", msg),
            ViewportError::RotationError(msg) => write!(f, "回転エラー: {}", msg),
            ViewportError::PerformanceError(msg) => write!(f, "パフォーマンスエラー: {}", msg),
            ViewportError::DeviceConfigError(msg) => write!(f, "デバイス設定エラー: {}", msg),
            ViewportError::Other(msg) => write!(f, "不明なエラー: {}", msg),
        }
    }
}

impl std::error::Error for ViewportError {}
```
