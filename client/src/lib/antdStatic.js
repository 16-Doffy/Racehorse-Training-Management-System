import { App } from 'antd';

/**
 * Context-aware replacements for Ant Design's static `message` / `notification` / `modal`.
 *
 * Calling `message.success(...)` straight off the `antd` import uses a detached instance that
 * can't read the ConfigProvider theme, which AntD v6 warns about on every call. The supported fix
 * is `App.useApp()`, but that's a hook — unusable in plain functions (mutation callbacks, socket
 * handlers). This keeps the same call sites working: `<StaticAntdApi />` renders inside <App> and
 * hands its context-bound instances to the proxies below, so `import { message } from
 * '../lib/antdStatic'` behaves exactly like the static import minus the warning.
 */
let instances = {};

export function StaticAntdApi() {
  // Assigned during render (AntD documents this exact shim) so the instances are available to any
  // callback that fires after the first paint, rather than one effect-tick later.
  instances = App.useApp();
  return null;
}

const proxyFor = (key) =>
  new Proxy(
    {},
    {
      get:
        (_target, method) =>
        (...args) =>
          instances[key]?.[method]?.(...args),
    }
  );

export const message = proxyFor('message');
export const notification = proxyFor('notification');
export const modal = proxyFor('modal');
