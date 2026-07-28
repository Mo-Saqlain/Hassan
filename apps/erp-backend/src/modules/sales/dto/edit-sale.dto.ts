import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateSaleDto } from './create-sale.dto';

/**
 * Body for `PATCH /sales/:id` — the sale as it SHOULD have been, plus why.
 *
 * It's a full document rather than a partial patch on purpose: an edit re-posts
 * the sale from scratch (stock, journal, serials, cost), so it needs the whole
 * corrected picture. Sending only the changed field would leave the rest to be
 * inferred, and "inferred" is how a correction quietly drops a line.
 */
export class EditSaleDto extends CreateSaleDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
