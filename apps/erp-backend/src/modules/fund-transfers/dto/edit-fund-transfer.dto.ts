import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreateFundTransferDto } from './create-fund-transfer.dto';

/** Body for `PATCH /fund-transfers/:id` — the transfer as it should have been. */
export class EditFundTransferDto extends CreateFundTransferDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
