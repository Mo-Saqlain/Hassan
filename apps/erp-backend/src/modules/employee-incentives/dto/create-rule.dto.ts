import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateRuleDto {
  @IsUUID()
  employeeId: string;

  @IsIn(['ALL_SALES', 'CATEGORY', 'ITEM', 'BRAND'])
  basis: 'ALL_SALES' | 'CATEGORY' | 'ITEM' | 'BRAND';

  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;

  @IsDateString()
  @IsOptional()
  startsOn?: string;

  @IsDateString()
  @IsOptional()
  endsOn?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
