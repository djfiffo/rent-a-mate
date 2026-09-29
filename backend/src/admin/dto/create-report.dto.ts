import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  IsPositive,
} from 'class-validator';

export class CreateReportDto {
  @IsIn(['user', 'mate', 'booking', 'review', 'message'])
  targetType: 'user' | 'mate' | 'booking' | 'review' | 'message';

  @IsInt()
  @IsPositive()
  targetId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason: string;
}
