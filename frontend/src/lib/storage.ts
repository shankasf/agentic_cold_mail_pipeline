import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';

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

// S3 storage provider (placeholder for production)
const s3StorageProvider: StorageProvider = {
  async save(buffer: Buffer, filename: string): Promise<string> {
    // TODO: Implement S3 upload
    throw new Error('S3 storage not implemented. Set STORAGE_TYPE=local for development.');
  },

  async read(storagePath: string): Promise<Buffer> {
    // TODO: Implement S3 download
    throw new Error('S3 storage not implemented.');
  },

  async delete(storagePath: string): Promise<void> {
    // TODO: Implement S3 delete
    throw new Error('S3 storage not implemented.');
  },

  async exists(storagePath: string): Promise<boolean> {
    // TODO: Implement S3 exists check
    throw new Error('S3 storage not implemented.');
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

export default storage;
