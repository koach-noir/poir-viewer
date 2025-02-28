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
