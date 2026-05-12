import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class StockTransferLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateStockTransferDto {
  @IsUUID()
  fromStoreId: string;

  @IsUUID()
  toStoreId: string;

  @IsDateString()
  @IsOptional()
  transferDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferLineDto)
  lines: StockTransferLineDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  transferNo?: string;
}
