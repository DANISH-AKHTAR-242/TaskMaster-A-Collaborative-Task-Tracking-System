import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../../config/env.js';
import type { ObjectMetadata, ObjectStorage } from './object-storage.js';
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  constructor(
    private readonly env: Pick<
      Env,
      | 'S3_ENDPOINT'
      | 'S3_REGION'
      | 'S3_BUCKET'
      | 'S3_ACCESS_KEY'
      | 'S3_SECRET_KEY'
      | 'S3_FORCE_PATH_STYLE'
    >,
  ) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }
  presignUpload(key: string, contentType: string, expiresIn: number) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }
  presignDownload(key: string, expiresIn: number) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
      { expiresIn },
    );
  }
  async head(key: string): Promise<ObjectMetadata | null> {
    try {
      const o = await this.client.send(
        new HeadObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
      );
      if (o.ContentLength === undefined || o.ContentType === undefined) return null;
      return {
        sizeBytes: o.ContentLength,
        contentType: o.ContentType,
        ...(o.ChecksumSHA256
          ? { checksumSha256: Buffer.from(o.ChecksumSHA256, 'base64').toString('hex') }
          : {}),
      };
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        '$metadata' in e &&
        (e as { $metadata: { httpStatusCode?: number } }).$metadata.httpStatusCode === 404
      )
        return null;
      throw e;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }
}
