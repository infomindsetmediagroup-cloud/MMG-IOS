import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout, stderr, exit } from "node:process";
import { createInterface } from "node:readline/promises";

const reader = createInterface({ input: stdin, output: stdout });

try {
  const password = await reader.question("Enter the operator password to hash: ");
  if (password.length < 12) {
    stderr.write("Password must be at least 12 characters.\n");
    exit(1);
  }

  const confirmation = await reader.question("Confirm the operator password: ");
  if (password !== confirmation) {
    stderr.write("Passwords do not match.\n");
    exit(1);
  }

  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  stdout.write(`\nKAIROS_OPERATOR_PASSWORD_HASH=scrypt-v1$${salt.toString("hex")}$${derived.toString("hex")}\n`);
} finally {
  reader.close();
}
