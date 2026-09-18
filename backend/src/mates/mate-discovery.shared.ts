/**
 * Structural database types and small query helpers used by the public
 * discovery read models.  Keeping this structural avoids coupling read-only
 * endpoints to a particular Prisma contract generation version, while the
 * production client still receives database-side predicates.
 */
export type DiscoveryDatabase = {
  orm: {
    public: Record<string, any>;
  };
};

export type DiscoveryQuery = {
  all(): Promise<any[]>;
  first(): Promise<any | null>;
  where?: (filter: any) => DiscoveryQuery;
};

export const modelRows = async (
  model: any,
  filter?: Record<string, unknown>,
): Promise<any[]> => {
  if (filter !== undefined && typeof model?.where === 'function') {
    return model.where(filter).all();
  }
  if (typeof model?.all === 'function') {
    const rows = await model.all();
    if (!filter) return rows;
    return rows.filter((row: any) =>
      Object.entries(filter).every(([key, value]) => row[key] === value),
    );
  }
  return [];
};

/** Fetch a relation table by a set of IDs with an IN predicate in production. */
export const rowsByIds = async (
  model: any,
  field: string,
  ids: number[],
  refine?: (row: any) => unknown,
): Promise<any[]> => {
  if (ids.length === 0) return [];
  if (typeof model?.where === 'function') {
    let query = model.where((row: any) => row[field].in(ids));
    if (refine && typeof query?.where === 'function') query = query.where(refine);
    return query.all();
  }
  const rows = typeof model?.all === 'function' ? await model.all() : [];
  return rows.filter((row: any) => ids.includes(row[field]));
};

export const averageRating = (reviews: Array<{ rating: number }>): number | null => {
  if (reviews.length === 0) return null;
  return Number(
    (reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length).toFixed(1),
  );
};

export const compareNullableNumber = (left: number | null, right: number | null): number => {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left - right;
};

export const toEpochMillis = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'epochMilliseconds' in value) {
    return Number((value as { epochMilliseconds: number }).epochMilliseconds);
  }
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const toMinutes = (value: unknown): number => {
  if (typeof value === 'string') {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }
  return toEpochMillis(value) / 60_000;
};
