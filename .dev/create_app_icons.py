from PIL import Image, ImageDraw, ImageFont
import os
import subprocess

def create_app_icons(base_image_path, output_dir):
    # 具体的なファイル名と対応するサイズの辞書
    icon_sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,  # 2x means double the resolution
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 175,  # Typical store logo size
    }
    
    # 出力ディレクトリの作成
    os.makedirs(output_dir, exist_ok=True)
    
    # ベース画像の読み込み
    base_image = Image.open(base_image_path)
    
    # 各サイズのアイコンを生成
    for filename, size in icon_sizes.items():
        # リサイズ
        icon = base_image.copy()
        icon = icon.resize((size, size), Image.Resampling.LANCZOS)
        
        # 出力パス
        output_path = os.path.join(output_dir, filename)
        
        # 保存
        icon.save(output_path)
        print(f"Generated: {filename}")
    
    # macOS用 .icns ファイルの生成
    icns_sizes = [16, 32, 64, 128, 256, 512, 1024]
    icns_images = []
    
    for size in icns_sizes:
        icon = base_image.copy()
        icon = icon.resize((size, size), Image.Resampling.LANCZOS)
        icns_images.append(icon)
    
    # .icnsファイルの保存
    with tempfile.TemporaryDirectory() as tmpdir:
        for i, img in enumerate(icns_images):
            img.save(os.path.join(tmpdir, f'icon_{icns_sizes[i]}.png'))
        
        icns_path = os.path.join(output_dir, 'icon.icns')
        
        try:
            # macOSのiconutilを使用
            subprocess.run([
                'iconutil', '-c', 'icns', 
                tmpdir, 
                '-o', icns_path
            ], check=True)
            print("Generated: icon.icns")
        except Exception as e:
            print(f"Could not generate .icns file: {e}")
    
    # Windows .ico ファイルの生成
    ico_sizes = [16, 32, 48, 64, 128]
    ico_images = []
    
    for size in ico_sizes:
        icon = base_image.copy()
        icon = icon.resize((size, size), Image.Resampling.LANCZOS)
        ico_images.append(icon)
    
    ico_path = os.path.join(output_dir, 'icon.ico')
    ico_images[0].save(
        ico_path, 
        format='ICO', 
        sizes=[(img.width, img.height) for img in ico_images]
    )
    print("Generated: icon.ico")

# メイン実行部分
if __name__ == "__main__":
    import tempfile
    
    # ベース画像のパスを指定（適切なパスに変更してください）
    base_image_path = "src-tauri/icons/icon.png"
    
    # 出力ディレクトリを指定（プロジェクトのicons ディレクトリなど）
    output_dir = "src-tauri/icons"
    
    # アイコン生成関数を呼び出し
    create_app_icons(base_image_path, output_dir)

# 注意: 以下のライブラリが必要です
# pip install Pillow
