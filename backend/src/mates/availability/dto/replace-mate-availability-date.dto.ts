import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  Matches,
  ValidateNested,
} from 'class-validator';

export class MateAvailabilityDateSlotDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class ReplaceMateAvailabilityDateDto {
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => MateAvailabilityDateSlotDto)
  slots!: MateAvailabilityDateSlotDto[];
}
