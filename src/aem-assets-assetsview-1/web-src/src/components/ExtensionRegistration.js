// AEM Assets View unified extension point (`aem/assets/assetsview/1`) registration (R1):
// - `headerMenu.getButtons({ context, resource })`: "Create Contact Sheet" on the current folder (`assets`) or collection (`collections`)
// - `actionBar.getActions({ context, resourceSelection })`: "Create Contact Sheet" on multi-selected assets/folders in `assets`, `collections`, and `search`
// - `quickActions`: required empty implementation for browse-view recognition

import React, { useEffect } from 'react';
import { register } from '@adobe/uix-guest';
import { ASSETS_VIEW_EXTENSION_ID } from '../../../../shared-ui/constants.js';

export default function ExtensionRegistration() {
  useEffect(() => {
    const init = async () => {
      const guestConnection = await register({
        id: ASSETS_VIEW_EXTENSION_ID,
        methods: {
          headerMenu: {
            async getButtons({ context, resource }) {
              if (!['assets', 'collections'].includes(context) || !resource?.id) {
                return [];
              }
              return [
                {
                  id: 'create-contact-sheet-header',
                  label: 'Contact Sheet',
                  icon: 'Print',
                  variant: 'secondary',
                  onClick: async () => {
                    const source = context === 'collections'
                      ? { kind: 'collection', id: resource.id, name: resource.path?.split('/').pop() }
                      : { kind: 'folder', id: resource.id, path: resource.path, includeSubfolders: false };
                    await guestConnection.host.modal.openDialog({
                      title: 'Create Contact Sheet',
                      contentUrl: `/#contact-sheet-modal?source=${encodeURIComponent(JSON.stringify(source))}`,
                      type: 'fullscreen',
                    });
                  },
                },
              ];
            },
          },
          actionBar: {
            async getActions({ context, resourceSelection }) {
              const resources = resourceSelection?.resources || [];
              if (!['assets', 'collections', 'search'].includes(context) || resources.length === 0) {
                return [];
              }
              return [
                {
                  id: 'create-contact-sheet-selection',
                  icon: 'Print',
                  label: 'Contact Sheet',
                  onClick: async () => {
                    let source;
                    if (context === 'collections' && resources.length === 1 && (resources[0].path || '').includes('/collections/')) {
                      source = {
                        kind: 'collection',
                        id: resources[0].id,
                        name: resources[0].path?.split('/').pop(),
                      };
                    } else if (context === 'assets' && resources.length === 1 && !(resources[0].path || '').split('/').pop().includes('.')) {
                      source = {
                        kind: 'folder',
                        id: resources[0].id,
                        path: resources[0].path,
                        includeSubfolders: false,
                      };
                    } else {
                      source = {
                        kind: 'selection',
                        origin: context,
                        items: resources.map((r) => ({ id: r.id, path: r.path })),
                      };
                    }
                    await guestConnection.host.modal.openDialog({
                      title: 'Create Contact Sheet',
                      contentUrl: `/#contact-sheet-modal?source=${encodeURIComponent(JSON.stringify(source))}`,
                      type: 'fullscreen',
                    });
                  },
                },
              ];
            },
            async getHiddenBuiltInActions() {
              return [];
            },
            async overrideBuiltInAction() {
              return false;
            },
          },
          quickActions: {
            async getHiddenBuiltInActions() {
              return [];
            },
            async overrideBuiltInAction() {
              return false;
            },
          },
        },
      });
    };
    init().catch(console.error);
  }, []);

  return <div>AEM Contact Sheet Extension (Assets View)</div>;
}
