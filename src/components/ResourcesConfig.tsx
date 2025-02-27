import { useState, useEffect, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// 設定ファイルの型定義
interface ResourceConfig {
  id: string;
  name: string;
  filters: {
    include: string[];
    exclude: string[];
  };
}

// 初期設定
const defaultConfig: ResourceConfig = {
  id: "allviewer-resources",
  name: "AllViewer画像リソース",
  filters: {
    include: [],
    exclude: []
  }
};

export function ResourcesConfig() {
  // 状態管理
  const [config, setConfig] = useState<ResourceConfig>(defaultConfig);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [pathStatus, setPathStatus] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isConfigValid, setIsConfigValid] = useState<boolean>(false);
  
  // 直接パス入力のための状態
  const [inputPath, setInputPath] = useState<string>("");
  const [isInputPathValid, setIsInputPathValid] = useState<boolean>(true);
  const [inputPathError, setInputPathError] = useState<string>("");

  // 初期ロード
  useEffect(() => {
    loadConfig();
  }, []);

  // 設定の有効性チェックを依存関係として追加
  useEffect(() => {
    validateConfig();
  }, [config]);

  // 設定ファイルをロードする
  async function loadConfig() {
    try {
      setLoading(true);
      setError("");
      
      // バックエンドから設定をロード
      const loadedConfig = await invoke<ResourceConfig>("load_resource_config");
      setConfig(loadedConfig);
      
      // 設定の有効性をチェック
      validateConfig(loadedConfig);
    } catch (err) {
      setError(`設定ファイルのロードに失敗しました: ${err}`);
      console.error("Config load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // 設定の有効性をチェック
  async function validateConfig(configToValidate?: ResourceConfig) {
    const configToCheck = configToValidate || config;
    try {
      if (configToCheck.filters.include.length === 0) {
        setPathStatus("リソースフォルダが設定されていません。");
        setIsConfigValid(false);
        return;
      }

      // すべてのパスを検証
      const results = await Promise.all(
        configToCheck.filters.include.map(path => 
          invoke<boolean>("validate_resource_path", { path })
        )
      );

      const isValid = results.every(result => result === true);
      setIsConfigValid(isValid);
      
      if (isValid) {
        setPathStatus("有効なリソースフォルダが設定されています。");
      } else {
        setPathStatus("一部のフォルダにアクセスできません。");
      }
    } catch (err) {
      setError(`設定の検証に失敗しました: ${err}`);
      setIsConfigValid(false);
    }
  }

  // フォルダ選択ダイアログを表示
  async function handleSelectFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "リソースフォルダを選択"
      });

      if (selected && typeof selected === "string") {
        addPath(selected);
      }
    } catch (err) {
      setError(`フォルダの選択に失敗しました: ${err}`);
    }
  }

  // 入力パスの検証
  async function validateInputPath(path: string): Promise<boolean> {
    if (!path.trim()) {
      setInputPathError("パスを入力してください");
      setIsInputPathValid(false);
      return false;
    }

    try {
      const isValid = await invoke<boolean>("validate_resource_path", { path });
      setIsInputPathValid(isValid);
      
      if (!isValid) {
        setInputPathError("無効なパスです。読み取り可能なディレクトリを指定してください。");
      } else {
        setInputPathError("");
      }
      
      return isValid;
    } catch (err) {
      setInputPathError(`パスの検証中にエラーが発生しました: ${err}`);
      setIsInputPathValid(false);
      return false;
    }
  }

  // 入力パスの変更ハンドラ
  async function handleInputPathChange(e: React.ChangeEvent<HTMLInputElement>) {
    const path = e.target.value;
    setInputPath(path);
    
    // 入力が空の場合はエラーをクリア
    if (!path.trim()) {
      setInputPathError("");
      setIsInputPathValid(true);
      return;
    }
    
    // 短いディレイを入れて、ユーザーが入力を完了するまで検証を遅らせる
    setTimeout(() => {
      validateInputPath(path);
    }, 500);
  }

  // フォームのサブミットハンドラ
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inputPath.trim()) return;
    
    const isValid = await validateInputPath(inputPath);
    if (isValid) {
      addPath(inputPath);
      setInputPath(""); // 入力をクリア
    }
  }

  // パスを追加する共通関数
  async function addPath(path: string) {
    // 既に存在するパスなら何もしない
    if (config.filters.include.includes(path)) {
      setError("このパスは既に追加されています。");
      return;
    }

    // 選択したパスを検証
    const isValid = await invoke<boolean>("validate_resource_path", { path });
    
    if (isValid) {
      // 設定を更新
      const updatedConfig = {
        ...config,
        filters: {
          ...config.filters,
          include: [...config.filters.include, path]
        }
      };
      
      setConfig(updatedConfig);
      
      // 更新された設定を保存
      await saveConfig(updatedConfig);
    } else {
      setError("選択したフォルダは無効です。");
    }
  }

  // パスを削除
  function handleRemovePath(pathToRemove: string) {
    const updatedConfig = {
      ...config,
      filters: {
        ...config.filters,
        include: config.filters.include.filter(path => path !== pathToRemove)
      }
    };
    
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
  }

  // 設定を保存
  async function saveConfig(configToSave?: ResourceConfig) {
    try {
      setIsSaving(true);
      setError("");
      
      const configToUpdate = configToSave || config;
      
      // バックエンドに保存
      await invoke("save_resource_config", { config: configToUpdate });
      
      setPathStatus("設定を保存しました。");
    } catch (err) {
      setError(`設定の保存に失敗しました: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }

  // サポート関数：パスを短く表示
  function getDisplayPath(path: string): string {
    const maxLength = 50;
    if (path.length <= maxLength) return path;
    
    // パスの先頭と末尾を表示し、中間を省略
    const start = path.substring(0, 20);
    const end = path.substring(path.length - 27);
    return `${start}...${end}`;
  }

  return (
    <div className="resource-config">
      <h2>リソース設定</h2>
      
      {loading ? (
        <p>設定を読み込み中...</p>
      ) : (
        <>
          <div className="config-status">
            <div className={`status-indicator ${isConfigValid ? 'valid' : 'invalid'}`}>
              {isConfigValid ? '✓' : '⚠'}
            </div>
            <span>{pathStatus}</span>
          </div>
          
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={() => setError("")}>閉じる</button>
            </div>
          )}
          
          <div className="resource-folders">
            <h3>リソースフォルダ</h3>
            
            {/* 新しいパス入力フォーム */}
            <form onSubmit={handleSubmit} className="path-input-form">
              <div className="input-group">
                <label htmlFor="path-input">フォルダパス:</label>
                <div className="path-input-container">
                  <input
                    id="path-input"
                    type="text"
                    value={inputPath}
                    onChange={handleInputPathChange}
                    placeholder="パスを入力または選択してください"
                    className={!isInputPathValid ? "invalid" : ""}
                  />
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    disabled={isSaving}
                    className="browse-button"
                  >
                    参照...
                  </button>
                </div>
              </div>
              
              {inputPathError && (
                <div className="input-error">{inputPathError}</div>
              )}
              
              <button 
                type="submit"
                disabled={isSaving || !isInputPathValid || !inputPath.trim()}
                className="add-path-button"
              >
                追加
              </button>
            </form>
            
            {config.filters.include.length === 0 ? (
              <p>リソースフォルダが設定されていません。上のフォームからフォルダを追加してください。</p>
            ) : (
              <ul className="folder-list">
                {config.filters.include.map((path, index) => (
                  <li key={index} className="folder-item">
                    <span title={path}>{getDisplayPath(path)}</span>
                    <button 
                      onClick={() => handleRemovePath(path)}
                      disabled={isSaving}
                      className="remove-btn"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
            
            <div className="actions">
              <button 
                onClick={() => saveConfig()} 
                disabled={isSaving || config.filters.include.length === 0}
                className="save-btn"
              >
                設定を保存
              </button>
            </div>
          </div>
        </>
      )}
      
      <style>{`
        .resource-config {
          padding: 1rem;
          border-radius: 8px;
          background-color: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          margin-bottom: 1rem;
        }
        
        .config-status {
          display: flex;
          align-items: center;
          margin-bottom: 1rem;
          padding: 0.5rem;
          border-radius: 4px;
          background-color: #f5f5f5;
        }
        
        .status-indicator {
          display: inline-flex;
          justify-content: center;
          align-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          margin-right: 0.5rem;
          font-weight: bold;
        }
        
        .valid {
          background-color: #4caf50;
          color: white;
        }
        
        .invalid {
          background-color: #ff9800;
          color: white;
        }
        
        .error-message {
          padding: 0.5rem;
          border-radius: 4px;
          background-color: #ffebee;
          color: #d32f2f;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .path-input-form {
          margin-bottom: 1.5rem;
          background-color: #f9f9f9;
          padding: 1rem;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
        }
        
        .input-group {
          margin-bottom: 0.5rem;
        }
        
        .path-input-container {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        
        label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 500;
        }
        
        input[type="text"] {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 1rem;
        }
        
        input[type="text"].invalid {
          border-color: #f44336;
        }
        
        .input-error {
          color: #f44336;
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
        }
        
        .browse-button {
          white-space: nowrap;
          padding: 0.5rem 1rem;
          background-color: #f5f5f5;
          border: 1px solid #ccc;
        }
        
        .add-path-button {
          padding: 0.5rem 1rem;
          background-color: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
        }
        
        .folder-list {
          list-style: none;
          padding: 0;
          margin: 0 0 1rem 0;
        }
        
        .folder-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          border-radius: 4px;
          background-color: #f5f5f5;
          margin-bottom: 0.5rem;
        }
        
        .actions {
          display: flex;
          gap: 0.5rem;
        }
        
        button {
          border-radius: 4px;
          border: none;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .save-btn {
          background-color: #4caf50;
          color: white;
        }
        
        .remove-btn {
          background-color: #f44336;
          color: white;
          padding: 0.25rem 0.5rem;
          font-size: 0.8rem;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        button:hover:not(:disabled) {
          opacity: 0.9;
        }
        
        @media (prefers-color-scheme: dark) {
          .resource-config {
            background-color: #333;
            color: #f5f5f5;
          }
          
          .config-status, .folder-item {
            background-color: #444;
            color: #f5f5f5;
          }
          
          .error-message {
            background-color: #4a1c1c;
            color: #ffcdd2;
          }
          
          .path-input-form {
            background-color: #3a3a3a;
            border-color: #555;
          }
          
          input[type="text"] {
            background-color: #444;
            color: #fff;
            border-color: #555;
          }
          
          .browse-button {
            background-color: #555;
            color: #fff;
            border-color: #666;
          }
        }
      `}</style>
    </div>
  );
}

export default ResourcesConfig;