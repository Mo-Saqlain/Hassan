import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseSessionDto {
  @IsNumber()
  @Min(0)
  actualClosing: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
