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

export class CreateSaleReturnLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  /**
   * Manufacturer serials of the physical units coming back. Optional, but
   * for `tracksSerials` items the salesman should provide one serial per
   * unit so the warranty status flips back to RETURNED on the original
   * appliance.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serials?: string[];
}

export class CreateSaleReturnDto {
  @IsString()
  @IsOptional()
  returnNo?: string;

  @IsUUID()
  @IsOptional()
  saleId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  /** What happens to the returned goods. Defaults to RESTOCK (back on the
   *  shelf). CLAIMED_TO_COMPANY = the unit went to the manufacturer; no stock
   *  re-enters and the serial is written off. See SaleReturn.disposition. */
  @IsIn(['RESTOCK', 'CLAIMED_TO_COMPANY'])
  @IsOptional()
  disposition?: 'RESTOCK' | 'CLAIMED_TO_COMPANY';

  /** Set when this return is the give-back leg of an exchange. */
  @IsUUID()
  @IsOptional()
  replacementSaleId?: string;

  /** Account the cash/bank refund went out of. Omit for a store-credit-only
   *  return (no money handed back). A CASH account makes the daily cash book
   *  count it as an OUT. */
  @IsUUID()
  @IsOptional()
  refundAccountId?: string;

  /** Amount actually refunded. Defaults to the return total when
   *  refundAccountId is set and this is omitted. */
  @IsNumber()
  @Min(0)
  @IsOptional()
  refundAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnLineDto)
  lines: CreateSaleReturnLineDto[];
}
