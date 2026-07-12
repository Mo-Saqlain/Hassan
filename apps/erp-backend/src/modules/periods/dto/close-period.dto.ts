import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ClosePeriodDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
