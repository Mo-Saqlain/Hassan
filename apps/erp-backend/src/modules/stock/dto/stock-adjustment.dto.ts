import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class StockAdjustmentDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsIn(['IN', 'OUT'])
  type: 'IN' | 'OUT';

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  note?: string;
}
