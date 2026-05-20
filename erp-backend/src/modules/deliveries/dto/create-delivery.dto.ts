import {
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
}

export class UpdateDeliveryDto extends CreateDeliveryDto {}
