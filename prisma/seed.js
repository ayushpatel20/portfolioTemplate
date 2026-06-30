const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding default admin and editor accounts...');
  
  // Seed Primary Admin (username 'admin', password 'admin123')
  const existingAdmin = await prisma.admin.findUnique({
    where: { email: 'admin' }
  });
  
  if (!existingAdmin) {
    const adminHash = await bcrypt.hash('admin123', 10);
    const newAdmin = await prisma.admin.create({
      data: {
        email: 'admin',
        passwordHash: adminHash,
        name: 'Super Admin',
        role: 'Admin'
      }
    });
    console.log(`Seeded account: ${newAdmin.email} (Role: ${newAdmin.role})`);
  } else {
    console.log('Admin account already exists.');
  }

  // Seed Editor (username 'editor', password 'editor123')
  const existingEditor = await prisma.admin.findUnique({
    where: { email: 'editor' }
  });

  if (!existingEditor) {
    const editorHash = await bcrypt.hash('editor123', 10);
    const newEditor = await prisma.admin.create({
      data: {
        email: 'editor',
        passwordHash: editorHash,
        name: 'Content Editor',
        role: 'Editor'
      }
    });
    console.log(`Seeded account: ${newEditor.email} (Role: ${newEditor.role})`);
  } else {
    console.log('Editor account already exists.');
  }
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
