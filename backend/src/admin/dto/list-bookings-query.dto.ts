import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  Max,
  Min,
  IsDateString,
} from 'class-validator';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;

export class ListBookingsQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  mateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  renterId?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
