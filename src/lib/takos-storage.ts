/**
 * Client for the takos platform storage API.
 *
 * Provides typed access to the spaces.storage endpoints:
 *   GET    /api/spaces/:spaceId/storage              — list files
 *   POST   /api/spaces/:spaceId/storage/files         — create file
 *   GET    /api/spaces/:spaceId/storage/:fileId       — get file metadata
 *   GET    /api/spaces/:spaceId/storage/:fileId/content — get file content
 *   PUT    /api/spaces/:spaceId/storage/:fileId/content — write file content
 *   PATCH  /api/spaces/:spaceId/storage/:fileId       — rename/move
 *   DELETE /api/spaces/:spaceId/storage/:fileId       — delete file
 *   POST   /api/spaces/:spaceId/storage/folders       — create folder
 */

export interface StorageFile {
  id: string;
  name: string;
  parentId?: string;
  type: 'file' | 'folder';
  size?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TakosStorageClient {
  list(prefix?: string): Promise<StorageFile[]>;
  get(fileId: string): Promise<StorageFile | null>;
  getContent(fileId: string): Promise<string>;
  putContent(fileId: string, content: string): Promise<void>;
  create(name: string, parentId?: string): Promise<StorageFile>;
  createFolder(name: string, parentId?: string): Promise<StorageFile>;
  rename(fileId: string, name: string): Promise<void>;
  delete(fileId: string): Promise<void>;
}

export function createTakosStorageClient(
  apiUrl: string,
  token: string,
  spaceId: string,
): TakosStorageClient {
  const baseUrl = `${apiUrl}/api/spaces/${spaceId}/storage`;

  async function fetchApi(path: string, options?: RequestInit): Promise<Response> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Takos API error: ${res.status} ${res.statusText} — ${body}`);
    }
    return res;
  }

  async function list(prefix?: string): Promise<StorageFile[]> {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
    const res = await fetchApi(query);
    const data = await res.json();
    return (data.files ?? data) as StorageFile[];
  }

  async function get(fileId: string): Promise<StorageFile | null> {
    try {
      const res = await fetchApi(`/${fileId}`);
      return (await res.json()) as StorageFile;
    } catch {
      return null;
    }
  }

  async function getContent(fileId: string): Promise<string> {
    const res = await fetchApi(`/${fileId}/content`);
    return res.text();
  }

  async function putContent(fileId: string, content: string): Promise<void> {
    await fetchApi(`/${fileId}/content`, {
      method: 'PUT',
      body: content,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  async function create(name: string, parentId?: string): Promise<StorageFile> {
    const res = await fetchApi('/files', {
      method: 'POST',
      body: JSON.stringify({ name, parentId }),
    });
    return (await res.json()) as StorageFile;
  }

  async function createFolder(name: string, parentId?: string): Promise<StorageFile> {
    const res = await fetchApi('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId }),
    });
    return (await res.json()) as StorageFile;
  }

  async function rename(fileId: string, name: string): Promise<void> {
    await fetchApi(`/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async function del(fileId: string): Promise<void> {
    await fetchApi(`/${fileId}`, { method: 'DELETE' });
  }

  return { list, get, getContent, putContent, create, createFolder, rename, delete: del };
}
