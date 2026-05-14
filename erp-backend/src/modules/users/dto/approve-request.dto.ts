import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;
}
