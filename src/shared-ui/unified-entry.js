import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { attach, register } from '@adobe/uix-guest';
import { ASSETS_VIEW_EXTENSION_ID } from './constants.js';
import ContactSheetDialog from './components/ContactSheetDialog.js';

function getHostRepoParam() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('repo') || sp.get('repoId') || '';
  } catch {
    return '';
  }
}

function buildModalUrl(tier, source) {
  const repo = getHostRepoParam();
  const repoSuffix = repo ? `&repo=${encodeURIComponent(repo)}` : '';
  return `/?t=${Date.now()}#contact-sheet-modal?tier=${tier}${repoSuffix}&source=${encodeURIComponent(JSON.stringify(source))}`;
}

function UnifiedRegistration() {
  useEffect(() => {
    const init = async () => {
      const guestConnection = await register({
        id: ASSETS_VIEW_EXTENSION_ID,
        methods: {
          // ─── AEM Assets View (`aem/assets/assetsview/1`) namespaces ───
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
                      contentUrl: buildModalUrl('author', source),
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
                    if (
                      context === 'collections' &&
                      resources.length === 1 &&
                      (resources[0].path || '').includes('/collections/')
                    ) {
                      source = {
                        kind: 'collection',
                        id: resources[0].id,
                        name: resources[0].path?.split('/').pop(),
                      };
                    } else if (
                      context === 'assets' &&
                      resources.length === 1 &&
                      !(resources[0].path || '').split('/').pop().includes('.')
                    ) {
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
                      contentUrl: buildModalUrl('author', source),
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

          // ─── Content Hub (`aem/assets/contenthub/1`) namespaces ───
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
                  contentUrl: buildModalUrl('delivery', source),
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
                  contentUrl: buildModalUrl('delivery', source),
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

  return <div>AEM Contact Sheet Extension</div>;
}

function UnifiedModal({ defaultTier = 'author' }) {
  const [guestConnection, setGuestConnection] = useState(null);
  const [source, setSource] = useState(null);
  const [tier, setTier] = useState(defaultTier);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const rawSource = params.get('source');
      const parsedSource = rawSource ? JSON.parse(rawSource) : null;
      const detectedTier =
        params.get('tier') ||
        (parsedSource?.origin === 'contenthub' || String(parsedSource?.id || '').startsWith('urn:cid:')
          ? 'delivery'
          : defaultTier);
      setTier(detectedTier);

      const conn = await attach({ id: ASSETS_VIEW_EXTENSION_ID });
      setGuestConnection(conn);

      if (parsedSource) {
        setSource(parsedSource);
      } else {
        const payload = await conn.host?.modal?.getPayload?.().catch(() => null);
        setSource(payload?.source || { kind: 'folder', id: '', path: '/content/dam' });
      }
    })();
  }, []);

  if (!guestConnection || !source) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Connecting to AEM…</div>;
  }

  return (
    <ContactSheetDialog
      guestConnection={guestConnection}
      source={source}
      tier={tier}
      actionBaseUrl="/api/v1/web/contactsheet"
    />
  );
}

function App() {
  const [hash, setHash] = useState(window.location.hash || '');
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash.startsWith('#contact-sheet-modal')) {
    return <UnifiedModal />;
  }
  return <UnifiedRegistration />;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
