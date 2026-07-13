const LOCAL_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

function configuredOrigins(): Set<string> {
  const configured = Deno.env.get('APP_ORIGIN') ?? ''
  const origins = new Set(
    configured
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )

  // Local origins are a development fallback only. Hosted deployments must set
  // APP_ORIGIN to their exact GitHub Pages/custom-domain origin(s).
  if (!Deno.env.get('DENO_DEPLOYMENT_ID')) {
    for (const origin of LOCAL_ORIGINS) origins.add(origin)
  }
  return origins
}

export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // Non-browser/server-to-server calls.
  return configuredOrigins().has(origin.replace(/\/$/, ''))
}

export function responseHeaders(request: Request): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  const origin = request.headers.get('origin')?.replace(/\/$/, '')
  if (origin && configuredOrigins().has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set(
      'Access-Control-Allow-Headers',
      'authorization, x-client-info, apikey, content-type',
    )
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  return headers
}

export function handlePreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  if (!requestOriginAllowed(request)) {
    return jsonResponse(request, 403, { error: 'Request unavailable.' })
  }
  return new Response(null, { status: 204, headers: responseHeaders(request) })
}

export function jsonResponse(request: Request, status: number, body: unknown): Response {
  const headers = responseHeaders(request)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

export async function readJson(request: Request, maxBytes = 32_768): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, 'Request unavailable.')
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, 'Request unavailable.')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError(400, 'Request unavailable.')
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(request, error.status, { error: error.message })
  }
  // Do not serialize provider/database/auth errors to a caller.
  return jsonResponse(request, 500, { error: 'Request unavailable.' })
}
