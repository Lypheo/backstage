import type { CompoundEntityRef } from '@backstage/catalog-model';
import type {
  SyncResult,
  TechDocsStorageApi,
} from '@backstage/plugin-techdocs-react';

const VERSION_QUERY_PARAM = 'version';

const trimSlashes = (value: string) => {
  let result = value.trim();
  while (result.startsWith('/')) {
    result = result.slice(1);
  }
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
};

const getVersionFromSearch = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = new URLSearchParams(window.location.search)
    .get(VERSION_QUERY_PARAM)
    ?.trim();

  return value ?? null;
};

const addVersionPrefix = (path: string) => {
  const selectedVersion = getVersionFromSearch();
  if (!selectedVersion) {
    return path;
  }

  const normalizedPath = trimSlashes(path);

  if (!normalizedPath) {
    return selectedVersion;
  }

  if (
    normalizedPath === selectedVersion ||
    normalizedPath.startsWith(`${selectedVersion}/`)
  ) {
    return normalizedPath;
  }

  return `${selectedVersion}/${normalizedPath}`;
};

export class VersionedTechDocsStorageClient implements TechDocsStorageApi {
  constructor(private readonly delegate: TechDocsStorageApi) {}

  async getApiOrigin(): Promise<string> {
    return this.delegate.getApiOrigin();
  }

  async getStorageUrl(): Promise<string> {
    return this.delegate.getStorageUrl();
  }

  async getBuilder(): Promise<string> {
    return this.delegate.getBuilder();
  }

  async getEntityDocs(entityId: CompoundEntityRef, path: string): Promise<string> {
    return this.delegate.getEntityDocs(entityId, addVersionPrefix(path));
  }

  async syncEntityDocs(
    entityId: CompoundEntityRef,
    logHandler?: (line: string) => void,
  ): Promise<SyncResult> {
    return this.delegate.syncEntityDocs(entityId, logHandler);
  }

  async getBaseUrl(
    oldBaseUrl: string,
    entityId: CompoundEntityRef,
    path: string,
  ): Promise<string> {
    return this.delegate.getBaseUrl(
      oldBaseUrl,
      entityId,
      addVersionPrefix(path),
    );
  }
}
