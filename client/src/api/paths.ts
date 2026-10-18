import type {
  ColumnMapping,
  CsvUploadResult,
  Path,
  PathPoint,
  PathWithPoints,
} from '../types';

const API_BASE = '/api/paths';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* 响应不是 JSON 就保留原始状态文本 */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listPaths(): Promise<Path[]> {
  return request<Path[]>(API_BASE);
}

export function getPath(id: number): Promise<PathWithPoints> {
  return request<PathWithPoints>(`${API_BASE}/${id}`);
}

export interface CreatePathInput {
  name: string;
  source_file: string | null;
  points: Array<Partial<PathPoint>>;
}

export function createPath(input: CreatePathInput): Promise<{ id: number; warnings: string[] }> {
  return request<{ id: number; warnings: string[] }>(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/**
 * 404 视为成功：这样批量删除是幂等可重试的（部分失败后重试不会把已删的报错）。
 */
export async function deletePath(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    let message = `删除失败 (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
}

export function changeColor(id: number, color: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`${API_BASE}/${id}/color`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color }),
  });
}

export function renamePath(id: number, name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`${API_BASE}/${id}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function uploadCsv(file: File): Promise<CsvUploadResult> {
  const form = new FormData();
  form.append('file', file);
  return request<CsvUploadResult>(`${API_BASE}/upload`, { method: 'POST', body: form });
}

export function reparseCsv(fileId: string, headerRow: number): Promise<CsvUploadResult> {
  return request<CsvUploadResult>(`${API_BASE}/reparse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, headerRow }),
  });
}

/** 供上传前做一次本地预检，避免把明显的非 CSV 丢给后端 */
export function isCsvFile(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
}

export type { ColumnMapping };
