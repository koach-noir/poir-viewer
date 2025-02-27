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
  const [pathInfo, setPathInfo] = useState<string>("");

  // アプリ起動時に自動的にテストを実行
  useEffect(() => {
    checkPaths();
    loadTestFile();
  }, []);

  async function checkPaths() {
    try {
      // パス情報を確認
      const paths = await invoke<string>("check_paths");
      setPathInfo(paths);
    } catch (error) {
      console.error("Error checking paths:", error);
      setPathInfo(`Error: ${error}`);
    }
  }

  async function loadTestFile() {
    try {
      // テストファイルを読み込む
      const content = await invoke<string>("read_test_file");
      setFileContent(content);
      setLoadError("");
    } catch (error) {
      console.error("Error loading test file:", error);
      setLoadError(String(error));
    }
  }

  async function greet() {
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
        <button onClick={loadTestFile}>Load Test File</button>
        <button onClick={checkPaths}>Check Paths</button>
        
        {pathInfo && (
          <div>
            <h3>Path Information:</h3>
            <pre>{pathInfo}</pre>
          </div>
        )}
        
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
