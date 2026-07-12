import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDamageStatusDto {
  @IsIn(['DAMAGED', 'IN_REPAIR', 'WRITE_OFF', 'REPAIRED'])
  status: 'DAMAGED' | 'IN_REPAIR' | 'WRITE_OFF' | 'REPAIRED';

  @IsString()
  @IsOptional()
  notes?: string;
}
