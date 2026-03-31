import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { TechDocsAddonLocations } from '@backstage/plugin-techdocs-react';
import { AddonBlueprint } from '@backstage/plugin-techdocs-react/alpha';
import { TechDocsVersionsAddon } from '../components/techdocs/TechDocsVersionsAddon';

const techDocsVersionsAddon = AddonBlueprint.make({
  name: 'versions-dropdown',
  params: {
    name: 'VersionsDropdown',
    location: TechDocsAddonLocations.Subheader,
    component: TechDocsVersionsAddon,
  },
});

export const techDocsVersionsAddonModule = createFrontendModule({
  pluginId: 'techdocs',
  extensions: [techDocsVersionsAddon],
});
