import { useEffect, useMemo } from 'react';
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
  const { entityMetadata, entityRef, shadowRoot } = useTechDocsReaderPage();
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

  const normalizedCurrentPath = trimSlashes(currentPath);
  const currentPathParts = normalizedCurrentPath
    ? normalizedCurrentPath.split('/')
    : [];
  const currentPathVersion =
    currentPathParts.length > 0 && versions.includes(currentPathParts[0])
      ? currentPathParts[0]
      : '';
  const currentRelativePath = currentPathVersion
    ? currentPathParts.slice(1).join('/')
    : normalizedCurrentPath;

  const toSelectedValue = (version?: string) =>
    version ? version : ROOT_VERSION_VALUE;

  const fromSelectedValue = (value: string) =>
    value === ROOT_VERSION_VALUE ? '' : value;

  const buildUrl = (pathname: string, hash: string) => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete(VERSION_QUERY_PARAM);
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

  const selectedValue = toSelectedValue(currentPathVersion);

  useEffect(() => {
    if (!shadowRoot || !currentPathVersion) {
      return;
    }

    const baseEntityPath = `/docs/${entityRef.namespace}/${entityRef.kind}/${entityRef.name}`;
    const kindPrefixPath = `/docs/${entityRef.namespace}/${entityRef.kind}`;

    const links = Array.from(
      shadowRoot.querySelectorAll<HTMLAnchorElement>('a[href]'),
    );
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) {
        continue;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        continue;
      }

      if (url.origin !== window.location.origin) {
        continue;
      }

      const normalizedPath = trimSlashes(url.pathname);
      const normalizedBaseEntityPath = trimSlashes(baseEntityPath);
      const normalizedKindPrefixPath = trimSlashes(kindPrefixPath);

      if (normalizedPath.startsWith(normalizedBaseEntityPath)) {
        const remainder = trimSlashes(
          normalizedPath.slice(normalizedBaseEntityPath.length),
        );

        if (
          remainder &&
          remainder !== currentPathVersion &&
          !remainder.startsWith(`${currentPathVersion}/`)
        ) {
          url.pathname = `/${joinPath(
            baseEntityPath,
            currentPathVersion,
            remainder,
          )}`;
          link.setAttribute('href', url.toString());
        }
        continue;
      }

      if (normalizedPath.startsWith(normalizedKindPrefixPath)) {
        const remainderAfterKind = trimSlashes(
          normalizedPath.slice(normalizedKindPrefixPath.length),
        );

        if (!remainderAfterKind.startsWith(`${entityRef.name}/`)) {
          url.pathname = `/${joinPath(
            baseEntityPath,
            currentPathVersion,
            remainderAfterKind,
          )}`;
          link.setAttribute('href', url.toString());
        }
      }
    }
  }, [
    currentPathVersion,
    entityRef.kind,
    entityRef.name,
    entityRef.namespace,
    shadowRoot,
  ]);

  const handleVersionChange = async (nextValue: string) => {
    const nextVersion = fromSelectedValue(nextValue);
    const selectedActualVersion = currentPathVersion;

    if (nextVersion === selectedActualVersion) {
      return;
    }

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

      const targetPath = joinPath(
        '/docs',
        entityRef.namespace,
        entityRef.kind,
        entityRef.name,
        nextVersion,
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

      const pathname = `/docs/${entityRef.namespace}/${entityRef.kind}/${entityRef.name}`;
      const targetUrl = buildUrl(pathname, location.hash);
      window.location.assign(targetUrl);
    }
  };

  if (!versions.length) {
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
          const stringValue = String(value ?? ROOT_VERSION_VALUE);
          return stringValue === ROOT_VERSION_VALUE
            ? ROOT_VERSION_LABEL
            : stringValue;
        }}
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
