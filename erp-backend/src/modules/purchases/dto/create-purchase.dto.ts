import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseLineDto {
  @IsUUID()
  itemId: string;

  /**
   * Optional per-line store. If omitted, the purchase header's storeId is used.
   * Allowing per-line stores lets a single bill split goods across branches.
   */
  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  /**
   * Optional list of manufacturer serials for serialised items. Empty / omitted
   * is fine — the salesman can capture serials later at POS time. When provided,
   * count should match `quantity` but doesn't have to: any deficit is filled at
   * sale time, any excess is fine (the extra units are recorded as IN_STOCK).
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serials?: string[];
}

export class CreatePurchaseDto {
  @IsString()
  @IsOptional()
  billNo?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseLineDto)
  lines: CreatePurchaseLineDto[];
}
