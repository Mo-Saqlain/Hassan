import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Body for `POST /sales/:id/settle-commitment` — the customer is showing up
 * with cash for a previously-deferred portion of an invoice. Backend creates
 * a Receipt voucher, updates the commitment row, and posts the second
 * journal half (Dr Cash, Cr Deferred Cash Receivables).
 */
export class SettleCommitmentDto {
  @IsInt()
  @Min(0)
  commitmentIndex: number;

  @IsUUID()
  accountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  @IsOptional()
  paidOn?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
