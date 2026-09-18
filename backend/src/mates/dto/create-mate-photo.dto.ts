import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** URL/key form used by local and test clients. */
export class CreateMatePhotoDto {
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/|\/|data:image\/)[^\s]+$/i)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  storageKey?: string;
}

/** Multipart requests provide the file separately and may omit URL metadata. */
export class UploadMatePhotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/|\/|data:image\/)[^\s]+$/i)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  storageKey?: string;
}
