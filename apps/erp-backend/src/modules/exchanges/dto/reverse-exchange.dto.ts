import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Body for `POST /exchanges/:saleReturnId/reverse`. */
export class ReverseExchangeDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
