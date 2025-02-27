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