import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  Max,
  Min,
  Matches,
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
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
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
