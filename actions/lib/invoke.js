// Asynchronously invoke a non-web worker action in OpenWhisk / Adobe I/O Runtime,
// falling back to direct in-process async execution during local dev and unit tests.

export async function invokeWorkerAsync(workerName, payload, localMainFn = null) {
  if (process.env.__OW_API_HOST && process.env.__OW_API_KEY && !process.env.CONTACTSHEET_LOCAL_STORE) {
    try {
      const owMod = await import('openwhisk');
      const ow = (owMod.default || owMod)();
      await ow.actions.invoke({
        name: `contactsheet/${workerName}`,
        blocking: false,
        result: false,
        params: payload,
      });
      return { invoked: 'openwhisk' };
    } catch {
      // Fall through to local execution if openwhisk client is unavailable
    }
  }

  if (localMainFn) {
    // Run asynchronously on next tick so the web action returns 202 immediately
    setImmediate(() => {
      Promise.resolve(localMainFn(payload)).catch(() => {});
    });
    return { invoked: 'local-background' };
  }
  return { invoked: 'noop' };
}
