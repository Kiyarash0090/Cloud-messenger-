/**
 * Basic E2EE using Web Crypto API.
 * In a real app, you'd use a more sophisticated key exchange (Signal protocol).
 * Here we'll simulate it by using a fixed derivation or a simplified exchange.
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';

export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(exported);
}

export async function importPublicKey(jwkString: string) {
  return await window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(jwkString),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );
}

export async function importPrivateKey(jwkString: string) {
  return await window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(jwkString),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );
}

export async function encryptText(text: string, publicKey: CryptoKey) {
  const encoded = new TextEncoder().encode(text);
  // RSA-OAEP for small data (like a session key) or direct text if short.
  // For chat, we usually encrypt a session key with RSA, then data with AES.
  // We'll simplify: just encrypt the text if it's short, or a placeholder AES key.
  // Actually, let's just use AES-GCM with a derived key from a static password for this demo's simplicity,
  // but label it as E2EE placeholders.
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encoded
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export async function decryptText(encryptedBase64: string, privateKey: CryptoKey) {
  const encrypted = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

// For large messages, we use AES-GCM
export async function encryptMessage(text: string, aesKey: CryptoKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  return {
    cipherText: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decryptMessage(cipherTextBase64: string, ivBase64: string, aesKey: CryptoKey) {
  const cipherText = new Uint8Array(atob(cipherTextBase64).split('').map(c => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    cipherText
  );
  return new TextDecoder().decode(decrypted);
}
