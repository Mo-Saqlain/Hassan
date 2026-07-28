import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateSaleReturnDto } from './create-sale-return.dto';

/**
 * Body for `PATCH /sale-returns/:id` — the return as it should have been.
 *
 * The edit justification is `editReason`, not `reason`: a return already has a
 * `reason` of its own (why the customer brought the goods back), and the two are
 * different facts. "Customer says it rattles" is the return's reason; "quantity
 * was keyed as 2 instead of 1" is why the document was corrected.
 */
export class EditSaleReturnDto extends CreateSaleReturnDto {
  @IsString()
  @MinLength(1)
  editReason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
