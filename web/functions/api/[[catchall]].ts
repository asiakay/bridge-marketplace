// Cloudflare Pages Function: proxy all /api/* requests to the Worker.
// Set WORKER_URL in the Pages project's environment variables in the
// Cloudflare dashboard (Settings → Environment variables → Production):
//   WORKER_URL = https://bridge-marketplace-api.<subdomain>.workers.dev
export async function onRequest(context: {
  request: Request;
  env: { WORKER_URL?: string };
}): Promise<Response> {
  const { request, env } = context;

  if (!env.WORKER_URL) {
    return new Response(
      JSON.stringify({ error: 'WORKER_URL is not configured in Cloudflare Pages environment variables' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const base = env.WORKER_URL.replace(/\/$/, '');
  const target = base + url.pathname + url.search;

  try {
    return await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Could not reach API Worker', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
