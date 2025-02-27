import _React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ImageThumbnail, { ImageInfo } from './ImageThumbnail';

// 画像リスト取得結果の型
interface ImageListResult {
  images: ImageInfo[];
  total: number;
  folders: string[];
}

// ビューモード
type ViewMode = 'grid' | 'detail';

// 表示サイズ
type ThumbnailSize = 'small' | 'medium' | 'large';

// ImageViewerコンポーネントのプロップス
interface ImageViewerProps {
  resourceConfig?: {
    id: string;
    name: string;
    filters: {
      include: string[];
      exclude: string[];
    };
  } | null;
}

/**
 * 画像ビューアーコンポーネント
 */
export function ImageViewer({ resourceConfig }: ImageViewerProps) {
  // 状態管理
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [totalImages, setTotalImages] = useState<number>(0);
  const [loadedFolders, setLoadedFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>('medium');
  
  // ページネーション
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [itemsPerPage, _setItemsPerPage] = useState<number>(50);

  // 初期ロード
  useEffect(() => {
    loadImages();
    
    // イベントリスナーを設定
    const unlistenError = listen<string>("image-error", (event) => {
      setError(event.payload);
    });
    
    return () => {
      // クリーンアップ
      unlistenError.then(fn => fn());
    };
  }, [resourceConfig]);
  
  // ページ変更時の画像読み込み
  useEffect(() => {
    loadPagedImages(currentPage);
  }, [currentPage, itemsPerPage]);

  // 画像リストを読み込む
  const loadImages = async () => {
    if (!resourceConfig || resourceConfig.filters.include.length === 0) {
      setError("有効なリソースフォルダが設定されていません");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // 最初のページをロード
      await loadPagedImages(0);
    } catch (err) {
      console.error("画像読み込みエラー:", err);
      setError(`画像の読み込みに失敗しました: ${err}`);
      setLoading(false);
    }
  };
  
  // ページングされた画像を読み込む
  const loadPagedImages = async (page: number) => {
    try {
      setLoading(true);
      
      const result = await invoke<ImageListResult>("get_paginated_images", {
        page,
        itemsPerPage
      });
      
      setImages(result.images);
      setTotalImages(result.total);
      setLoadedFolders(result.folders);
      
      if (result.images.length > 0 && !selectedImage) {
        setSelectedImage(result.images[0]);
      }
    } catch (err) {
      console.error("画像ページング読み込みエラー:", err);
      setError(`画像の読み込みに失敗しました: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // サムネイルクリック時のハンドラ
  const handleThumbnailClick = (image: ImageInfo) => {
    setSelectedImage(image);
    setViewMode('detail');
  };

  // 前の画像に移動
  const goToPreviousImage = () => {
    if (!selectedImage || images.length === 0) return;
    
    const currentIndex = images.findIndex(img => img.path === selectedImage.path);
    if (currentIndex > 0) {
      setSelectedImage(images[currentIndex - 1]);
    } else if (currentPage > 0) {
      // 前のページの最後の画像に移動
      setCurrentPage(currentPage - 1);
      // ページロード後に最後の画像を選択する処理は別途必要
    }
  };

  // 次の画像に移動
  const goToNextImage = () => {
    if (!selectedImage || images.length === 0) return;
    
    const currentIndex = images.findIndex(img => img.path === selectedImage.path);
    if (currentIndex < images.length - 1) {
      setSelectedImage(images[currentIndex + 1]);
    } else if ((currentPage + 1) * itemsPerPage < totalImages) {
      // 次のページの最初の画像に移動
      setCurrentPage(currentPage + 1);
      // ページロード後に最初の画像を選択する処理は別途必要
    }
  };

  // グリッド表示に戻る
  const backToGrid = () => {
    setViewMode('grid');
  };

  // サムネイルサイズを変更
  const changeThumbnailSize = (size: ThumbnailSize) => {
    setThumbnailSize(size);
  };
  
  // 総ページ数を計算
  const totalPages = Math.ceil(totalImages / itemsPerPage);
  
  // ページを変更
  const changePage = (page: number) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  };

  // 詳細表示モード
  const renderDetailView = () => {
    if (!selectedImage) return null;
    
    const imageUrl = convertFileSrc(selectedImage.path);
    
    return (
      <div className="detail-view">
        <div className="detail-header">
          <button onClick={backToGrid} className="back-button">
            ← グリッドに戻る
          </button>
          <div className="image-navigation">
            <button 
              onClick={goToPreviousImage} 
              disabled={currentPage === 0 && images.indexOf(selectedImage) === 0}
            >
              前の画像
            </button>
            <span className="image-counter">
              {images.indexOf(selectedImage) + 1 + (currentPage * itemsPerPage)} / {totalImages}
            </span>
            <button 
              onClick={goToNextImage} 
              disabled={(currentPage + 1) * itemsPerPage >= totalImages && 
                images.indexOf(selectedImage) === images.length - 1}
            >
              次の画像
            </button>
          </div>
        </div>
        
        <div className="detail-content">
          <img src={imageUrl} alt={selectedImage.name} className="detail-image" />
        </div>
        
        <div className="detail-info">
          <h3>{selectedImage.name}</h3>
          <p>サイズ: {(selectedImage.size / 1024).toFixed(1)} KB</p>
          <p>更新日: {new Date(selectedImage.modified * 1000).toLocaleDateString()}</p>
          <p>タイプ: {selectedImage.extension.toUpperCase()}</p>
        </div>
      </div>
    );
  };

  // グリッド表示モード
  const renderGridView = () => {
    return (
      <div className="grid-view">
        <div className="grid-header">
          <div className="grid-info">
            <h2>画像ギャラリー</h2>
            <span>{totalImages} 画像 ({loadedFolders.length} フォルダ)</span>
          </div>
          
          <div className="grid-controls">
            <div className="size-controls">
              <button 
                onClick={() => changeThumbnailSize('small')} 
                className={thumbnailSize === 'small' ? 'active' : ''}
              >
                小
              </button>
              <button 
                onClick={() => changeThumbnailSize('medium')} 
                className={thumbnailSize === 'medium' ? 'active' : ''}
              >
                中
              </button>
              <button 
                onClick={() => changeThumbnailSize('large')} 
                className={thumbnailSize === 'large' ? 'active' : ''}
              >
                大
              </button>
            </div>
            
            <div className="pagination-controls">
              <button 
                onClick={() => changePage(0)} 
                disabled={currentPage === 0}
              >
                &#171; 最初
              </button>
              <button 
                onClick={() => changePage(currentPage - 1)} 
                disabled={currentPage === 0}
              >
                &#8249; 前へ
              </button>
              <span>ページ {currentPage + 1} / {totalPages}</span>
              <button 
                onClick={() => changePage(currentPage + 1)} 
                disabled={currentPage >= totalPages - 1}
              >
                次へ &#8250;
              </button>
              <button 
                onClick={() => changePage(totalPages - 1)} 
                disabled={currentPage >= totalPages - 1}
              >
                最後 &#187;
              </button>
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="loading-container">
            <p>画像を読み込み中...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <p>{error}</p>
            <button onClick={loadImages}>再試行</button>
          </div>
        ) : images.length === 0 ? (
          <div className="empty-container">
            <p>画像が見つかりませんでした</p>
          </div>
        ) : (
          <div className={`image-grid size-${thumbnailSize}`}>
            {images.map((image) => (
              <ImageThumbnail
                key={image.path}
                image={image}
                selected={selectedImage?.path === image.path}
                onClick={handleThumbnailClick}
                size={thumbnailSize}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="image-viewer">
      {viewMode === 'grid' ? renderGridView() : renderDetailView()}
      
      <style>{`
        .image-viewer {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        /* Grid View Styles */
        .grid-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .grid-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background-color: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .grid-info h2 {
          margin: 0;
          margin-bottom: 4px;
        }
        
        .grid-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .size-controls,
        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .image-grid {
          display: flex;
          flex-wrap: wrap;
          padding: 10px;
          overflow-y: auto;
          justify-content: flex-start;
          align-content: flex-start;
        }
        
        .image-grid.size-small {
          gap: 4px;
        }
        
        .image-grid.size-medium {
          gap: 8px;
        }
        
        .image-grid.size-large {
          gap: 12px;
        }
        
        .loading-container,
        .error-container,
        .empty-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }
        
        .error-container {
          color: #f44336;
        }
        
        /* Detail View Styles */
        .detail-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background-color: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .image-navigation {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .image-counter {
          margin: 0 10px;
        }
        
        .detail-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #222;
          overflow: auto;
        }
        
        .detail-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        
        .detail-info {
          padding: 10px;
          background-color: #f5f5f5;
          border-top: 1px solid #e0e0e0;
        }
        
        .detail-info h3 {
          margin-top: 0;
          margin-bottom: 8px;
        }
        
        .detail-info p {
          margin: 4px 0;
        }
        
        button {
          padding: 6px 12px;
          border: 1px solid #ccc;
          background-color: #fff;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        button:hover:not(:disabled) {
          background-color: #f0f0f0;
        }
        
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        button.active {
          background-color: #2196f3;
          color: white;
          border-color: #1976d2;
        }
        
        @media (prefers-color-scheme: dark) {
          .grid-header, .detail-header, .detail-info {
            background-color: #333;
            border-color: #444;
          }
          
          .detail-content {
            background-color: #111;
          }
          
          button {
            background-color: #444;
            border-color: #555;
            color: #e0e0e0;
          }
          
          button:hover:not(:disabled) {
            background-color: #555;
          }
          
          button.active {
            background-color: #2196f3;
            color: white;
          }
        }
      `}</style>
    </div>
  );
}

export default ImageViewer;