import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CreateMateAvailabilityDto } from './create-mate-availability.dto.js';

export class ReplaceMateAvailabilityDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMateAvailabilityDto)
  availability?: CreateMateAvailabilityDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMateAvailabilityDto)
  slots?: CreateMateAvailabilityDto[];

  // `windows` is accepted as an equivalent name for clients that model the
  // weekly schedule as a list of windows.  Exactly one of the two is used.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMateAvailabilityDto)
  windows?: CreateMateAvailabilityDto[];
}
