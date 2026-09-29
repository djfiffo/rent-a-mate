import { Type } from 'class-transformer';
import { IsInt, Matches, Min } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mateId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  activityId!: number;

  @Matches(DATE_PATTERN, { message: 'date must use YYYY-MM-DD format' })
  date!: string;

  @Matches(TIME_PATTERN, { message: 'startTime must use HH:mm format' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime must use HH:mm format' })
  endTime!: string;
}
