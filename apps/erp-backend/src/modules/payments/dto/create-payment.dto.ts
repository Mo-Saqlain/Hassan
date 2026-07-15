import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsOptional()
  voucherNo?: string;

  @IsIn(['IN', 'OUT'])
  direction: 'IN' | 'OUT';

  @IsUUID()
  accountId: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  /** OUT only — records a shop operating expense against an EXPENSE-category
   *  account (Dr expense / Cr cash-or-bank). Mutually the third kind of OUT
   *  voucher alongside supplier payment and customer loan. */
  @IsUUID()
  @IsOptional()
  expenseAccountId?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  referenceType?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
