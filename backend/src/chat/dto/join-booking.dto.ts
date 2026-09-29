import { IsInt, Min } from 'class-validator';

export class JoinBookingDto {
  @IsInt()
  @Min(1)
  bookingId!: number;
}
