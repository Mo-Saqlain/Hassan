import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateStockTransferDto } from './create-stock-transfer.dto';

/** Body for `PATCH /stock-transfers/:id` — the transfer as it should have been. */
export class EditStockTransferDto extends CreateStockTransferDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
