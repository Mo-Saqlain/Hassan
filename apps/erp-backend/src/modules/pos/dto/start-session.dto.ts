import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StartSessionDto {
  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  openingFloat?: number;
}
