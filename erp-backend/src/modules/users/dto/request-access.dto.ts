import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestAccessDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  requestedUsername: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
