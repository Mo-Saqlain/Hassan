import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

const TYPES = [
  'SALARY',
  'ADVANCE',
  'REIMBURSEMENT',
  'EXPENSE',
  'INCENTIVE_PAYOUT',
  'ADJUSTMENT',
] as const;

export class CreateEmployeeTransactionDto {
  @IsUUID()
  employeeId: string;

  @IsIn(TYPES as unknown as string[])
  type: (typeof TYPES)[number];

  @IsDateString()
  @IsOptional()
  transactionDate?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  voucherNo?: string;
}
