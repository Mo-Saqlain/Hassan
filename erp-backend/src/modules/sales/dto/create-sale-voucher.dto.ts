import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreatePaymentCommitmentDto } from './create-sale.dto';

/**
 * Voucher line shape — extends the regular sale line with an optional
 * `serials` array for items flagged `tracksSerials`. One trimmed string
 * per physical unit (must match quantity when serialRequiredOnSale=true,
 * or be empty when serials are optional for the item).
 */
export class CreateSaleVoucherLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  serials?: string[];
}

/**
 * A single payment row inside a sale-voucher submission. Each split lands as
 * one Receipt voucher in the payments ledger plus a journal pair
 * Dr <accountId> / Cr A/R (or Deferred Cash Receivables).
 *
 * `accountId` is the destination account the cash physically lands in
 * (cash drawer, HBL bank, JazzCash wallet, …) — exactly what an OUT-of-band
 * receipt voucher would carry. The customer's account is taken from the
 * voucher header.
 */
export class CreateSaleVoucherSplitDto {
  @IsUUID()
  accountId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  /**
   * Optional free-text reference (e.g. "Cheque #12345", "JazzCash TX
   * 9F2K-PLM3") that gets written onto the Receipt voucher's notes column.
   */
  @IsString()
  @IsOptional()
  reference?: string;
}

/**
 * Bill-book style sale: header + lines + N payment splits, all written
 * atomically. The handler at `POST /sales/voucher` is the entry point.
 * If no splits are supplied the call still succeeds and behaves identically
 * to a CREDIT sale (full net on A/R).
 */
export class CreateSaleVoucherDto {
  @IsString()
  @IsOptional()
  invoiceNo?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  expectedPaymentDate?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentCommitmentDto)
  paymentCommitments?: CreatePaymentCommitmentDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleVoucherLineDto)
  lines: CreateSaleVoucherLineDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleVoucherSplitDto)
  splits?: CreateSaleVoucherSplitDto[];
}
