import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CheckoutDto {
  @IsIn(['CASH', 'CARD', 'BANK', 'CREDIT'])
  @IsOptional()
  paymentMethod?: 'CASH' | 'CARD' | 'BANK' | 'CREDIT';

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
