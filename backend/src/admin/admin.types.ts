export interface AdminSafeUser {
  id: number;
  name: string;
  email: string;
  role: string;
  isBanned: boolean;
  isActive: boolean;
  isVerified: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface AdminBookingItem {
  id: number;
  renter: { id: number; name: string };
  mate: { id: number; name: string };
  activity: { id: number; name: string };
  date: unknown;
  startTime: unknown;
  endTime: unknown;
  totalPrice: unknown;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface BookingCountsByStatus {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

export interface DailyAnalytics {
  date: string;
  bookings: number;
  paidRevenue: number;
  newUsers: number;
}

export interface AnalyticsResult {
  range: { from: string; to: string };
  bookingCounts: BookingCountsByStatus;
  paidRevenue: number;
  newActiveUsers: number;
  daily: DailyAnalytics[];
}
