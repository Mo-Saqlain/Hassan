import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateIncentiveTargetDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(['ITEM', 'BRAND'])
  basis: 'ITEM' | 'BRAND';

  @IsUUID()
  @IsOptional()
  itemId?: string;

  @IsUUID()
  @IsOptional()
  brandId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsInt()
  @Min(1)
  targetQuantity: number;

  @IsNumber()
  @Min(0)
  incentiveAmount: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
