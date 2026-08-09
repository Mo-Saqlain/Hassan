import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
 * A single payment row inside a sale-voucher submission. Two flavours via
 * `kind`:
 *
 *  - `CASH` (default) — money lands in a real account (cash drawer / bank /
 *    wallet). Posts a `RCT-…` Receipt row + a journal pair
 *    `Dr <accountId> / Cr A/R (or Deferred Cash Receivables)`. `accountId`
 *    is required.
 *
 *  - `CUSTOMER_CREDIT` — applies the customer's existing on-account credit
 *    balance toward this bill. No Receipt row, no journal entry (the prior
 *    advance already moved cash and credited the customer's A/R at the
 *    time it was received — re-posting now would double-count). The Sale's
 *    paidAmount/dueAmount still drop so the Sale-level "settled" status is
 *    honest. `accountId` is omitted; `customerId` on the voucher header is
 *    required; the customer's pre-sale credit must cover the split amount.
 */
export class CreateSaleVoucherSplitDto {
  @IsIn(['CASH', 'CUSTOMER_CREDIT'])
  @IsOptional()
  kind?: 'CASH' | 'CUSTOMER_CREDIT';

  @IsUUID()
  @IsOptional()
  accountId?: string;

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

  @IsBoolean()
  @IsOptional()
  isBooked?: boolean;

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
