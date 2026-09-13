export interface MateRecord {
  id: number;
  userId: number;
  age: number;
  bio: string;
  hourlyRate: number;
  provinceId: number;
  districtId: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MateLookup {
  id: number;
  name: string;
}

export interface MateProfile {
  id: number;
  user: { id: number; name: string };
  age: number;
  bio: string;
  hourlyRate: number;
  province: MateLookup;
  district: MateLookup;
  activities: MateLookup[];
  interests: MateLookup[];
  createdAt: unknown;
  updatedAt: unknown;
}

interface Query<T> {
  first(): Promise<T | null>;
  all(): Promise<T[]>;
  update(data: object): Promise<T | null>;
  delete(): Promise<void>;
}

interface Model<T> {
  where(filters: Record<string, unknown>): Query<T>;
  create(data: Record<string, unknown>): Promise<T>;
}

interface MateOrm {
  User: Model<{ id: number; name: string }>;
  Mate: Model<MateRecord>;
  Province: Model<{ id: number; name: string }>;
  District: Model<{ id: number; provinceId: number; name: string }>;
  Activity: Model<{ id: number; name: string }>;
  Interest: Model<{ id: number; name: string }>;
  MateActivity: Model<{ mateId: number; activityId: number }>;
  MateInterest: Model<{ mateId: number; interestId: number }>;
  MateAvailability: Model<MateAvailabilityRecord>;
}

export interface MateDatabase {
  transaction<T>(callback: (transaction: MateDatabase) => Promise<T>): Promise<T>;
  orm: { public: MateOrm };
}

export interface MateUpdate {
  age?: number;
  bio?: string;
  hourlyRate?: number;
  provinceId?: number;
  districtId?: number;
}

export interface MateAvailabilityRecord {
  id: number;
  mateId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdAt: unknown;
  updatedAt: unknown;
}

