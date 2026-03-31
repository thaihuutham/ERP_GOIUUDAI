import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';

type CliOptions = {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  expiresIn: string;
  secret?: string;
};

const DEFAULTS: CliOptions = {
  sub: 'dev_user',
  email: 'dev@example.com',
  role: UserRole.ADMIN,
  tenantId: 'GOIUUDAI',
  expiresIn: '8h'
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (!arg.startsWith('--') || !next) {
      continue;
    }

    switch (arg) {
      case '--sub':
        options.sub = next;
        i += 1;
        break;
      case '--email':
        options.email = next;
        i += 1;
        break;
      case '--role': {
        const normalized = next.toUpperCase();
        if ((Object.values(UserRole) as string[]).includes(normalized)) {
          options.role = normalized as UserRole;
        }
        i += 1;
        break;
      }
      case '--tenant':
      case '--tenantId':
        options.tenantId = next;
        i += 1;
        break;
      case '--expires':
        options.expiresIn = next;
        i += 1;
        break;
      case '--secret':
        options.secret = next;
        i += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const secret = options.secret ?? process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('Missing JWT secret. Use --secret <value> or set JWT_SECRET in environment.');
  }

  const payload = {
    sub: options.sub,
    userId: options.sub,
    email: options.email,
    role: options.role,
    tenantId: options.tenantId
  };

  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: options.expiresIn
  });

  const result = {
    payload,
    expiresIn: options.expiresIn,
    token
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
