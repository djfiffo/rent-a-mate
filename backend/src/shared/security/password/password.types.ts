export interface PasswordService {
  verify(plainText: string, encodedHash: string): Promise<boolean>;
  hash(plainText: string): Promise<string>;
}
