import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class RestoreDto {
  /** Must be the literal string "RESTORE" — guards against accidental wipes. */
  @IsString()
  @IsIn(['RESTORE'])
  confirm: 'RESTORE';

  /** The full snapshot object exactly as produced by /backup/download-now. */
  @IsObject()
  snapshot: { version?: number; data: Record<string, any[]> };

  @IsString()
  @IsOptional()
  notes?: string;
}
