import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { attach } from '@adobe/uix-guest';
import { ASSETS_VIEW_EXTENSION_ID, CONTENT_HUB_EXTENSION_ID } from './constants.js';
import AssetsViewReg from '../aem-assets-assetsview-1/web-src/src/components/ExtensionRegistration.js';
import ContentHubReg from '../aem-assets-contenthub-1/web-src/src/components/ExtensionRegistration.js';
import ContactSheetDialog from './components/ContactSheetDialog.js';

function UnifiedRegistration() {
  const href = `${window.location.href} ${document.referrer || ''}`.toLowerCase();
  const isContentHub =
    href.includes('contenthub') ||
    href.includes('delivery-') ||
    new URLSearchParams(window.location.search).has('repo');

  return isContentHub ? <ContentHubReg /> : <AssetsViewReg />;
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

      const extId = detectedTier === 'delivery' ? CONTENT_HUB_EXTENSION_ID : ASSETS_VIEW_EXTENSION_ID;
      const conn = await attach({ id: extId });
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
      actionBaseUrl="https://767251-547dimsquid.adobeioruntime.net/api/v1/web/contactsheet"
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
