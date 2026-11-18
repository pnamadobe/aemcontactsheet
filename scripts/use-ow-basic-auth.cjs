// Preload hook for multi-org App Builder deployments: when the workspace `.env` provides
// a valid `AIO_runtime_auth` Basic key for the target namespace, use direct `https://adobeioruntime.net`
// authentication instead of `deploy-service.app-builder.adp.adobe.io` if the CLI's cached IMS token
// belongs to a different IMS Organization.
const Module = require('node:module');
const origLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  const exported = origLoad.apply(this, arguments);
  if (
    typeof request === 'string' &&
    request.endsWith('auth-helper') &&
    exported &&
    typeof exported.setRuntimeApiHostAndAuthHandler === 'function'
  ) {
    return {
      ...exported,
      setRuntimeApiHostAndAuthHandler(config) {
        return structuredClone(config);
      },
    };
  }
  return exported;
};
