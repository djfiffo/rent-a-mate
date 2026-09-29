export interface MateRecord {
  id: number;
  userId: number;
  age: number | null;
  bio: string | null;
  hourlyRate: number;
  provinceId: number;
  districtId: number;
  profileImageUrl?: string | null;
  profileImageKey?: string | null;
  isActive?: boolean;
  deactiveAt?: unknown | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MatePhotoRecord {
  id: number;
  mateId: number;
  url: string;
  storageKey: string | null;
  sortOrder: number;
  createdAt: unknown;
}

export interface MateLookup {
  id: number;
  name: string;
}

export interface MateProfile {
  id: number;
  user: { id: number; name: string };
  age: number | null;
  bio: string | null;
  hourlyRate: number;
  isActive: boolean;
  deactivatedAt: unknown | null;
  province: MateLookup;
  district: MateLookup;
  activities: MateLookup[];
  interests: MateLookup[];
  photos: MatePhotoRecord[];
  availability: MateAvailabilityRecord[];
  createdAt: unknown;
  updatedAt: unknown;
}

interface Query<T> {
  first(): Promise<T | null>;
  all(): Promise<T[]>;
  update(data: object): Promise<T | null>;
  delete(): Promise<void>;
  deleteAndCount(): Promise<number>;
}

interface Model<T> {
  where(filters: Record<string, unknown>): Query<T>;
  create(data: Record<string, unknown>): Promise<T>;
}

export interface MateQueryRecord {
  id: number;
  mateId: number;
  date: unknown;
  startTime: unknown;
  endTime: unknown;
  status: string;
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
  MatePhoto: Model<MatePhotoRecord>;
  Booking: Model<MateQueryRecord>;
}

export interface MateDatabase {
  transaction<T>(
    callback: (transaction: MateDatabase) => Promise<T>,
  ): Promise<T>;
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
