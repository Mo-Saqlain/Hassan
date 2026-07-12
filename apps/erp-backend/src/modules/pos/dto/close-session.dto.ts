import { IsNumber, IsOptional, Min } from 'class-validator';

export class CloseSessionDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  closingAmount?: number;
}
