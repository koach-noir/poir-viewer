import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import ResourcesConfig from "./components/ResourcesConfig";
import ImageViewer from "./components/ImageViewer";
import "./App.css";

// ResourceConfigの型定義
interface ResourceConfig {
  id: string;
  name: string;
  filters: {
    include: string[];
    exclude: string[];
  };
}

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [fileContent, setFileContent] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");
  const [showResourceConfig, setShowResourceConfig] = useState(false);
  const [resourceConfig, setResourceConfig] = useState<ResourceConfig | null>(null);
  const [configValid, setConfigValid] = useState<boolean>(false);
  const [showImageViewer, setShowImageViewer] = useState<boolean>(false);
  const [resourcesJsonPath, setResourcesJsonPath] = useState<string>("");
  const [isLoadingPath, setIsLoadingPath] = useState<boolean>(true);

  // アプリ起動時の処理
  useEffect(() => {
    // 設定ファイルパスの取得
    async function fetchConfigPath() {
      try {
        setIsLoadingPath(true);
        // Rust側の関数を呼び出して設定ファイルのパスを取得
        const configPath = await invoke<string>("get_config_path");
        setResourcesJsonPath(configPath);
        console.log("設定ファイルパス:", configPath);
      } catch (error) {
        console.error("設定ファイルパスの取得に失敗:", error);
        setLoadError(`設定ファイルパスの取得に失敗: ${error}`);
      } finally {
        setIsLoadingPath(false);
      }
    }

    // パスを取得してから設定を初期化
    fetchConfigPath().then(() => {
    // 設定の初期化と状態の確認
    initializeConfig();
    });
    
    // Rust側からのイベントリスナーを設定
    const unlisten1 = listen<boolean>("config-status", (event) => {
      setConfigValid(event.payload);
    });
    
    const unlisten2 = listen<boolean>("config-required", (event) => {
      if (event.payload) {
        setShowResourceConfig(true);
      }
    });
    
    const unlisten3 = listen<string>("config-error", (event) => {
      setLoadError(event.payload);
    });
    
    // クリーンアップ時にリスナーを解除
    return () => {
      unlisten1.then(fn => fn());
      unlisten2.then(fn => fn());
      unlisten3.then(fn => fn());
    };
  }, []);

  // 設定の初期化
  async function initializeConfig() {
    try {
      const mainWindow = getCurrentWebviewWindow();
      const config = await invoke<ResourceConfig>("initialize_config", {
        window: mainWindow
      });
      
      setResourceConfig(config);
      
      // 設定が有効であれば設定画面を表示しない
      if (config.filters.include.length > 0) {
        const allValid = await Promise.all(
          config.filters.include.map(path => 
            invoke<boolean>("validate_resource_path", { path })
          )
        ).then(results => results.every(r => r));
        
        setConfigValid(allValid);
        setShowResourceConfig(!allValid);
        
        // 設定が有効であれば画像ビューアを表示する
        setShowImageViewer(allValid);
      } else {
        setConfigValid(false);
        setShowResourceConfig(true);
        setShowImageViewer(false);
      }
      
      // 設定ファイルパスが取得できていれば読み込み処理を実行
      if (resourcesJsonPath) {
      loadClaudeJson();
      }
    } catch (error) {
      console.error("設定の初期化に失敗:", error);
      setLoadError(String(error));
      setShowResourceConfig(true);
    }
  }

  async function loadClaudeJson() {
    try {
      if (!resourcesJsonPath) {
        console.warn("設定ファイルパスが未設定です");
        return;
      }

      // 定義したパスをRust側に渡す
      const content = await invoke<string>("read_file_content", { 
        filePath: resourcesJsonPath
      });
      setFileContent(content);
      setLoadError("");
    } catch (error) {
      console.error("Error loading Claude JSON:", error);
      setLoadError(String(error));
    }
  }

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  const handleFileOpen = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });

      if (selected && typeof selected === "string") {
        const content = await readTextFile(selected);
        setFileContent(content);
        setLoadError("");
      }
    } catch (error) {
      console.error("Error has occured when read file: ", error);
      setLoadError(String(error));
    }
  };

  // リソース設定画面の表示・非表示を切り替える
  const toggleResourceConfig = () => {
    setShowResourceConfig(!showResourceConfig);
  };

  // 画像ビューアの表示・非表示を切り替える
  const toggleImageViewer = () => {
    setShowImageViewer(!showImageViewer);
  };

  // リソースフォルダの情報を表示
  const renderResourceInfo = () => {
    if (!resourceConfig || !configValid) {
      return <p>有効なリソースフォルダが設定されていません。</p>;
    }
    
    return (
      <div className="resource-info">
        <h3>リソースフォルダ定義:</h3>
        <p><strong>名前:</strong> {resourceConfig.name}</p>
        <p><strong>フォルダ:</strong></p>
        <ul>
          {resourceConfig.filters.include.map((path, index) => (
            <li key={index}>{path}</li>
          ))}
        </ul>
        <button 
          onClick={toggleImageViewer} 
          className="view-images-button"
        >
          {showImageViewer ? "画像ビューアを閉じる" : "画像ビューアを開く"}
        </button>
      </div>
    );
  };

  return (
    <main className="container">
      <h1>Poir Viewer</h1>
      
      {/* 設定状態バナー */}
      <div className={`config-banner ${configValid ? 'valid' : 'invalid'}`}>
        <span>
          {isLoadingPath 
            ? "設定ファイルパスを読み込み中..." 
            : configValid 
            ? "✓ リソース設定は有効です" 
            : "⚠ リソース設定が必要です"}
        </span>
        <button onClick={toggleResourceConfig} disabled={isLoadingPath}>
          {showResourceConfig ? "設定を閉じる" : "設定を開く"}
        </button>
      </div>
      
      {/* 設定ファイルパス情報の表示 */}
      {resourcesJsonPath && (
        <div className="path-info">
          <p>設定ファイルのパス: <code>{resourcesJsonPath}</code></p>
        </div>
      )}
      
      {/* リソース設定コンポーネント */}
      {showResourceConfig && <ResourcesConfig />}
      
      {/* リソース情報表示 */}
      {!showResourceConfig && configValid && renderResourceInfo()}
      
      {/* 画像ビューアコンポーネント */}
      {showImageViewer && configValid && (
        <div className="image-viewer-container">
          <ImageViewer resourceConfig={resourceConfig} />
        </div>
      )}
      
      {/* 既存の機能 - 画像ビューアが表示されていない場合のみ表示 */}
      {!showImageViewer && (
        <>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              greet();
            }}
          >
            <input
              id="greet-input"
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Enter a name..."
            />
            <button type="submit">Greet</button>
          </form>
          <p>Hello, {greetMsg}</p>

          <div>
            <button onClick={handleFileOpen}>Select File</button>
            <button onClick={loadClaudeJson} disabled={!resourcesJsonPath || isLoadingPath}>
              Reload Fixed File
            </button>
            
            {loadError && (
              <div style={{ color: "red", marginTop: "10px" }}>
                <h3>エラー:</h3>
                <p>{loadError}</p>
              </div>
            )}
            
            {fileContent && (
              <div>
                <h3>FileContent:</h3>
                <pre>{fileContent}</pre>
              </div>
            )}
          </div>
        </>
      )}
      
      <style>{`
        .config-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
        
        .config-banner.valid {
          background-color: rgba(76, 175, 80, 0.2);
          border: 1px solid #4caf50;
        }
        
        .config-banner.invalid {
          background-color: rgba(255, 152, 0, 0.2);
          border: 1px solid #ff9800;
        }
        
        .path-info {
          background-color: #f5f5f5;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
          font-size: 0.9rem;
        }
        
        .path-info code {
          background-color: #e0e0e0;
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
          font-family: monospace;
          word-break: break-all;
        }
        
        .resource-info {
          background-color: #f5f5f5;
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }
        
        .resource-info ul {
          margin: 0;
          padding-left: 1.5rem;
        }
        
        .view-images-button {
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background-color: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .view-images-button:hover {
          background-color: #1976d2;
        }
        
        .image-viewer-container {
          width: 100%;
          height: calc(100vh - 200px);
          margin-bottom: 1rem;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }
        
        @media (prefers-color-scheme: dark) {
          .config-banner.valid {
            background-color: rgba(76, 175, 80, 0.1);
          }
          
          .config-banner.invalid {
            background-color: rgba(255, 152, 0, 0.1);
          }
          
          .path-info {
            background-color: #333;
          }
          
          .path-info code {
            background-color: #444;
            color: #e0e0e0;
          }
          
          .resource-info {
            background-color: #333;
          }
          
          .image-viewer-container {
            border-color: #444;
          }
        }
      `}</style>
    </main>
  );
}

export default App;
