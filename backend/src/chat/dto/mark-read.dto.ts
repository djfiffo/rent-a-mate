import { IsInt, Min } from 'class-validator';

export class MarkReadDto {
  @IsInt()
  @Min(1)
  bookingId!: number;
}
