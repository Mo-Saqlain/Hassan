import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ReversePaymentDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
