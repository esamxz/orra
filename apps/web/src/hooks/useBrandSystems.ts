import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listBrandSystems,
  createBrandSystem as apiCreateBrandSystem,
  updateBrandSystem as apiUpdateBrandSystem,
  deleteBrandSystem as apiDeleteBrandSystem,
} from '../api/brandSystems.js';
import { ApiClientError } from '../api/errors.js';
import type { BrandSystemDto, CreateBrandSystemInput, UpdateBrandSystemInput } from '../api/types.js';

export type BrandSystemsLoadingState = 'idle' | 'loading' | 'error' | 'empty';

export interface UseBrandSystemsResult {
  brands: BrandSystemDto[];
  state: BrandSystemsLoadingState;
  error: string | null;
  reload: () => void;
  createBrand: (input: CreateBrandSystemInput) => Promise<BrandSystemDto | null>;
  updateBrand: (id: string, input: UpdateBrandSystemInput) => Promise<BrandSystemDto | null>;
  deleteBrand: (id: string) => Promise<boolean>;
  isMutating: boolean;
}

/**
 * Fetch the workspace brand system list from the API.
 * Falls back to empty array on error so the UI can decide whether to show
 * mocks or an error state.
 *
 * Includes create/update/delete helpers that refresh the list on success.
 */
export function useBrandSystems(): UseBrandSystemsResult {
  const [brands, setBrands] = useState<BrandSystemDto[]>([]);
  const [state, setState] = useState<BrandSystemsLoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isMutating, setIsMutating] = useState(false);
  const mutationVersionRef = useRef(0);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadVersion = mutationVersionRef.current;

    async function load() {
      setState('loading');
      setError(null);

      try {
        const data = await listBrandSystems({ limit: 50 });
        if (cancelled || mutationVersionRef.current !== loadVersion) return;
        setBrands(data);
        setState(data.length === 0 ? 'empty' : 'idle');
      } catch (err) {
        if (cancelled || mutationVersionRef.current !== loadVersion) return;
        const msg = err instanceof ApiClientError
          ? err.message
          : 'Failed to load brand systems';
        setError(msg);
        setBrands([]);
        setState('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const createBrand = useCallback(async (input: CreateBrandSystemInput): Promise<BrandSystemDto | null> => {
    setIsMutating(true);
    mutationVersionRef.current += 1;
    try {
      const brand = await apiCreateBrandSystem(input);
      setBrands((prev) => [brand, ...prev]);
      setState((s) => (s === 'empty' || s === 'error' ? 'idle' : s));
      return brand;
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to create brand system';
      setError(msg);
      return null;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const updateBrand = useCallback(async (id: string, input: UpdateBrandSystemInput): Promise<BrandSystemDto | null> => {
    setIsMutating(true);
    mutationVersionRef.current += 1;
    try {
      const brand = await apiUpdateBrandSystem(id, input);
      setBrands((prev) => prev.map((b) => (b.id === id ? brand : b)));
      return brand;
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to update brand system';
      setError(msg);
      return null;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const deleteBrand = useCallback(async (id: string): Promise<boolean> => {
    setIsMutating(true);
    mutationVersionRef.current += 1;
    try {
      await apiDeleteBrandSystem(id);
      setBrands((prev) => {
        const next = prev.filter((b) => b.id !== id);
        if (next.length === 0 && prev.length > 0) {
          setState('empty');
        }
        return next;
      });
      return true;
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to delete brand system';
      setError(msg);
      return false;
    } finally {
      setIsMutating(false);
    }
  }, []);

  return { brands, state, error, reload, createBrand, updateBrand, deleteBrand, isMutating };
}
