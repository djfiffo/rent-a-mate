import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === true || value === 'true';

export class ListNotificationsQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean;
}
