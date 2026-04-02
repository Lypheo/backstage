
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

const TECHDOCS_VERSIONS_ANNOTATION = 'f-i.de/techdocs-versions';
const VERSION_QUERY_PARAM = 'version';
const ROOT_VERSION_VALUE = '__root__';
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

const stripVersionPrefix = (path: string, version?: string) => {
  const normalizedPath = trimSlashes(path);
  const normalizedVersion = trimSlashes(version ?? '');

  if (!normalizedVersion) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedVersion) {
    return '';
  }

  if (normalizedPath.startsWith(`${normalizedVersion}/`)) {
    return normalizedPath.slice(normalizedVersion.length + 1);
  }

  return normalizedPath;
};

const toIndexPath = (path: string) => {
  const normalizedPath = trimSlashes(path);
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
    .split('\n')
    .flatMap(part => part.split(','))
    .map(value => value.trim())
    .filter(Boolean);
};

export const TechDocsVersionsAddon = () => {
  const { entityMetadata, entityRef } = useTechDocsReaderPage();
  const techdocsStorageApi = useApi(techdocsStorageApiRef);
  const alertApi = useApi(alertApiRef);
  const fetchApi = useApi(fetchApiRef);
  const location = useLocation();
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

  const versionOptions = useMemo(
    () => [ROOT_VERSION_VALUE, ...versions],
    [versions],
  );

  const getVersionFromSearch = () =>
    new URLSearchParams(location.search).get(VERSION_QUERY_PARAM)?.trim() ?? '';

  const toSelectedValue = (version?: string) =>
    version ? version : ROOT_VERSION_VALUE;

  const fromSelectedValue = (value: string) =>
    value === ROOT_VERSION_VALUE ? '' : value;

  const buildUrlWithVersion = (
    pathname: string,
    version: string,
    hash: string,
  ) => {
    const searchParams = new URLSearchParams(location.search);

    if (version) {
      searchParams.set(VERSION_QUERY_PARAM, version);
    } else {
      searchParams.delete(VERSION_QUERY_PARAM);
    }

    const search = searchParams.toString();
    return `${pathname}${search ? `?${search}` : ''}${hash}`;
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

  const [selectedVersion, setSelectedVersion] = useState(ROOT_VERSION_VALUE);

  useEffect(() => {
    const urlVersion = getVersionFromSearch();
    const initialVersion =
      urlVersion && versions.includes(urlVersion) ? urlVersion : '';

    setSelectedVersion(toSelectedValue(initialVersion));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, location.search]);

  const handleVersionChange = async (nextValue: string) => {
    const nextVersion = fromSelectedValue(nextValue);
    const selectedActualVersion = fromSelectedValue(selectedVersion);

    if (nextVersion === selectedActualVersion) {
      return;
    }

    const normalizedCurrentPath = trimSlashes(currentPath);
    const currentRelativePath = stripVersionPrefix(
      normalizedCurrentPath,
      selectedActualVersion,
    );
    const samePageInTargetVersion = nextVersion
      ? joinPath(nextVersion, currentRelativePath)
      : currentRelativePath;

    try {
      const hasEquivalentPage = currentRelativePath
        ? await fileExistsForVersionPath(samePageInTargetVersion)
        : true;

      const destinationPath = hasEquivalentPage ? currentRelativePath : '';

      if (!hasEquivalentPage) {
        alertApi.post({
          message:
            'This page does not exist in the selected version. Opened the version root instead.',
          severity: 'warning',
          display: 'transient',
        });
      }

      setSelectedVersion(nextValue);
      const targetPath = joinPath(
        '/docs',
        entityRef.namespace,
        entityRef.kind,
        entityRef.name,
        nextVersion,
        destinationPath,
      );
      const pathname = `/${targetPath}`;
      const targetUrl = buildUrlWithVersion(
        pathname,
        nextVersion,
        location.hash,
      );
      window.location.assign(targetUrl);
      return;
    } catch {
      alertApi.post({
        message:
          'Could not validate the selected version page. Opened the version root instead.',
        severity: 'warning',
        display: 'transient',
      });

      setSelectedVersion(nextValue);

      const pathname = `/docs/${entityRef.namespace}/${entityRef.kind}/${entityRef.name}`;
      const targetUrl = buildUrlWithVersion(
        pathname,
        nextVersion,
        location.hash,
      );
      window.location.assign(targetUrl);
      return;
    }
  };

  useEffect(() => {
    const urlVersion = getVersionFromSearch();
    const selectedValueFromUrl = toSelectedValue(urlVersion);

    if (selectedVersion !== selectedValueFromUrl) {
      setSelectedVersion(selectedValueFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  if (!versions.length) {
    return null;
  }

  return (
    <FormControl variant="outlined" size="small">
      <InputLabel id="techdocs-version-select-label">Version</InputLabel>
      <Select
        labelId="techdocs-version-select-label"
        value={selectedVersion}
        displayEmpty
        renderValue={value =>
          value === ROOT_VERSION_VALUE ? ROOT_VERSION_LABEL : String(value)
        }
        onChange={event => {
          void handleVersionChange(String(event.target.value));
        }}
        label="Version"
      >
        {versionOptions.map(version => (
          <MenuItem key={version} value={version}>
            {version === ROOT_VERSION_VALUE ? ROOT_VERSION_LABEL : version}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
