import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';

/** Body for `PATCH /payments/:id` — the voucher as it should have been, plus why. */
export class EditPaymentDto extends CreatePaymentDto {
  @IsString()
  @MinLength(1)
  reason: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
