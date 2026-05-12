import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'])
  status: 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';

  @IsString()
  @IsOptional()
  notes?: string;
}
