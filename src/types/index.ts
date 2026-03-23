export interface ArticleImage {
  id: string;
  filename: string;
  mediaType: string;
  data: string; // base64 encoded string
}

// Article extracted from a URL
export interface Article {
  title: string;
  author: string;
  date: string;           // YYYY-MM-DD format
  body: string;           // Clean HTML content
  rawText: string;        // Plain text
  wordCount: number;
  sourceUrl: string;
  images?: ArticleImage[]; // Optional array of downloaded images
}

// Result of article extraction
export interface ExtractionResult {
  success: boolean;
  article?: Article;
  error?: string;
}

// Result of EPUB generation
export interface EpubResult {
  data: Uint8Array;     // The EPUB file as bytes
  filename: string;     // Suggested filename
}

// Result of X4 upload
export interface UploadResult {
  success: boolean;
  error?: string;
}

// App settings
export interface Settings {
  firmwareType: 'stock' | 'crosspoint';
  stockIp: string;
  crossPointIp: string;
  articleFolder: string;
  noteFolder: string;
  useDateFolders: boolean;
  includeImagesInArticles: boolean;
}

// Connection status
export interface ConnectionStatus {
  connected: boolean;
  ip: string;
  firmwareType: 'stock' | 'crosspoint';
  checking: boolean;
  lastError?: string;
}

// App state
export type AppState =
  | 'idle'
  | 'clipboard-detected'
  | 'processing'
  | 'success'
  | 'error'
  | 'not-connected';

// Remote file on X4
export interface RemoteFile {
  name: string;
  rawName?: string; // Original filename from server (may be URL encoded)
  size?: number;
  date?: string; // Parsed or raw date
  timestamp?: number; // Used for sorting
  folder?: string; // Which folder the file lives in (for date-subfolder deletion)
}

// A queued article reference (saved for later batch sending)
export interface QueuedArticle {
  id: string;            // unique ID (timestamp-based)
  url: string;           // the article URL
  title?: string;        // optional display title (from og:title or domain)
  addedAt: number;       // timestamp when added to queue
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string; // populated when status === 'failed'
  isLocalFile?: boolean; // true if this is a local .epub file (skip extraction)
  cachedEpubPath?: string;     // local filesystem path to pre-fetched EPUB
  cachedEpubFilename?: string; // original EPUB filename for upload
}

// Result of a batch dump operation
export interface DumpResult {
  total: number;
  succeeded: number;
  failed: { id: string; url: string; title?: string; error: string }[];
}

// A queued screensaver image
export interface QueuedScreensaver {
  id: string;            // unique ID (timestamp-based)
  uri: string;           // local file URI
  filename: string;      // desired filename (e.g. "image.bmp")
  width?: number;        // optional dimensions (if known)
  height?: number;
  addedAt: number;
  status: 'pending' | 'processing' | 'failed' | 'success';
  error?: string;
  sourceUrl?: string;        // webp preview URL (for x4papers items)
  isPreDownloaded?: boolean; // true if uri already points to a ready-to-upload BMP
}
