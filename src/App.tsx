import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  const [fileContent, setFileContent] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");
  
  // フロントエンド側でClaudeのJSONファイルパスを定義
  const claudeJsonPath = "/home/wsluser/.claude.json";

  // アプリ起動時に自動的にClaudeのJSONファイルを読み込む
  useEffect(() => {
    loadClaudeJson();
  }, []);

  async function loadClaudeJson() {
    try {
      // 定義したパスをRust側に渡す
      const content = await invoke<string>("read_file_content", { 
        filePath: claudeJsonPath
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

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

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
        <button onClick={loadClaudeJson}>Reload Claude JSON</button>
        
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
    </main>
  );
}

export default App;
