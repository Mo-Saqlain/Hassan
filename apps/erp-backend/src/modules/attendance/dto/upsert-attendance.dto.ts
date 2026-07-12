import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpsertAttendanceDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsIn(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'])
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';

  @IsString()
  @IsOptional()
  checkIn?: string;

  @IsString()
  @IsOptional()
  checkOut?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
