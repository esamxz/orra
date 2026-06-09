import type { R2Signer } from './r2Signer.js';

// ---------------------------------------------------------------------------
// Real R2 presigned PUT URL signer
// ---------------------------------------------------------------------------
// Generates AWS Signature Version 4 presigned URLs for Cloudflare R2.
//
// Uses Web Crypto APIs (available in Cloudflare Workers) to compute HMAC-SHA256
// and SHA-256 hashes. No Node-only crypto dependencies.
//
// Client usage:
//   1. Server returns { url, headers: { 'Content-Type': ... }, expiresAt }
//   2. Browser PUTs the file bytes to url with the exact Content-Type header
//   3. R2 accepts the upload if the signature and header match
//
// R2 bucket CORS requirements:
//   - Allowed methods: PUT
//   - Allowed headers: Content-Type
//   - Allowed origins: app domain and staging domain
//   - No public read URL configured yet
//
// Upload confirmation and public read URLs are out of scope for this phase.

const DEFAULT_REGION = 'auto';
const DEFAULT_SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

export interface Clock {
  now(): Date;
}

class DefaultClock implements Clock {
  now(): Date {
    return new Date();
  }
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatDatestamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function sha256Hex(message: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return toHex(buffer);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array | string, message: string): Promise<ArrayBuffer> {
  const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacHex(key: ArrayBuffer | Uint8Array | string, message: string): Promise<string> {
  const buffer = await hmacSha256(key, message);
  return toHex(buffer);
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function buildCanonicalQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

export class RealR2Signer implements R2Signer {
  constructor(
    private accountId: string,
    private bucketName: string,
    private accessKeyId: string,
    private secretAccessKey: string,
    private clock: Clock = new DefaultClock()
  ) {}

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: string }> {
    const now = this.clock.now();
    const timestamp = formatTimestamp(now);
    const datestamp = formatDatestamp(now);
    const host = `${this.accountId}.r2.cloudflarestorage.com`;

    const credentialScope = `${datestamp}/${DEFAULT_REGION}/${DEFAULT_SERVICE}/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': ALGORITHM,
      'X-Amz-Content-SHA256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Credential': credential,
      'X-Amz-Date': timestamp,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'content-type;host',
    };

    const canonicalUri = `/${encodePath(this.bucketName)}/${encodePath(key)}`;
    const canonicalQueryString = buildCanonicalQueryString(queryParams);

    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      timestamp,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = await getSignatureKey(
      this.secretAccessKey,
      datestamp,
      DEFAULT_REGION,
      DEFAULT_SERVICE
    );

    const signature = await hmacHex(signingKey, stringToSign);

    const finalUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    return {
      url: finalUrl,
      headers: {
        'Content-Type': contentType,
      },
      expiresAt,
    };
  }

  async createReadUrl(
    key: string,
    expiresInSeconds: number
  ): Promise<{ url: string; expiresAt: string }> {
    const now = this.clock.now();
    const timestamp = formatTimestamp(now);
    const datestamp = formatDatestamp(now);
    const host = `${this.accountId}.r2.cloudflarestorage.com`;

    const credentialScope = `${datestamp}/${DEFAULT_REGION}/${DEFAULT_SERVICE}/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': ALGORITHM,
      'X-Amz-Content-SHA256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Credential': credential,
      'X-Amz-Date': timestamp,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    };

    const canonicalUri = `/${encodePath(this.bucketName)}/${encodePath(key)}`;
    const canonicalQueryString = buildCanonicalQueryString(queryParams);

    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders = 'host';

    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      timestamp,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = await getSignatureKey(
      this.secretAccessKey,
      datestamp,
      DEFAULT_REGION,
      DEFAULT_SERVICE
    );

    const signature = await hmacHex(signingKey, stringToSign);

    const finalUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    return {
      url: finalUrl,
      expiresAt,
    };
  }
}
