import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseReturnLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreatePurchaseReturnDto {
  @IsString()
  @IsOptional()
  returnNo?: string;

  @IsUUID()
  @IsOptional()
  purchaseId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  /** STOCK (default) = goods physically go back to the supplier. WARRANTY_CREDIT
   *  = pure financial supplier credit, no stock movement. See
   *  PurchaseReturn.disposition. */
  @IsIn(['STOCK', 'WARRANTY_CREDIT'])
  @IsOptional()
  disposition?: 'STOCK' | 'WARRANTY_CREDIT';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnLineDto)
  lines: CreatePurchaseReturnLineDto[];
}
