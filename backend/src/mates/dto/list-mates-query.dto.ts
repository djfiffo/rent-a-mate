import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsDateString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { MateSort } from '../mate-discovery.types.js';

const SORTS: MateSort[] = ['rating', '-rating', 'rate', '-rate', 'createdAt', '-createdAt'];

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

const toDecimal = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : String(value);

@ValidatorConstraint({ name: 'rateRange', async: false })
class RateRangeConstraint implements ValidatorConstraintInterface {
  validate(maxRate: string | undefined, args: ValidationArguments): boolean {
    const minRate = (args.object as ListMatesQueryDto).minRate;
    return minRate === undefined || maxRate === undefined || Number(minRate) <= Number(maxRate);
  }

  defaultMessage(): string {
    return 'minRate must be less than or equal to maxRate';
  }
}

export class ListMatesQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  activityId?: number[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  interestId?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  provinceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  districtId?: number;

  @IsOptional()
  @Transform(toDecimal)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  @MaxLength(30)
  minRate?: string;

  @IsOptional()
  @Transform(toDecimal)
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  @MaxLength(30)
  @Validate(RateRangeConstraint)
  maxRate?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  availableDate?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsIn(SORTS)
  sort?: MateSort;

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
