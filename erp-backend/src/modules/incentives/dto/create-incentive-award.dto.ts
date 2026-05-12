import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateIncentiveAwardDto {
  @IsUUID()
  @IsOptional()
  targetId?: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsDateString()
  awardedOn: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsDateString()
  @IsOptional()
  periodStart?: string;

  @IsDateString()
  @IsOptional()
  periodEnd?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
