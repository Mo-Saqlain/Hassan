import { IsString, MinLength } from 'class-validator';

export class ReauthenticateDto {
  @IsString()
  @MinLength(1)
  password: string;
}
