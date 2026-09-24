export const MATE_STORAGE_TOKEN = Symbol('MATE_STORAGE_TOKEN');

export interface MateUpload {
  buffer: Buffer;
  mimetype: string;
}

export interface MateStorageProvider {
  remove(storageKey: string): Promise<void>;
  store(
    mateId: number,
    file: MateUpload,
  ): Promise<{ url: string; storageKey: string }>;
}
