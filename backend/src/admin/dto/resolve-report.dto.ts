import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveReportDto {
  @IsIn(['reviewed', 'dismissed', 'actioned'])
  status: 'reviewed' | 'dismissed' | 'actioned';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  resolutionNote?: string;
}
