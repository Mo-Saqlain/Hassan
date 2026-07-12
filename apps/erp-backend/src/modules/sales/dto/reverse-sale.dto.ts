import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ReverseSaleDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
