import readline from 'readline';
import { hashAdminPasswordBcrypt } from '../server/admin/adminPasswordUtil.ts';

async function readPasswordFromStdin(): Promise<string> {
  if (process.env.NEW_ADMIN_PASSWORD && process.env.NEW_ADMIN_PASSWORD.trim().length > 0) {
    return process.env.NEW_ADMIN_PASSWORD.trim();
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: process.stdin.isTTY,
    });
    rl.question('Enter Admin password (minimum 12 characters): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const password = await readPasswordFromStdin();
  if (!password || password.length < 12) {
    console.error('Error: Admin password must be at least 12 characters long.');
    process.exit(1);
  }

  const hash = await hashAdminPasswordBcrypt(password, 12);
  console.log('\nAdd the following to your server environment secrets (never commit to source control):\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('');
}

main().catch((err) => {
  console.error('Failed to hash Admin password:', err);
  process.exit(1);
});
