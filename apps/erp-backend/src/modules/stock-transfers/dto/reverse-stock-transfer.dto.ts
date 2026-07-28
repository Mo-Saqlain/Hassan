import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Body for `POST /stock-transfers/:id/reverse`. */
export class ReverseStockTransferDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
