/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { CompoundEntityRef } from '@backstage/catalog-model';
import type {
  SyncResult,
  TechDocsStorageApi,
} from '@backstage/plugin-techdocs-react';

const VERSION_QUERY_PARAM = 'version';
const VERSION_STORAGE_KEY_PREFIX = 'techdocs-version::';

const joinPath = (...parts: string[]) =>
  parts
    .map(part => part.trim())
    .filter(Boolean)
    .join('/')
    .replace(/^\/+|\/+$/g, '');

const getVersionFromSearch = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const value = new URLSearchParams(window.location.search)
    .get(VERSION_QUERY_PARAM)
    ?.trim();

  return value || undefined;
};

const getEntityKeyFromPath = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const match = window.location.pathname.match(
    /^\/docs\/([^/]+)\/([^/]+)\/([^/]+)(?:\/|$)/,
  );

  if (!match) {
    return undefined;
  }

  const [, namespace, kind, name] = match;
  return `${namespace}/${kind}/${name}`;
};

const getStoredVersion = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const entityKey = getEntityKeyFromPath();
  if (!entityKey) {
    return undefined;
  }

  return (
    localStorage.getItem(`${VERSION_STORAGE_KEY_PREFIX}${entityKey}`)?.trim() ||
    undefined
  );
};

const getActiveVersion = () => getVersionFromSearch() ?? getStoredVersion();

const addVersionPrefix = (path: string) => {
  const activeVersion = getActiveVersion();
  if (!activeVersion) {
    return path;
  }

  const normalizedPath = path.replace(/^\/+|\/+$/g, '');

  if (!normalizedPath) {
    return activeVersion;
  }

  if (
    normalizedPath === activeVersion ||
    normalizedPath.startsWith(`${activeVersion}/`)
  ) {
    return normalizedPath;
  }

  return joinPath(activeVersion, normalizedPath);
};

export class VersionedTechDocsStorageClient implements TechDocsStorageApi {
  constructor(private readonly delegate: TechDocsStorageApi) {}

  getApiOrigin(): Promise<string> {
    return this.delegate.getApiOrigin();
  }

  getStorageUrl(): Promise<string> {
    return this.delegate.getStorageUrl();
  }

  getBuilder(): Promise<string> {
    return this.delegate.getBuilder();
  }

  getEntityDocs(entityId: CompoundEntityRef, path: string): Promise<string> {
    return this.delegate.getEntityDocs(entityId, addVersionPrefix(path));
  }

  syncEntityDocs(
    entityId: CompoundEntityRef,
    logHandler?: (line: string) => void,
  ): Promise<SyncResult> {
    return this.delegate.syncEntityDocs(entityId, logHandler);
  }

  getBaseUrl(
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
