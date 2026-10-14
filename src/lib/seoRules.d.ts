/** Tipos de src/lib/seoRules.js (JS puro para que también lo use el build en Node). */

export interface SeoProductInput {
  id?: string;
  slug: string;
  name: string;
  brand?: string | null;
  price: number;
  compare_price?: number | null;
  description?: string | null;
  benefits?: string[] | null;
  image_url?: string | null;
  images?: string[] | null;
  in_stock?: boolean;
  ean?: string | null;
}

export interface SeoCollectionInput {
  id?: string;
  slug?: string | null;
  name?: string | null;
}

export const SITE_URL: string;
export const SITE_NAME: string;
export const DEFAULT_OG_IMAGE: string;
export const STORAGE_BUCKET: string;
export const SHIPPING_COST: number;
export const FREE_SHIPPING_FROM: number;
export const HOME_TITLE: string;
export const HOME_DESCRIPTION: string;

export function plainText(value: unknown): string;
export function slugify(value: unknown): string;
export function money(n: number): string;
export function cleanName(name: unknown): string;
export function cleanBrand(brand: unknown): string;
export function absoluteImage(path: string | null | undefined, supabaseUrl?: string): string;
export function collectionPath(collection: SeoCollectionInput | null | undefined): string;
export function collectionTitle(name: string): string;
export function collectionDescription(name: string, description?: string | null): string;
export function productTitle(product: SeoProductInput): string;
export function productDescription(product: SeoProductInput): string;
export function productSchema(
  product: SeoProductInput,
  options?: { supabaseUrl?: string; collection?: SeoCollectionInput | null },
): Record<string, unknown>;
export function productBreadcrumb(product: SeoProductInput, collection?: SeoCollectionInput | null): Record<string, unknown>;
export function socialProfiles(config?: Record<string, string | undefined>): string[];
export function storeSchema(config?: Record<string, string | undefined>): Record<string, unknown>;
