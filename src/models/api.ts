export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  stage: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  count: number;
}
