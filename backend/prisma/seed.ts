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
    await db.orm.public.Province.create({
      id: province.provinceCode,
      name: province.provinceNameTh,
    });
  }

  console.log('✅ Provinces seeded');

  // -------------------------
  // Seed Districts
  // -------------------------

  for (const district of districts) {
    await db.orm.public.District.create({
      id: district.districtCode,
      provinceId: district.provinceCode,
      name: district.districtNameTh,
    });
  }

  console.log('✅ Districts seeded');
  console.log('🎉 Database seed completed!');
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});