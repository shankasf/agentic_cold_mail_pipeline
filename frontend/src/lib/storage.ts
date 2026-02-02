import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { logger } from './logger';

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';

// S3 Configuration
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'callsphere-inbound-emails';

// S3 Client singleton
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return s3Client;
}

// Storage interface for swappable providers
interface StorageProvider {
  save(buffer: Buffer, filename: string): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}

// Local disk storage provider
const localStorageProvider: StorageProvider = {
  async save(buffer: Buffer, filename: string): Promise<string> {
    const ext = path.extname(filename);
    const uniqueName = `${uuidv4()}${ext}`;
    const storagePath = path.join(STORAGE_PATH, uniqueName);

    await fs.mkdir(STORAGE_PATH, { recursive: true });
    await fs.writeFile(storagePath, buffer);

    return storagePath;
  },

  async read(storagePath: string): Promise<Buffer> {
    return fs.readFile(storagePath);
  },

  async delete(storagePath: string): Promise<void> {
    try {
      await fs.unlink(storagePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  },

  async exists(storagePath: string): Promise<boolean> {
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  },
};

// S3 storage provider
const s3StorageProvider: StorageProvider = {
  async save(buffer: Buffer, filename: string): Promise<string> {
    const client = getS3Client();
    const ext = path.extname(filename);
    const key = `uploads/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
    });

    await client.send(command);
    logger.debug('S3 object saved', { bucket: AWS_BUCKET_NAME, key });

    // Return S3 path in format s3://bucket/key
    return `s3://${AWS_BUCKET_NAME}/${key}`;
  },

  async read(storagePath: string): Promise<Buffer> {
    const client = getS3Client();

    // Parse S3 path: s3://bucket/key or just key
    let bucket = AWS_BUCKET_NAME;
    let key = storagePath;

    if (storagePath.startsWith('s3://')) {
      const parts = storagePath.slice(5).split('/');
      bucket = parts[0];
      key = parts.slice(1).join('/');
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    logger.debug('S3 object read', { bucket, key });
    return Buffer.concat(chunks);
  },

  async delete(storagePath: string): Promise<void> {
    const client = getS3Client();

    // Parse S3 path
    let bucket = AWS_BUCKET_NAME;
    let key = storagePath;

    if (storagePath.startsWith('s3://')) {
      const parts = storagePath.slice(5).split('/');
      bucket = parts[0];
      key = parts.slice(1).join('/');
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await client.send(command);
    logger.debug('S3 object deleted', { bucket, key });
  },

  async exists(storagePath: string): Promise<boolean> {
    const client = getS3Client();

    // Parse S3 path
    let bucket = AWS_BUCKET_NAME;
    let key = storagePath;

    if (storagePath.startsWith('s3://')) {
      const parts = storagePath.slice(5).split('/');
      bucket = parts[0];
      key = parts.slice(1).join('/');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  },
};

// Get the active storage provider
function getStorageProvider(): StorageProvider {
  if (STORAGE_TYPE === 's3') {
    return s3StorageProvider;
  }
  return localStorageProvider;
}

// Export storage functions
export const storage = {
  save: (buffer: Buffer, filename: string) => getStorageProvider().save(buffer, filename),
  read: (storagePath: string) => getStorageProvider().read(storagePath),
  delete: (storagePath: string) => getStorageProvider().delete(storagePath),
  exists: (storagePath: string) => getStorageProvider().exists(storagePath),
};

/**
 * S3-specific functions for direct S3 access (bypasses storage provider selection)
 * Used for reading inbound emails from SES S3 bucket
 */
export const s3Storage = {
  /**
   * Read raw data from S3 bucket/key
   */
  async readFromBucket(
    bucket: string,
    key: string
  ): Promise<{ success: boolean; data?: Buffer; contentType?: string; error?: string }> {
    try {
      const client = getS3Client();

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await client.send(command);

      if (!response.Body) {
        return { success: false, error: 'Empty response body' };
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      logger.debug('S3 object read from bucket', { bucket, key, size: data.length });
      return {
        success: true,
        data,
        contentType: response.ContentType,
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return { success: false, error: 'Object not found' };
      }
      logger.error('Failed to read from S3', error, { bucket, key });
      return {
        success: false,
        error: error.message || 'Failed to read from S3',
      };
    }
  },

  /**
   * Save data to a specific S3 bucket/key
   */
  async saveToBucket(
    bucket: string,
    key: string,
    data: Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = getS3Client();

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType || 'application/octet-stream',
        Metadata: options?.metadata,
      });

      await client.send(command);
      logger.debug('S3 object saved to bucket', { bucket, key });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to save to S3', error, { bucket, key });
      return {
        success: false,
        error: error.message || 'Failed to save to S3',
      };
    }
  },

  /**
   * Check if object exists in S3
   */
  async existsInBucket(bucket: string, key: string): Promise<boolean> {
    try {
      const client = getS3Client();

      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  },

  /**
   * Delete object from S3
   */
  async deleteFromBucket(bucket: string, key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = getS3Client();

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await client.send(command);
      logger.debug('S3 object deleted from bucket', { bucket, key });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete from S3', error, { bucket, key });
      return {
        success: false,
        error: error.message || 'Failed to delete from S3',
      };
    }
  },

  /**
   * Generate a storage path for attachments
   */
  generateAttachmentPath(inboundEmailId: string, filename: string): string {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `attachments/${inboundEmailId}/${sanitizedFilename}`;
  },

  /**
   * Get the default bucket name
   */
  getDefaultBucket(): string {
    return AWS_BUCKET_NAME;
  },
};

export default storage;
