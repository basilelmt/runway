import { createPrivateKey, createSign, type KeyObject } from 'node:crypto';
import { BankProviderError } from './provider';

const b64url = (s: string) => Buffer.from(s).toString('base64url');

function readPrivateKey(pem: string): KeyObject {
  try {
    return createPrivateKey(pem);
  } catch {
    throw new BankProviderError("Clé privée Enable Banking illisible : colle le contenu complet du fichier .pem téléchargé à la création de l'application", 400, 'invalid_private_key');
  }
}

/** JWT RS256 attendu par Enable Banking : `kid` = Application ID, valable une heure. */
export function signJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const key = readPrivateKey(privateKeyPem);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const payload = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(key, 'base64url');
  return `${header}.${payload}.${signature}`;
}
