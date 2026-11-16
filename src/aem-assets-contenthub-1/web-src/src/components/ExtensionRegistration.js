// Content Hub extension point (`aem/assets/contenthub/1`) registration (R1):
// - `card`: adds "Create Contact Sheet" to collection tiles (`context === 'collections'`)
// - `selectionBar`: adds "Create Contact Sheet" to the bulk selection bar (`assetIds`)

import React, { useEffect } from 'react';
import { register } from '@adobe/uix-guest';
import { CONTENT_HUB_EXTENSION_ID } from '../../../../shared-ui/constants.js';

const allowedRepos = []; // Empty allows any repo in dev; populate with delivery-p59602-e520244.adobeaemcloud.com for prod

export default function ExtensionRegistration() {
  useEffect(() => {
    const repo = new URLSearchParams(window.location.search).get('repo');
    if (allowedRepos.length > 0 && repo && !allowedRepos.includes(repo)) {
      return;
    }

    const init = async () => {
      const guestConnection = await register({
        id: CONTENT_HUB_EXTENSION_ID,
        methods: {
          card: {
            getActionButtons(actionContext) {
              const { context } = actionContext || {};
              if (context !== 'collections' && context !== 'collection') {
                return [];
              }
              return [
                {
                  id: 'create-contact-sheet-collection',
                  label: 'Create Contact Sheet',
                  icon: 'Print',
                },
              ];
            },
            async onActionClick(resourceType, buttonId, resourceId) {
              if (buttonId === 'create-contact-sheet-collection') {
                const source = {
                  kind: 'collection',
                  id: resourceId,
                  name: 'Collection',
                  origin: 'contenthub',
                };
                await guestConnection.host.modal.openDialog({
                  title: 'Create Contact Sheet',
                  contentUrl: `/#contact-sheet-modal?tier=delivery&source=${encodeURIComponent(JSON.stringify(source))}`,
                  type: 'fullscreen',
                });
              }
            },
          },
          selectionBar: {
            getActionButtons() {
              return [
                {
                  id: 'create-contact-sheet-bulk',
                  label: 'Create Contact Sheet',
                  icon: 'Print',
                },
              ];
            },
            async onActionClick(buttonId, assetIds) {
              if (buttonId === 'create-contact-sheet-bulk') {
                const source = {
                  kind: 'selection',
                  origin: 'contenthub',
                  items: (assetIds || []).map((id) => ({ id })),
                };
                await guestConnection.host.modal.openDialog({
                  title: 'Create Contact Sheet',
                  contentUrl: `/#contact-sheet-modal?tier=delivery&source=${encodeURIComponent(JSON.stringify(source))}`,
                  type: 'fullscreen',
                });
              }
            },
          },
        },
      });
    };
    init().catch(console.error);
  }, []);

  return <div>AEM Contact Sheet Extension (Content Hub)</div>;
}
