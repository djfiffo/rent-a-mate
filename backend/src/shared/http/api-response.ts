export interface ApiResponse<T> {
  status: 'success';
  message: string;
  data: T;
}

export function successResponse<T>(message: string, data: T): ApiResponse<T> {
  return { status: 'success', message, data };
}
