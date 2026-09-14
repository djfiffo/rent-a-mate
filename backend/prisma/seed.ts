import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { db } from '../src/prisma/db.js';

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

  console.log('🎉 Database seed completed!');
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});