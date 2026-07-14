import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { DeliveryStatus } from '../entities/delivery.entity';

const STATUSES: DeliveryStatus[] = [
  'PENDING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'INSTALLATION_PENDING',
  'INSTALLED',
  'CANCELLED',
];

export class CreateDeliveryDto {
  @IsUUID()
  @IsOptional()
  saleId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  vehicle?: string;

  @IsIn(STATUSES)
  @IsOptional()
  status?: DeliveryStatus;

  @IsDateString()
  @IsOptional()
  scheduledFor?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * Explicit override for the Strict Delivery Handover safeguard. When `true`,
   * a delivery may be marked DELIVERED even though the linked sale still has an
   * outstanding balance — used when the shop intentionally hands over a
   * partially-paid item and leaves the residual on the customer's account.
   * The balance is untouched; it stays as A/R. Not a persisted column — the
   * service reads it, then strips it before saving the row.
   */
  @IsBoolean()
  @IsOptional()
  allowUnpaidHandover?: boolean;
}

export class UpdateDeliveryDto extends CreateDeliveryDto {}
