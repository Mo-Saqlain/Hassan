import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ReverseFundTransferDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
