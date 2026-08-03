/** Default list page size for UI tables and list APIs. */
export const DEFAULT_PAGE_SIZE = 10;

/** Learning-plan sidebar / route table page size. */
export const LEARNING_PLAN_PAGE_SIZE = 20;

/** Upper bound accepted by backend list endpoints. */
export const MAX_PAGE_SIZE = 200;

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
