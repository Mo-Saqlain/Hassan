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
   * Legacy password field — retained as a fallback for callers that
   * haven't moved to the reauth-token flow yet. Prefer the `X-Reauth-Token`
   * header obtained from `POST /auth/reauthenticate`. When both are
   * present, the header wins.
   */
  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
