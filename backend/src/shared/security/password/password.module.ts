import { Module } from '@nestjs/common';
import { PasswordHashService } from './password-hash.service.js';
import { PASSWORD_SERVICE } from './password.tokens.js';

@Module({
  providers: [
    PasswordHashService,
    { provide: PASSWORD_SERVICE, useExisting: PasswordHashService },
  ],
  exports: [PasswordHashService, PASSWORD_SERVICE],
})
export class PasswordModule {}
