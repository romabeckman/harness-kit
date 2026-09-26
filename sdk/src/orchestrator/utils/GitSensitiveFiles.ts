const sensitivePatterns = [
  /\.env($|\.)/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.crt$/i,
  /\.cer$/i,
  /\.kdbx$/i,
  /id_(rsa|dsa|ecdsa|ed25519)/i,
  /credentials(\.json)?$/i,
  /service[-_]account.*\.json$/i,
  /secrets?\.(json|yaml|yml)$/i,
  /\.aws\/credentials/i,
]

export function findSensitiveGitPaths(paths: string[]): string[] {
  return paths.filter(path => sensitivePatterns.some(pattern => pattern.test(path)))
}
