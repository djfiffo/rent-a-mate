import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

export class ListReportsQueryDto {
  @IsOptional()
  @IsIn(['open', 'reviewed', 'dismissed', 'actioned'])
  status?: 'open' | 'reviewed' | 'dismissed' | 'actioned';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit?: number;
}
