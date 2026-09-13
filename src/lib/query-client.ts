import { QueryClient } from '@tanstack/react-query';
import { RepositoryError } from '@/services/repository';
import { AppError } from './errors';

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (
    (error instanceof AppError || error instanceof RepositoryError) &&
    ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED'].includes(error.code)
  )
    return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 300_000, retry: shouldRetryQuery },
      // Mutations require feature-specific idempotency before automatic retries.
      mutations: { retry: false },
    },
  });
}
