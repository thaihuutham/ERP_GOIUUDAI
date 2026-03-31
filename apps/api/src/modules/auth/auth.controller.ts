import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() body: Record<string, unknown>) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @Public()
  refresh(@Body() body: Record<string, unknown>) {
    return this.authService.refresh(body);
  }

  @Post('logout')
  logout(@Req() req: { user?: Record<string, unknown> }) {
    return this.authService.logout(req.user);
  }

  @Post('change-password')
  changePassword(@Req() req: { user?: Record<string, unknown> }, @Body() body: Record<string, unknown>) {
    return this.authService.changePassword(req.user, body);
  }

  @Post('mfa/enroll')
  enrollMfa(@Req() req: { user?: Record<string, unknown> }) {
    return this.authService.enrollMfa(req.user);
  }

  @Post('mfa/verify-enroll')
  verifyMfaEnroll(@Req() req: { user?: Record<string, unknown> }, @Body() body: Record<string, unknown>) {
    return this.authService.verifyEnrollMfa(req.user, body);
  }

  @Post('mfa/verify-login')
  @Public()
  verifyMfaLogin(@Body() body: Record<string, unknown>) {
    return this.authService.verifyMfaLogin(body);
  }
}
