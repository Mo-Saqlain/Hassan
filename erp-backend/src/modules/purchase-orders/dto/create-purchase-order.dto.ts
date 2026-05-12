import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class PurchaseOrderLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  expectedUnitCost: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId: string;

  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @IsIn(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'])
  @IsOptional()
  status?: 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  poNo?: string;
}
