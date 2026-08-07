// Cloudflare Pages Function: proxy all /api/* requests to the Worker.
// Set WORKER_URL in the Pages project's environment variables in the
// Cloudflare dashboard (Settings → Environment variables → Production):
//   WORKER_URL = https://bridge-marketplace-api.<subdomain>.workers.dev
export async function onRequest(context: {
  request: Request;
  env: { WORKER_URL?: string };
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const base = (env.WORKER_URL ?? 'http://localhost:8787').replace(/\/$/, '');
  const target = base + url.pathname + url.search;

  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}
