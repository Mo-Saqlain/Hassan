import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateSaleVoucherDto } from './create-sale-voucher.dto';

/**
 * Body for `PATCH /sales/voucher/:id` — the voucher as it SHOULD have been
 * (lines, discount, splits, commitments), plus why.
 *
 * Full document rather than a partial patch: the correction re-posts the sale and
 * re-issues its receipts, so it needs the whole picture. A partial patch would
 * leave the splits to be inferred, and inferring money is how a correction
 * silently loses a payment.
 */
export class EditSaleVoucherDto extends CreateSaleVoucherDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
