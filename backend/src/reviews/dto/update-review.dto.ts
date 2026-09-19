import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Both fields are optional at the class-validator level; `ReviewsService.update`
 * rejects a request where neither `rating` nor `comment` was supplied at all
 * (undefined), since a no-op PATCH indicates a client bug rather than a valid
 * partial edit.
 */
export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
