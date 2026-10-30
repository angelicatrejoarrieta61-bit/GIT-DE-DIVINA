/** Tipos de src/lib/sourcingServer.js (código de servidor compartido por las funciones de abastecimiento). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarginSettings, PriceRules } from './sourcingCore.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export interface SourcingConfig {
  margin: MarginSettings;
  rules: PriceRules;
  enabled: boolean;
  opportunitiesPerDay: number;
  seeds: string[];
}

export interface SourceInfo { sponsored: number; shopping: number; sponsoredError: string | null; shoppingError: string | null }

export function guessWebsite(shopName: string): string | null;
export function fetchShopping(query: string, start?: number): Promise<{ items: Row[]; nextStart: number | null; sources: SourceInfo }>;
export function normalizeItems(items: Row[], start?: number): Row[];
export function upsertMerchants(db: SupabaseClient, items: Array<{ shop: string; price: number | null }>): Promise<Map<string, { id: string; trust: string }>>;
export function merchantsForOffers(db: SupabaseClient, offers: Row[]): Promise<Record<string, Row>>;
export function saveSearch(db: SupabaseClient, args: {
  query: string; start?: number; productId?: string | null; normalized: Row[]; durationMs: number;
}): Promise<{ search: { id: string; created_at: string }; offers: Row[] }>;
export function logSearchError(db: SupabaseClient, args: {
  query: string; start?: number; productId?: string | null; durationMs: number; message: string;
}): Promise<void>;
export function searchOffers(db: SupabaseClient, query: string, opts?: { productId?: string | null; cacheMinutes?: number }): Promise<{
  offers: Row[]; merchants: Record<string, Row>; cached: boolean; searchId: string;
}>;
export function loadSettings(db: SupabaseClient): Promise<SourcingConfig>;
export function productQuery(p: Row): string;
export function checkQueries(product: Row, source: Row | null): string[];
export function checkProduct(db: SupabaseClient, product: Row, cfg: SourcingConfig, opts?: { cacheMinutes?: number }): Promise<Row>;
export function dueProducts(db: SupabaseClient, cfg: SourcingConfig, limit: number): Promise<Row[]>;
export function verifyOrder(db: SupabaseClient, order: Row, cfg: SourcingConfig): Promise<{
  decision: 'comprar' | 'cambiar_proveedor' | 'suspender'; margin: number; detail: Row[];
}>;
export function googleSuggest(q: string): Promise<string[]>;
export function evaluateOpportunity(db: SupabaseClient, opp: Row, cfg: SourcingConfig): Promise<Row>;
export function discoverFromSeeds(db: SupabaseClient, seeds: string[]): Promise<number>;
