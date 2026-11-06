#!/usr/bin/env node
// Make an ADMIN_PASSWORDS entry for the quote admin (/admin/).
//
//   node bin/admin-password.mjs someone@example.com            # generates a password
//   node bin/admin-password.mjs someone@example.com 'their pw' # hashes one you chose
//
// Prints the password (once — it is not stored anywhere) and the `email:hash`
// entry. Put the entry in the ADMIN_PASSWORDS Worker secret, comma-separated
// with any others, then deploy. The address must also be in ADMIN_EMAILS.
// The hash matches src/lib/admin-auth.ts: PBKDF2-SHA256, 100 000 rounds,
// 16-byte salt, 32-byte output, both base64url.

import { webcrypto } from 'node:crypto';

const ITERATIONS = 100_000;
const [, , rawEmail, chosen] = process.argv;
const email = (rawEmail ?? '').trim().toLowerCase();
if (!email.includes('@')) {
  console.error('usage: node bin/admin-password.mjs <email> [password]');
  process.exit(2);
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

function generate() {
  // Letters and digits that are not confused with each other, four groups of
  // four: easy to read out over the phone and to type on a phone keyboard.
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = webcrypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

const password = chosen ?? generate();
if (password.length < 10) {
  console.error('Use at least 10 characters.');
  process.exit(2);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
const hash = `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;

console.log(`Password (give this to the person, it is not stored):\n\n  ${password}\n`);
console.log(`ADMIN_PASSWORDS entry:\n\n  ${email}:${hash}\n`);
