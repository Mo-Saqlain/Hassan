import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RestoreDto {
  /** Must be the literal string "RESTORE" — guards against accidental wipes. */
  @IsString()
  @IsIn(['RESTORE'])
  confirm: 'RESTORE';

  /** The full snapshot object exactly as produced by /backup/download-now. */
  @IsObject()
  snapshot: { version?: number; data: Record<string, any[]> };

  /**
   * The signed-in user's current password. Re-asked at the point of
   * restore because this action wipes the live DB; we don't want a
   * borrowed/idle session to be enough to nuke the shop's data.
   */
  @IsString()
  @MinLength(1)
  password: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
