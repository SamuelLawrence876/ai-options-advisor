export interface Item {
  pk: string;
  sk: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
