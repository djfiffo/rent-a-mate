import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Mirrors CreateMessageDto's validation (1-2000 trimmed chars) — kept as a
 * separate class rather than reused directly because it also carries
 * `bookingId`, which the REST DTO doesn't need (it comes from the route param). */
export class SendMessageSocketDto {
  @IsInt()
  @Min(1)
  bookingId!: number;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
