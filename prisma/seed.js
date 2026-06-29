const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@agency.com';
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  console.log('Seeding default admin account...');
  
  // Check if admin already exists
  const existingAdmin = await prisma.admin.findUnique({
    where: { email }
  });
  
  if (existingAdmin) {
    console.log(`Admin account with email ${email} already exists.`);
    return;
  }
  
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  
  const newAdmin = await prisma.admin.create({
    data: {
      email,
      passwordHash,
      name: 'Agency Admin'
    }
  });
  
  console.log(`Default admin account seeded successfully: ${newAdmin.email}`);
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
