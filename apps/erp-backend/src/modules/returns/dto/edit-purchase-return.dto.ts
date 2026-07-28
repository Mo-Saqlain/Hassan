import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreatePurchaseReturnDto } from './create-purchase-return.dto';

/**
 * Body for `PATCH /purchase-returns/:id`. `editReason` rather than `reason` for
 * the same reason as EditSaleReturnDto: the return carries its own `reason`.
 */
export class EditPurchaseReturnDto extends CreatePurchaseReturnDto {
  @IsString()
  @MinLength(1)
  editReason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
