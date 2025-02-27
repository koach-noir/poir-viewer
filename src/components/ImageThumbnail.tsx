import React, { useState } from 'react';
import { convertFileSrc } from "@tauri-apps/api/core";

// 画像情報の型定義
export interface ImageInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
  extension: string;
}

interface ImageThumbnailProps {
  image: ImageInfo;
  selected: boolean;
  onClick: (image: ImageInfo) => void;
  size?: 'small' | 'medium' | 'large';
}

/**
 * 画像サムネイルを表示するコンポーネント
 */
export function ImageThumbnail({ image, selected, onClick, size = 'medium' }: ImageThumbnailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 画像のローカルパスをassetプロトコルに変換
  const imageUrl = convertFileSrc(image.path);

  // サイズに応じたスタイル
  const sizeStyles = {
    small: { width: '100px', height: '100px' },
    medium: { width: '150px', height: '150px' },
    large: { width: '200px', height: '200px' },
  };

  // 画像ロード完了時のハンドラ
  const handleImageLoad = () => {
    setLoading(false);
    setError(false);
  };

  // 画像ロードエラー時のハンドラ
  const handleImageError = () => {
    setLoading(false);
    setError(true);
  };

  // ファイル名を短縮表示（長すぎる場合）
  const displayName = () => {
    if (image.name.length > 20) {
      return image.name.substring(0, 17) + '...';
    }
    return image.name;
  };

  // 日付をフォーマット
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  return (
    <div 
      className={`image-thumbnail ${selected ? 'selected' : ''}`}
      onClick={() => onClick(image)}
      title={`${image.name}\n${formatDate(image.modified)}\n${(image.size / 1024).toFixed(1)} KB`}
    >
      <div className="thumbnail-container" style={sizeStyles[size]}>
        {loading && (
          <div className="loading-indicator">
            <span>読み込み中...</span>
          </div>
        )}
        
        {error ? (
          <div className="error-indicator">
            <span>!</span>
          </div>
        ) : (
          <img 
            src={imageUrl} 
            alt={image.name}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: loading ? 'none' : 'block' }}
          />
        )}
      </div>
      
      <div className="thumbnail-info">
        <span className="thumbnail-name">{displayName()}</span>
        <span className="thumbnail-date">{formatDate(image.modified)}</span>
      </div>

      <style>{`
        .image-thumbnail {
          display: flex;
          flex-direction: column;
          margin: 8px;
          border-radius: 4px;
          overflow: hidden;
          cursor: pointer;
          background-color: #f5f5f5;
          border: 2px solid transparent;
          transition: all 0.2s ease;
        }
        
        .image-thumbnail:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        
        .image-thumbnail.selected {
          border-color: #2196f3;
          box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4);
        }
        
        .thumbnail-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background-color: #e0e0e0;
        }
        
        .thumbnail-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .loading-indicator,
        .error-indicator {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .loading-indicator {
          background-color: rgba(0, 0, 0, 0.1);
          color: #555;
        }
        
        .error-indicator {
          background-color: rgba(244, 67, 54, 0.1);
          color: #f44336;
          font-size: 32px;
          font-weight: bold;
        }
        
        .thumbnail-info {
          padding: 4px 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .thumbnail-name {
          font-size: 14px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .thumbnail-date {
          font-size: 12px;
          color: #777;
        }
        
        @media (prefers-color-scheme: dark) {
          .image-thumbnail {
            background-color: #333;
          }
          
          .thumbnail-container {
            background-color: #222;
          }
          
          .loading-indicator {
            background-color: rgba(255, 255, 255, 0.1);
            color: #bbb;
          }
          
          .thumbnail-name {
            color: #e0e0e0;
          }
          
          .thumbnail-date {
            color: #999;
          }
        }
      `}</style>
    </div>
  );
}

export default ImageThumbnail;