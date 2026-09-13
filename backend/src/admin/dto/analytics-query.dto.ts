import { IsOptional, IsString, Matches } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must use YYYY-MM-DD format' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must use YYYY-MM-DD format' })
  to?: string;
}
