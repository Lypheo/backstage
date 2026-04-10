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
import { useLocation, useParams } from 'react-router-dom';

type MultiversionEntry = {
  name?: string;
  latest?: boolean;
  ref?: string;
  path?: string;
};

type VersionOption = {
  id: string;
  label: string;
  ref: string;
  prefix: string;
  isRoot: boolean;
};

const MULTIVERSION_FILENAME = 'multiversion.json';
const ROOT_VERSION_ID = '__root__';
const ROOT_VERSION_LABEL = 'Root (default)';

const trimSlashes = (value?: string) => {
  let result = (value ?? '').trim();
  while (result.startsWith('/')) {
    result = result.slice(1);
  }
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
};

const trimTrailingSlashes = (value: string) => {
  let result = value;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
};

const joinPath = (...parts: string[]) =>
  parts
    .map(part => trimSlashes(part))
    .filter(Boolean)
    .join('/');

const getBaseDocsPathname = (pathname: string, currentPath: string) => {
  const normalizedCurrentPath = trimSlashes(currentPath);
  if (!normalizedCurrentPath) {
    return trimTrailingSlashes(pathname);
  }

  const trimmedPathname = trimTrailingSlashes(pathname);
  const suffix = `/${normalizedCurrentPath}`;

  if (!trimmedPathname.endsWith(suffix)) {
    return trimmedPathname;
  }

  const base = trimmedPathname.slice(0, -suffix.length);
  return base || '/';
};

const toIndexPath = (path: string) => {
  const normalizedPath = trimSlashes(path);
  if (!normalizedPath) {
    return 'index.html';
  }

  return `${normalizedPath}/index.html`;
};

const toPathPrefix = (path?: string) => {
  const normalizedPath = trimSlashes(path);
  if (!normalizedPath || normalizedPath === '.') {
    return '';
  }

  return normalizedPath;
};

const buildOptions = (
  entries: Record<string, MultiversionEntry>,
): VersionOption[] => {
  const options = Object.entries(entries).map(([id, entry]) => {
    const prefix = toPathPrefix(entry.path);
    return {
      id,
      label: entry.name?.trim() || id,
      ref: entry.ref?.trim() || id,
      prefix,
      isRoot: prefix === '',
    };
  });

  if (!options.some(option => option.isRoot)) {
    options.unshift({
      id: ROOT_VERSION_ID,
      label: ROOT_VERSION_LABEL,
      ref: '',
      prefix: '',
      isRoot: true,
    });
  }

  return options;
};

const resolveCurrentVersion = (
  options: VersionOption[],
  currentPath: string,
): { selected: VersionOption; relativePath: string } => {
  const normalizedPath = trimSlashes(currentPath);

  const nonRootMatch = options.find(option => {
    if (!option.prefix) {
      return false;
    }

    return (
      normalizedPath === option.prefix ||
      normalizedPath.startsWith(`${option.prefix}/`)
    );
  });

  if (nonRootMatch) {
    const relativePath = trimSlashes(
      normalizedPath.slice(nonRootMatch.prefix.length),
    );
    return { selected: nonRootMatch, relativePath };
  }

  const rootOption = options.find(option => option.isRoot) ?? {
    id: ROOT_VERSION_ID,
    label: ROOT_VERSION_LABEL,
    ref: '',
    prefix: '',
    isRoot: true,
  };

  return { selected: rootOption, relativePath: normalizedPath };
};

export const TechDocsVersionsAddon = () => {
  const { entityRef } = useTechDocsReaderPage();
  const techdocsStorageApi = useApi(techdocsStorageApiRef);
  const alertApi = useApi(alertApiRef);
  const fetchApi = useApi(fetchApiRef);
  const location = useLocation();
  const { '*': currentPath = '' } = useParams();

  const [versionOptions, setVersionOptions] = useState<VersionOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadVersions = async () => {
      try {
        const url = await techdocsStorageApi.getBaseUrl(
          MULTIVERSION_FILENAME,
          entityRef,
          '',
        );
        const res = await fetchApi.fetch(url);
        if (!res.ok) {
          if (!cancelled) {
            setVersionOptions([]);
          }
          return;
        }

        const json = (await res.json()) as Record<string, MultiversionEntry>;
        if (!cancelled) {
          setVersionOptions(buildOptions(json));
        }
      } catch {
        if (!cancelled) {
          setVersionOptions([]);
        }
      }
    };

    void loadVersions();

    return () => {
      cancelled = true;
    };
  }, [entityRef, fetchApi, techdocsStorageApi]);

  const currentVersion = useMemo(
    () => resolveCurrentVersion(versionOptions, currentPath),
    [currentPath, versionOptions],
  );

  const baseDocsPathname = useMemo(
    () => getBaseDocsPathname(location.pathname, currentPath),
    [currentPath, location.pathname],
  );

  const selectedValue = currentVersion.selected.id;

  const buildUrl = (pathname: string, hash: string) => {
    const search = location.search;
    return `${pathname}${search}${hash}`;
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
      `${trimTrailingSlashes(storageUrl)}/${docsPath}`,
    );

    return response.ok;
  };

  const handleVersionChange = async (nextValue: string) => {
    const nextOption = versionOptions.find(option => option.id === nextValue);
    if (!nextOption) {
      return;
    }

    const selectedActualVersion = currentVersion.selected;

    if (nextOption.id === selectedActualVersion.id) {
      return;
    }

    const samePageInTargetVersion = joinPath(
      nextOption.prefix,
      currentVersion.relativePath,
    );

    try {
      const hasEquivalentPage = currentVersion.relativePath
        ? await fileExistsForVersionPath(samePageInTargetVersion)
        : true;

      const destinationPath = hasEquivalentPage
        ? currentVersion.relativePath
        : '';

      if (!hasEquivalentPage) {
        alertApi.post({
          message:
            'This page does not exist in the selected version. Opened the version root instead.',
          severity: 'warning',
          display: 'transient',
        });
      }

      const targetPath = joinPath(
        baseDocsPathname,
        nextOption.prefix,
        destinationPath,
      );
      const pathname = `/${targetPath}`;
      const targetUrl = buildUrl(pathname, location.hash);
      window.location.assign(targetUrl);
    } catch {
      alertApi.post({
        message:
          'Could not validate the selected version page. Opened the version root instead.',
        severity: 'warning',
        display: 'transient',
      });

      const pathname = baseDocsPathname;
      const targetUrl = buildUrl(pathname, location.hash);
      window.location.assign(targetUrl);
    }
  };

  if (!versionOptions.length) {
    return null;
  }

  return (
    <FormControl variant="outlined" size="small">
      <InputLabel id="techdocs-version-select-label">Version</InputLabel>
      <Select
        labelId="techdocs-version-select-label"
        value={selectedValue}
        displayEmpty
        renderValue={value => {
          const selectedOption = versionOptions.find(
            option => option.id === value,
          );
          if (!selectedOption) {
            return ROOT_VERSION_LABEL;
          }

          return selectedOption.label;
        }}
        onChange={event => {
          void handleVersionChange(String(event.target.value));
        }}
        label="Version"
      >
        {versionOptions.map(option => (
          <MenuItem key={option.id} value={option.id}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
