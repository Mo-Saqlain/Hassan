import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ServiceTicketStatus } from '../entities/service-ticket.entity';

const STATUSES: ServiceTicketStatus[] = [
  'RECEIVED',
  'SENT_TO_COMPANY',
  'WAITING_PARTS',
  'UNDER_REPAIR',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'UNREPAIRABLE',
];

export class CreateServiceTicketDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  itemSerialId?: string;

  @IsString()
  @IsOptional()
  itemDescription?: string;

  @IsString()
  @MinLength(2)
  complaint: string;

  @IsBoolean()
  @IsOptional()
  inWarranty?: boolean;

  @IsIn(STATUSES)
  @IsOptional()
  status?: ServiceTicketStatus;

  @IsDateString()
  @IsOptional()
  receivedAt?: string;

  @IsDateString()
  @IsOptional()
  estimatedCompletion?: string;

  @IsString()
  @IsOptional()
  technicianNotes?: string;

  @IsString()
  @IsOptional()
  resolutionNotes?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedCost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  actualCost?: number;
}

export class UpdateServiceTicketDto extends CreateServiceTicketDto {
  @IsString()
  @IsOptional()
  declare complaint: string;
}
