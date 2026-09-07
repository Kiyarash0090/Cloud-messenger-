export interface DownloadProgressEventDetail {
  id: string;
  name: string;
  progress: number; // 0 to 100
  status: 'started' | 'progress' | 'completed' | 'failed';
}

export const startDownload = async (url: string, fileName: string) => {
  const downloadId = Math.random().toString(36).substring(2, 9);
  
  // Dispatch started event
  window.dispatchEvent(new CustomEvent('download-status', {
    detail: { id: downloadId, name: fileName, progress: 0, status: 'started' }
  }));

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    
    if (!response.body) {
      throw new Error('No body in response');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        
        if (totalBytes > 0) {
          const progress = Math.round((receivedBytes / totalBytes) * 100);
          window.dispatchEvent(new CustomEvent('download-status', {
            detail: { id: downloadId, name: fileName, progress, status: 'progress' }
          }));
        }
      }
    }

    const blob = new Blob(chunks);
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

    // Dispatch completed event
    window.dispatchEvent(new CustomEvent('download-status', {
      detail: { id: downloadId, name: fileName, progress: 100, status: 'completed' }
    }));
  } catch (err) {
    console.error('Download progress error, trying fallback:', err);
    // Fallback: regular download by opening in a new tab if blob fetch failed
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    window.dispatchEvent(new CustomEvent('download-status', {
      detail: { id: downloadId, name: fileName, progress: 100, status: 'completed' }
    }));
  }
};
