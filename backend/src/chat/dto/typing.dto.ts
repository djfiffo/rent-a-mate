import { IsBoolean, IsInt, Min } from 'class-validator';

export class TypingDto {
  @IsInt()
  @Min(1)
  bookingId!: number;

  @IsBoolean()
  isTyping!: boolean;
}
