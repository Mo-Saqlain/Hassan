import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePaymentCommitmentDto {
  @IsDateString()
  dueDate: string;

  @IsNumber()
  @Min(0.01)
  expectedAmount: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateSaleLineDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateSaleDto {
  @IsString()
  @IsOptional()
  invoiceNo?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number;

  @IsIn(['CASH', 'CARD', 'BANK', 'CREDIT'])
  @IsOptional()
  paymentMethod?: 'CASH' | 'CARD' | 'BANK' | 'CREDIT';

  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * Convenience field for the simplest case ("pay half now, half on the
   * 20th"). The service expands this into a single-entry paymentCommitments
   * array. If `paymentCommitments` is also supplied, that wins.
   */
  @IsDateString()
  @IsOptional()
  expectedPaymentDate?: string;

  /**
   * Full deferred-cash schedule. Used when the customer commits to >1
   * payment dates. Each entry must be `{ dueDate, expectedAmount }`; status
   * defaults to `PENDING` on create. Sum of `expectedAmount` should equal
   * the sale's residual (netAmount - paidAmount) — the service truncates or
   * pads with a final balancing entry if it doesn't.
   */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentCommitmentDto)
  paymentCommitments?: CreatePaymentCommitmentDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  lines: CreateSaleLineDto[];
}
