import { IsInt, Max, Min } from 'class-validator';

export class SetScheduleDto {
  /** Hour of day (0–23) at which the daily backup should run. */
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;
}
