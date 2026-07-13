export function buildAppHashUrl(
  configuredBaseUrl: string,
  allowedOrigins: readonly string[],
  hashPath: string,
): string | null {
  try {
    const url = new URL(configuredBaseUrl.trim())
    const normalizedOrigins = new Set(
      allowedOrigins.map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean),
    )

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !normalizedOrigins.has(url.origin)
    ) {
      return null
    }

    url.pathname = `${url.pathname.replace(/\/$/, '')}/`
    url.search = ''
    url.hash = hashPath.startsWith('/') ? hashPath : `/${hashPath}`
    return url.toString()
  } catch {
    return null
  }
}
