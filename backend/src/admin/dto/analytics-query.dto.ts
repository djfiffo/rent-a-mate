import {
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Temporal } from '@js-temporal/polyfill';

@ValidatorConstraint({ name: 'isCalendarDate', async: false })
export class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: string | undefined): boolean {
    if (value === undefined) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    try {
      Temporal.PlainDate.from(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid calendar date in YYYY-MM-DD format`;
  }
}

export class AnalyticsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must use YYYY-MM-DD format',
  })
  @Validate(IsCalendarDateConstraint)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must use YYYY-MM-DD format' })
  @Validate(IsCalendarDateConstraint)
  to?: string;
}
