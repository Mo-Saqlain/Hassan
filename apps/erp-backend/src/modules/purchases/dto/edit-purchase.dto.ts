import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreatePurchaseDto } from './create-purchase.dto';

/**
 * Body for `PATCH /purchases/:id` — the bill as it SHOULD have been, plus why.
 * Full document rather than a partial patch, for the same reason as EditSaleDto:
 * the edit re-posts the bill from scratch.
 */
export class EditPurchaseDto extends CreatePurchaseDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
