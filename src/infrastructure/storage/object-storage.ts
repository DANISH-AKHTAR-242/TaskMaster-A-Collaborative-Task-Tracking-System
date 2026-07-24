export interface ObjectMetadata {
  sizeBytes: number;
  contentType: string;
  checksumSha256?: string;
}
export interface ObjectStorage {
  presignUpload(key: string, contentType: string, expiresIn: number): Promise<string>;
  presignDownload(key: string, expiresIn: number): Promise<string>;
  head(key: string): Promise<ObjectMetadata | null>;
  delete(key: string): Promise<void>;
}
