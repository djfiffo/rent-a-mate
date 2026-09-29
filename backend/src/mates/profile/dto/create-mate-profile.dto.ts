import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMateProfileDto {
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(120)
  age!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  bio?: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  hourlyRate!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  provinceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId!: number;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  activityIds!: number[];

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  interestIds!: number[];
}
