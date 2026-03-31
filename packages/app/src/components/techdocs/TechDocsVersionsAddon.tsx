import { useEffect, useMemo, useState } from 'react';
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@material-ui/core';
import { useTechDocsReaderPage } from '@backstage/plugin-techdocs-react';

const TECHDOCS_VERSIONS_ANNOTATION = 'foo.com/techdocs-versions';

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
  const { entityMetadata } = useTechDocsReaderPage();

  const versions = useMemo(
    () =>
      parseVersions(
        entityMetadata.value?.metadata.annotations?.[TECHDOCS_VERSIONS_ANNOTATION],
      ),
    [entityMetadata.value?.metadata.annotations],
  );
  console.log('Parsed versions:', versions);

  const [selectedVersion, setSelectedVersion] = useState('');

  useEffect(() => {
    setSelectedVersion(versions[0] ?? '');
  }, [versions]);

  if (!versions.length) {
    return null;
  }
  return <div style={{ marginLeft: '1rem' }}>PEEEEEEEEEEEENIS</div>;

  return (
    <FormControl variant="outlined" size="small">
      <InputLabel id="techdocs-version-select-label">Version</InputLabel>
      <Select
        labelId="techdocs-version-select-label"
        value={selectedVersion}
        onChange={event => setSelectedVersion(String(event.target.value))}
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
