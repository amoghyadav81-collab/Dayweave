// Creates private test configuration once; never replaces existing configuration.
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const target = resolve('.env.local');
if (existsSync(target)) {
  console.log('Existing .env.local preserved. Check APP_URL if this is a different Codespace.');
} else {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (name && (!domain || !/^[a-z0-9-]+$/.test(name) || !/^[a-z0-9.-]+$/.test(domain)))
    throw Error('Invalid or missing Codespaces forwarding configuration');
  const origin = name ? `https://${name}-3000.${domain}` : 'http://localhost:3000';
  writeFileSync(target, [
    `APP_URL=${origin}`,
    `DATABASE_PATH=${resolve('data/dayweave.sqlite')}`,
    `SIGNUP_INVITE_CODE=${randomBytes(32).toString('hex')}`,
    'OAUTH_REDIRECT_URIS=["https://chatgpt.com/connector_platform/oauth_redirect"]',
    '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  console.log('Private test configuration created. Retrieve your invitation privately from .env.local; never commit or paste it into chat.');
}
console.log('Run npm run dev. For ChatGPT testing, make port 3000 public in the Codespaces Ports tab.');
