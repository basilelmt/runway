import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

const app = createApp();

if (existsSync(clientDist)) {
  app.use('/*', serveStatic({ root: clientDist }));
  app.get('*', serveStatic({ root: clientDist, path: 'index.html' }));
}

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Runway écoute sur http://localhost:${info.port}`);
});
