import { createSign } from 'node:crypto';

const b64url = (s: string) => Buffer.from(s).toString('base64url');

/** JWT RS256 attendu par Enable Banking : `kid` = Application ID, valable une heure. */
export function signJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const payload = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKeyPem, 'base64url');
  return `${header}.${payload}.${signature}`;
}
