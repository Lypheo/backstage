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
import { useEffect, useMemo, useState } from 'react';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { alertApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import {
  techdocsStorageApiRef,
  useTechDocsReaderPage,
} from '@backstage/plugin-techdocs-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const TECHDOCS_VERSIONS_ANNOTATION = 'foo.com/techdocs-versions';
const VERSION_QUERY_PARAM = 'version';
const VERSION_STORAGE_KEY_PREFIX = 'techdocs-version::';

const joinPath = (...parts: string[]) =>
  parts
    .map(part => part.trim())
    .filter(Boolean)
    .join('/')
    .replace(/^\/+|\/+$/g, '');

const normalizePath = (path?: string) => path?.replace(/^\/+|\/+$/g, '') ?? '';

const toIndexPath = (path: string) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) {
    return 'index.html';
  }

  return `${normalizedPath}/index.html`;
};

const parseVersions = (rawValue?: string): string[] => {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
    }
  } catch {
    // fall through to delimiter-based parsing
  }

  return rawValue
    .split(/[\n,]/)
    .map(value => value.trim())
    .filter(Boolean);
};

export const TechDocsVersionsAddon = () => {
  const { entityMetadata, entityRef } = useTechDocsReaderPage();
  const techdocsStorageApi = useApi(techdocsStorageApiRef);
  const alertApi = useApi(alertApiRef);
  const fetchApi = useApi(fetchApiRef);
  const location = useLocation();
  const navigate = useNavigate();
  const { '*': currentPath = '' } = useParams();

  const versions = useMemo(
    () =>
      parseVersions(
        entityMetadata.value?.metadata.annotations?.[
          TECHDOCS_VERSIONS_ANNOTATION
        ],
      ),
    [entityMetadata.value?.metadata.annotations],
  );

  const entityVersionStorageKey = useMemo(
    () =>
      `${VERSION_STORAGE_KEY_PREFIX}${entityRef.namespace}/${entityRef.kind}/${entityRef.name}`,
    [entityRef.kind, entityRef.name, entityRef.namespace],
  );

  const getVersionFromSearch = () =>
    new URLSearchParams(location.search).get(VERSION_QUERY_PARAM)?.trim() ?? '';

  const getStoredVersion = () =>
    localStorage.getItem(entityVersionStorageKey)?.trim() ?? '';

  const persistVersion = (value: string) => {
    if (!value) {
      localStorage.removeItem(entityVersionStorageKey);
      return;
    }

    localStorage.setItem(entityVersionStorageKey, value);
  };

  const setVersionInUrl = (version: string) => {
    const searchParams = new URLSearchParams(location.search);

    if (version) {
      searchParams.set(VERSION_QUERY_PARAM, version);
    } else {
      searchParams.delete(VERSION_QUERY_PARAM);
    }

    navigate(
      {
        pathname: location.pathname,
        search: searchParams.toString() ? `?${searchParams.toString()}` : '',
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const fileExistsForVersionPath = async (versionPath: string) => {
    const storageUrl = await techdocsStorageApi.getStorageUrl();
    const docsPath = joinPath(
      entityRef.namespace,
      entityRef.kind,
      entityRef.name,
      toIndexPath(versionPath),
    );
    const response = await fetchApi.fetch(
      `${storageUrl.replace(/\/+$/, '')}/${docsPath}`,
    );

    return response.ok;
  };

  const [selectedVersion, setSelectedVersion] = useState('');

  useEffect(() => {
    if (!versions.length) {
      setSelectedVersion('');
      return;
    }

    const urlVersion = getVersionFromSearch();
    const storedVersion = getStoredVersion();
    const initialVersion =
      (urlVersion && versions.includes(urlVersion) && urlVersion) ||
      (storedVersion && versions.includes(storedVersion) && storedVersion) ||
      versions[0];

    setSelectedVersion(initialVersion);
    persistVersion(initialVersion);

    if (urlVersion !== initialVersion) {
      setVersionInUrl(initialVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, entityVersionStorageKey, location.pathname, location.search]);

  if (!versions.length) {
    return null;
  }

  const handleVersionChange = async (nextVersion: string) => {
    if (!nextVersion || nextVersion === selectedVersion) {
      return;
    }

    const normalizedCurrentPath = normalizePath(currentPath);
    const samePageInTargetVersion = joinPath(
      nextVersion,
      normalizedCurrentPath,
    );

    try {
      const hasEquivalentPage = normalizedCurrentPath
        ? await fileExistsForVersionPath(samePageInTargetVersion)
        : true;

      const destinationPath = hasEquivalentPage ? normalizedCurrentPath : '';

      if (!hasEquivalentPage) {
        alertApi.post({
          message:
            'This page does not exist in the selected version. Opened the version root instead.',
          severity: 'warning',
          display: 'transient',
        });
      }

      setSelectedVersion(nextVersion);
      persistVersion(nextVersion);
      const targetPath = joinPath(
        '/docs',
        entityRef.namespace,
        entityRef.kind,
        entityRef.name,
        destinationPath,
      );

      navigate(
        {
          pathname: `/${targetPath}`.replace(/\/{2,}/g, '/'),
          search: `?${new URLSearchParams({
            ...Object.fromEntries(new URLSearchParams(location.search)),
            [VERSION_QUERY_PARAM]: nextVersion,
          }).toString()}`,
          hash: location.hash,
        },
        { replace: true },
      );
    } catch {
      alertApi.post({
        message:
          'Could not validate the selected version page. Opened the version root instead.',
        severity: 'warning',
        display: 'transient',
      });

      setSelectedVersion(nextVersion);
      persistVersion(nextVersion);

      navigate(
        {
          pathname: `/docs/${entityRef.namespace}/${entityRef.kind}/${entityRef.name}`,
          search: `?${new URLSearchParams({
            ...Object.fromEntries(new URLSearchParams(location.search)),
            [VERSION_QUERY_PARAM]: nextVersion,
          }).toString()}`,
          hash: location.hash,
        },
        { replace: true },
      );
    }
  };

  return (
    <FormControl variant="outlined" size="small">
      <InputLabel id="techdocs-version-select-label">Version</InputLabel>
      <Select
        labelId="techdocs-version-select-label"
        value={selectedVersion}
        onChange={event => {
          void handleVersionChange(String(event.target.value));
        }}
        label="Version"
      >
        {versions.map(version => (
          <MenuItem key={version} value={version}>
            {version}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
