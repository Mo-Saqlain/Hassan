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

/** A unit the customer is giving back. */
export class ExchangeReturnLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  /** Serials of the physical units coming back (one per unit for serialised
   *  items). RESTOCK → flipped to RETURNED; CLAIMED_TO_COMPANY → WRITE_OFF. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serials?: string[];
}

/** A unit the customer is taking away in the swap. */
export class ExchangeSaleLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serials?: string[];
}

/** Optional manufacturer credit for a CLAIMED_TO_COMPANY give-back — the
 *  amount the company put on our ledger (typed by the operator). */
export class ExchangeSupplierCreditDto {
  @IsUUID()
  supplierId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateExchangeDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  /** The original invoice the returned goods came from, for traceability. */
  @IsUUID()
  @IsOptional()
  originalSaleId?: string;

  /** Where the returned goods go. RESTOCK (default) = back on the shelf;
   *  CLAIMED_TO_COMPANY = the unit went to the manufacturer (no restock). */
  @IsIn(['RESTOCK', 'CLAIMED_TO_COMPANY'])
  @IsOptional()
  returnDisposition?: 'RESTOCK' | 'CLAIMED_TO_COMPANY';

  @IsString()
  @IsOptional()
  returnReason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeReturnLineDto)
  returnLines: ExchangeReturnLineDto[];

  @ValidateNested()
  @Type(() => ExchangeSupplierCreditDto)
  @IsOptional()
  supplierCredit?: ExchangeSupplierCreditDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeSaleLineDto)
  saleLines: ExchangeSaleLineDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  /** Cash the customer hands over now to cover the price difference. Requires
   *  paymentAccountId when > 0. */
  @IsNumber()
  @Min(0)
  @IsOptional()
  paymentAmount?: number;

  /** Account the cash difference lands in (a CASH/BANK account). */
  @IsUUID()
  @IsOptional()
  paymentAccountId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
