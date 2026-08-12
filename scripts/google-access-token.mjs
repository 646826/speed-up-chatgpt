import crypto from 'node:crypto';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function main() {
  const rawCredentials = process.env.GOOGLE_CREDENTIALS;
  if (!rawCredentials) throw new Error('GOOGLE_CREDENTIALS is required.');
  const credentials = JSON.parse(rawCredentials);
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;
  if (!clientEmail || !privateKey) throw new Error('GOOGLE_CREDENTIALS must contain client_email and private_key.');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaimSet = base64url(JSON.stringify(claimSet));
  const signingInput = `${encodedHeader}.${encodedClaimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const assertion = `${signingInput}.${base64url(signer.sign(privateKey))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Failed to mint access token: ${JSON.stringify(data)}`);
  process.stdout.write(data.access_token);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
