// Custom service-worker code. next-pwa finds this file (customWorkerSrc defaults
// to "worker"), bundles it to public/worker-<hash>.js and imports it into sw.js.
import { registerPushHandlers, type ServiceWorkerScopeLike } from "./push";

registerPushHandlers(self as unknown as ServiceWorkerScopeLike);
