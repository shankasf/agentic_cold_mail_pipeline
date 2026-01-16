import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Get admin credentials from environment variables
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required for seeding.');
    console.log('Please set these variables in your .env file.');
    process.exit(1);
  }

  console.log('Seeding database...');

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail.toLowerCase() },
  });

  if (existingAdmin) {
    console.log(`Admin user already exists: ${adminEmail}`);
    return;
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Create the admin user
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail.toLowerCase(),
      passwordHash,
      name: 'Administrator',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`Created admin user: ${adminUser.email}`);
  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
