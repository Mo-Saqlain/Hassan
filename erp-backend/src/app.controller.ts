import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/users/auth.decorators';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'erp-backend', time: new Date().toISOString() };
  }
}
