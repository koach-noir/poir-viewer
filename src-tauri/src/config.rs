use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// resources.jsonの内容を表す構造体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResourceConfig {
    pub id: String,
    pub name: String,
    pub filters: Filters,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Filters {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}

impl Default for ResourceConfig {
    fn default() -> Self {
        Self {
            id: "allviewer-resources".to_string(),
            name: "AllViewer画像リソース".to_string(),
            filters: Filters {
                include: Vec::new(),
                exclude: Vec::new(),
            },
        }
    }
}

impl ResourceConfig {
    // 設定ファイルのパスを取得
    pub fn get_config_path(app_handle: &AppHandle) -> PathBuf {
        let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| {
            // アプリディレクトリが取得できない場合は実行ファイルのディレクトリを使用
            let exe_dir = std::env::current_exe()
                .unwrap_or_default()
                .parent()
                .unwrap_or(Path::new("."))
                .to_path_buf();
            exe_dir
        });
        app_dir.join("resources.json")
    }

    // 設定ファイルの存在確認、なければデフォルト作成
    pub fn ensure_config_exists(app_handle: &AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle);
        
        // ディレクトリが存在するか確認し、存在しない場合は作成する
        if let Some(parent_dir) = config_path.parent() {
            if !parent_dir.exists() {
                fs::create_dir_all(parent_dir)
                    .map_err(|e| format!("ディレクトリの作成に失敗 ({}): {}", parent_dir.display(), e))?;
                println!("アプリディレクトリを作成しました: {}", parent_dir.display());
            }
        }
        
        if !config_path.exists() {
            let default_config = Self::default();
            let config_json = serde_json::to_string_pretty(&default_config)
                .map_err(|e| format!("デフォルト設定のシリアライズに失敗: {}", e))?;
            
            fs::write(&config_path, config_json)
                .map_err(|e| format!("設定ファイルの作成に失敗 ({}): {}", config_path.display(), e))?;
            
            println!("デフォルト設定ファイルを作成しました: {}", config_path.display());
        }
        
        Ok(())
    }

    // 設定ファイルを読み込む
    pub fn load(app_handle: &AppHandle) -> Result<Self, String> {
        Self::ensure_config_exists(app_handle)?;
        
        let config_path = Self::get_config_path(app_handle);
        let config_str = fs::read_to_string(&config_path)
            .map_err(|e| format!("設定ファイルの読み込みに失敗: {}", e))?;
            
        let config: ResourceConfig = serde_json::from_str(&config_str)
            .map_err(|e| format!("JSONのパースに失敗: {}", e))?;
            
        Ok(config)
    }

    // 設定ファイルを保存する
    pub fn save(&self, app_handle: &AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle);
        let config_json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("設定のシリアライズに失敗: {}", e))?;
            
        fs::write(&config_path, config_json)
            .map_err(|e| format!("設定ファイルの保存に失敗: {}", e))?;
            
        Ok(())
    }

    // パスの有効性チェック
    pub fn validate_path(path: &str) -> Result<(), String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("パスが存在しません: {}", path.display()));
        }
        
        if !path.is_dir() {
            return Err(format!("パスはディレクトリではありません: {}", path.display()));
        }
        
        // 読み取り権限チェック (ディレクトリの内容リストを取得してみる)
        match fs::read_dir(path) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("ディレクトリにアクセスできません: {}", e)),
        }
    }

    // // パスを追加する (バリデーション付き)
    // pub fn add_include_path(&mut self, path: String) -> Result<(), String> {
    //     Self::validate_path(&path)?;
        
    //     // 重複チェック
    //     if !self.filters.include.contains(&path) {
    //         self.filters.include.push(path);
    //     }
        
    //     Ok(())
    // }

    // 設定の有効性チェック
    pub fn is_valid(&self) -> bool {
        !self.filters.include.is_empty() && 
        self.filters.include.iter().all(|path| {
            Self::validate_path(path).is_ok()
        })
    }
}