import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateDamagedGoodDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsIn(['DAMAGED', 'IN_REPAIR', 'WRITE_OFF'])
  @IsOptional()
  status?: 'DAMAGED' | 'IN_REPAIR' | 'WRITE_OFF';

  @IsDateString()
  @IsOptional()
  reportedOn?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
