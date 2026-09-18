import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DAY_NAMES: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

const toDayNumber = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') return DAY_NAMES[value.trim().toUpperCase()] ?? Number(value);
  return value;
};

export class UpdateMateAvailabilityDto {
  @IsOptional()
  @Transform(toDayNumber)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
}
