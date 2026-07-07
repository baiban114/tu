import { isMockDataSource } from '@/dev/dataSource';

export interface FileUploadResult {
  id: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const mockFileUrls = new Map<string, string>();

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

export function buildFileUrl(fileId: string): string {
  if (isMockDataSource()) {
    const mockUrl = mockFileUrls.get(fileId);
    if (mockUrl) return mockUrl;
  }
  return buildUrl(`/api/files/${fileId}`);
}

export async function uploadFile(file: File): Promise<FileUploadResult> {
  if (isMockDataSource()) {
    const id = `mock-file-${Date.now()}`;
    const url = URL.createObjectURL(file);
    mockFileUrls.set(id, url);
    return {
      id,
      url,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    };
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(buildUrl('/api/files'), {
    method: 'POST',
    body: formData,
  });

  let payload: ApiEnvelope<FileUploadResult> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<FileUploadResult>;
  } catch {
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Upload failed with status ${response.status}`);
  }

  if (!payload || payload.code !== 0) {
    throw new Error(payload?.message || 'Upload failed');
  }

  return payload.data;
}

export async function uploadPdfFile(file: File): Promise<FileUploadResult> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Only PDF files are supported');
  }
  return uploadFile(file);
}
