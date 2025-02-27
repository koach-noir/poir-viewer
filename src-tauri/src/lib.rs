// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 実際のファイルパスを確認するコマンド
#[tauri::command]
async fn check_paths() -> String {
    use std::path::Path;
    use std::env;
    
    // 現在の作業ディレクトリを取得
    let current_dir = match env::current_dir() {
        Ok(dir) => format!("Current directory: {:?}", dir),
        Err(e) => format!("Failed to get current directory: {}", e),
    };
    
    // WSLパスを確認
    let wsl_path = Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\wsluser\.claude.json");
    let wsl_exists = if wsl_path.exists() {
        "WSL path exists"
    } else {
        "WSL path does not exist"
    };
    
    format!("{}\nWSL path check: {}", current_dir, wsl_exists)
}

// 開発用にローカルのテストファイルを読み込む
#[tauri::command]
async fn read_test_file() -> Result<String, String> {
    use std::fs;
    use std::env;
    
    // ローカルファイルパスの例（開発環境に合わせて変更）
    let test_path = match env::current_dir() {
        Ok(mut dir) => {
            dir.push("test-claude.json"); // プロジェクトルートに配置したテストファイル
            dir
        },
        Err(e) => return Err(format!("Failed to get current directory: {}", e)),
    };
    
    // ファイルを読み込む
    match fs::read_to_string(test_path) {
        Ok(content) => Ok(content),
        Err(e) => {
            // エラーの詳細を返す
            Err(format!("Failed to read test file: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, check_paths, read_test_file])
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
