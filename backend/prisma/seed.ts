import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { db } from '../src/prisma/db.js';
import { PasswordHashService } from '../src/shared/security/password/password-hash.service.js';

type ProvinceData = {
  id: number;
  provinceCode: number;
  provinceNameEn: string;
  provinceNameTh: string;
};

type DistrictData = {
  id: number;
  provinceCode: number;
  districtCode: number;
  districtNameEn: string;
  districtNameTh: string;
  postalCode: number;
};

async function loadJson<T>(fileName: string): Promise<T> {
  const filePath = resolve(
    process.cwd(),
    'prisma',
    'data',
    fileName,
  );

  const content = await readFile(filePath, 'utf-8');

  return JSON.parse(content) as T;
}

async function main() {
  console.log('🌱 Starting database seed...');

  const provinces = await loadJson<ProvinceData[]>(
    'provinces.json',
  );

  const districts = await loadJson<DistrictData[]>(
    'districts.json',
  );

  console.log(`Found ${provinces.length} provinces`);
  console.log(`Found ${districts.length} districts`);

  // -------------------------
  // Seed Provinces
  // -------------------------

  for (const province of provinces) {
    const existing = await db.orm.public.Province.where({ id: province.provinceCode }).first();
    if (!existing) {
      await db.orm.public.Province.create({
        id: province.provinceCode,
        name: province.provinceNameTh,
      });
    }
  }

  console.log('✅ Provinces seeded');

  // -------------------------
  // Seed Districts
  // -------------------------

  for (const district of districts) {
    const existing = await db.orm.public.District.where({ id: district.districtCode }).first();
    if (!existing) {
      await db.orm.public.District.create({
        id: district.districtCode,
        provinceId: district.provinceCode,
        name: district.districtNameTh,
      });
    }
  }

  console.log('✅ Districts seeded');

  // -------------------------
  // Seed Activities
  // -------------------------
  const activities = [
    'Cafe',
    'Gaming',
    'Study',
    'Gym',
    'Events',
    'City walks',
    'เดินเล่น',
    'ดูหนัง',
    'พาเที่ยว',
    'ช่วยเคลื่อนย้าย',
    'ช่วยการบ้าน',
    'ช่วยเรียน',
    'เล่นกีฬา',
    'ช่วยสัมภาษณ์',
    'ซ่อมบ้าน',
    'ช่วยที่อุบ',
  ];

  for (const name of activities) {
    const existing = await db.orm.public.Activity.where({ name }).first();
    if (!existing) {
      await db.orm.public.Activity.create({ name });
    }
  }
  console.log('✅ Activities seeded');

  // -------------------------
  // Seed Interests
  // -------------------------
  const interests = [
    'ท่องเที่ยว',
    'กีฬา',
    'ศิลปะ',
    'เทคโนโลยี',
    'ดนตรี',
    'การถ่ายภาพ',
    'อ่านหนังสือ',
    'การออกแบบ',
    'โยคะ',
    'เกม',
    'หนังสือการ์ตูน',
    'อาหาร',
    'ธรรมชาติ',
  ];

  for (const name of interests) {
    const existing = await db.orm.public.Interest.where({ name }).first();
    if (!existing) {
      await db.orm.public.Interest.create({ name });
    }
  }
  console.log('✅ Interests seeded');

  const demoPassword = process.env['DEMO_ACCOUNT_PASSWORD'];
  if (demoPassword) {
    const bangkok = provinces.find((province) => province.provinceNameEn === 'Bangkok');
    const district = districts.find((item) => item.provinceCode === bangkok?.provinceCode);
    if (!bangkok || !district) throw new Error('Bangkok demo location is missing');

    const password = await new PasswordHashService().hash(demoPassword);
    const demos = [
      {
        name: 'Nan', email: 'nan.demo@matefor.invalid', bio: 'Coffee, conversation, and the best little places in Bangkok.',
        rate: 350, image: '/images/figma/nan.png', activities: ['Cafe', 'City walks'],
      },
      {
        name: 'Mew', email: 'mew.demo@matefor.invalid', bio: 'Game nights, study sessions, and good company.',
        rate: 420, image: '/images/figma/mew.png', activities: ['Gaming', 'Study'],
      },
      {
        name: 'Ploy', email: 'ploy.demo@matefor.invalid', bio: 'Exploring events and staying active around the city.',
        rate: 390, image: null, activities: ['Gym', 'Events'],
      },
    ] as const;

    for (const demo of demos) {
      let user = await db.orm.public.User.where({ email: demo.email }).first();
      if (!user) {
        user = await db.orm.public.User.create({
          name: demo.name, email: demo.email, password, role: 'mate', isVerified: true,
        });
      }
      let mate = await db.orm.public.Mate.where({ userId: user.id }).first();
      if (!mate) {
        mate = await db.orm.public.Mate.create({
          userId: user.id, age: 25, bio: demo.bio, hourlyRate: String(demo.rate),
          provinceId: bangkok.provinceCode, districtId: district.districtCode,
          profileImageUrl: demo.image, isActive: true,
        });
      }
      for (const name of demo.activities) {
        const activity = await db.orm.public.Activity.where({ name }).first();
        if (!activity) throw new Error(`Demo activity ${name} is missing`);
        const link = await db.orm.public.MateActivity.where({ mateId: mate.id, activityId: activity.id }).first();
        if (!link) await db.orm.public.MateActivity.create({ mateId: mate.id, activityId: activity.id });
      }
      if (demo.image) {
        const photo = await db.orm.public.MatePhoto.where({ mateId: mate.id, sortOrder: 0 }).first();
        if (!photo) await db.orm.public.MatePhoto.create({ mateId: mate.id, url: demo.image, sortOrder: 0 });
      }
      const availability = await db.orm.public.MateAvailability.where({
        mateId: mate.id, dayOfWeek: 1, startTime: '09:00', endTime: '17:00',
      }).first();
      if (!availability) {
        await db.orm.public.MateAvailability.create({
          mateId: mate.id, dayOfWeek: 1, startTime: '09:00', endTime: '17:00',
        });
      }
    }
    console.log('✅ Demo mates seeded');

    const renterEmail = 'pat.demo@matefor.invalid';
    const existingRenter = await db.orm.public.User.where({ email: renterEmail }).first();
    if (!existingRenter) {
      await db.orm.public.User.create({
        name: 'Pat Demo',
        email: renterEmail,
        password,
        role: 'renter',
        isVerified: true,
      });
    }
    console.log('✅ Demo renter seeded');
  }

  console.log('🎉 Database seed completed!');
}

try {
  await main();
} catch (error) {
  console.error('❌ Seed failed:', error);
  process.exitCode = 1;
} finally {
  await db.close();
}
