// Article extracted from a URL
export interface Article {
  title: string;
  author: string;
  date: string;           // YYYY-MM-DD format
  body: string;           // Clean HTML content
  rawText: string;        // Plain text
  wordCount: number;
  sourceUrl: string;
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
}

// Connection status
export interface ConnectionStatus {
  connected: boolean;
  ip: string;
  firmwareType: 'stock' | 'crosspoint';
  checking: boolean;
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
}
