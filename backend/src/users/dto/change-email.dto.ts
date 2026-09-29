import { IsEmail, IsString, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  currentPassword!: string;
}
