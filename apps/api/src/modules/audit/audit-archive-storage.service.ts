import { createHash } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from '@aws-sdk/client-s3';

type UploadArgs = {
  key: string;
  body: Buffer;
  checksumSha256: string;
  contentType: string;
  metadata?: Record<string, string>;
};

type UploadResult = {
  objectVersion: string | null;
  etag: string | null;
};

@Injectable()
export class AuditArchiveStorageService {
  private readonly logger = new Logger(AuditArchiveStorageService.name);
  private client: S3Client | null = null;
  private bucketVerified = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  isEnabled() {
    const endpoint = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_ENDPOINT'));
    const bucket = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_BUCKET'));
    const accessKey = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_ACCESS_KEY'));
    const secretKey = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_SECRET_KEY'));
    return Boolean(endpoint && bucket && accessKey && secretKey);
  }

  getBucket() {
    return this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_BUCKET'));
  }

  async uploadObject(args: UploadArgs): Promise<UploadResult> {
    const client = this.ensureClient();
    const bucket = this.getBucket();
    if (!bucket) {
      throw new Error('Missing AUDIT_ARCHIVE_S3_BUCKET.');
    }
    await this.ensureBucket(client, bucket);

    const out = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: args.key,
        Body: args.body,
        ContentType: args.contentType,
        ChecksumSHA256: args.checksumSha256,
        Metadata: args.metadata
      })
    );

    return {
      objectVersion: this.readString(out.VersionId) || null,
      etag: this.readString(out.ETag) || null
    };
  }

  async verifyObjectExists(key: string) {
    const client = this.ensureClient();
    const bucket = this.getBucket();
    if (!bucket) {
      throw new Error('Missing AUDIT_ARCHIVE_S3_BUCKET.');
    }
    await this.ensureBucket(client, bucket);

    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
  }

  async readObjectBuffer(key: string): Promise<Buffer> {
    const client = this.ensureClient();
    const bucket = this.getBucket();
    if (!bucket) {
      throw new Error('Missing AUDIT_ARCHIVE_S3_BUCKET.');
    }
    await this.ensureBucket(client, bucket);

    const out = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    const body = out.Body;
    if (!body) {
      throw new Error(`Archive object has no body: ${key}`);
    }

    if (typeof (body as any).transformToByteArray === 'function') {
      const bytes = await (body as any).transformToByteArray();
      return Buffer.from(bytes);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  }

  toBase64Sha256(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('base64');
  }

  toHexSha256(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private ensureClient() {
    if (this.client) {
      return this.client;
    }

    const endpoint = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_ENDPOINT'));
    const region = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_REGION'), 'us-east-1');
    const accessKeyId = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_ACCESS_KEY'));
    const secretAccessKey = this.readString(this.config.get<string>('AUDIT_ARCHIVE_S3_SECRET_KEY'));
    const forcePathStyle = this.toBool(this.config.get<string>('AUDIT_ARCHIVE_S3_FORCE_PATH_STYLE'), true);
    const tlsEnabled = this.toBool(this.config.get<string>('AUDIT_ARCHIVE_S3_TLS_ENABLED'), false);

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('Audit archive storage is not configured.');
    }

    const normalizedEndpoint = /^https?:\/\//i.test(endpoint)
      ? endpoint
      : `${tlsEnabled ? 'https' : 'http'}://${endpoint}`;

    const config: S3ClientConfig = {
      endpoint: normalizedEndpoint,
      region,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    };

    this.client = new S3Client(config);
    this.logger.log(`Audit archive storage initialized. endpoint=${normalizedEndpoint} bucket=${this.getBucket()}`);
    return this.client;
  }

  private async ensureBucket(client: S3Client, bucket: string) {
    if (this.bucketVerified) {
      return;
    }

    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.bucketVerified = true;
      return;
    } catch (error) {
      const code = String((error as { name?: string })?.name ?? '');
      if (!['NotFound', 'NoSuchBucket'].includes(code)) {
        throw error;
      }
    }

    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    this.bucketVerified = true;
    this.logger.log(`Created audit archive bucket: ${bucket}`);
  }

  private readString(value: unknown, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  private toBool(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = this.readString(value).toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }
}
