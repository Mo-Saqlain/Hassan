import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ReversePurchaseDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
