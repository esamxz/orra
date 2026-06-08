import { describe, it, expect } from 'vitest';
import { mapDbError, expectSingleRow, expectRows } from '../db/errors.js';
import { ApiError } from '../errors.js';

describe('DB error mapping', () => {
  describe('mapDbError', () => {
    it('maps unique violation (23505) to CONFLICT', () => {
      const err = { code: '23505', message: 'duplicate key value violates unique constraint' };
      const mapped = mapDbError(err);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('CONFLICT');
      expect(mapped.message).toBe('A resource with that identifier already exists.');
    });

    it('maps foreign key violation (23503) to VALIDATION', () => {
      const err = { code: '23503', message: 'insert or update on table violates foreign key constraint' };
      const mapped = mapDbError(err);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('VALIDATION');
      expect(mapped.message).toBe('Reference to a missing resource.');
    });

    it('maps check constraint violation (23514) to VALIDATION', () => {
      const err = { code: '23514', message: 'new row for relation violates check constraint' };
      const mapped = mapDbError(err);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('VALIDATION');
    });

    it('maps not-null violation (23502) to VALIDATION', () => {
      const err = { code: '23502', message: 'null value in column violates not-null constraint' };
      const mapped = mapDbError(err);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('VALIDATION');
    });

    it('maps PostgREST zero-rows (PGRST116) to NOT_FOUND', () => {
      const err = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };
      const mapped = mapDbError(err);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('NOT_FOUND');
    });

    it('maps unknown DB error to INTERNAL', () => {
      const err = { code: 'XX999', message: 'something weird happened' };
      const mapped = mapDbError(err);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('INTERNAL');
    });

    it('maps non-object errors to INTERNAL', () => {
      const mapped = mapDbError('plain string error');
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('INTERNAL');
    });

    it('maps null to INTERNAL', () => {
      const mapped = mapDbError(null);
      expect(mapped).toBeInstanceOf(ApiError);
      expect(mapped.code).toBe('INTERNAL');
    });

    it('does not leak raw SQL or secrets in mapped messages', () => {
      const err = { code: '23505', message: 'duplicate key value violates unique constraint "users_email_key"' };
      const mapped = mapDbError(err);
      expect(mapped.message).not.toContain('users_email_key');
      expect(mapped.message).toBe('A resource with that identifier already exists.');
    });
  });

  describe('expectSingleRow', () => {
    it('returns data when present and no error', () => {
      const result = expectSingleRow({ id: '1', name: 'Alice' }, null);
      expect(result.id).toBe('1');
    });

    it('throws NOT_FOUND when data is null and no error', () => {
      expect(() => expectSingleRow(null, null)).toThrow(ApiError);
      try {
        expectSingleRow(null, null);
      } catch (err) {
        expect((err as ApiError).code).toBe('NOT_FOUND');
      }
    });

    it('throws mapped ApiError when error is present', () => {
      const dbErr = { code: 'PGRST116', message: 'zero rows' };
      expect(() => expectSingleRow(null, dbErr)).toThrow(ApiError);
      try {
        expectSingleRow(null, dbErr);
      } catch (err) {
        expect((err as ApiError).code).toBe('NOT_FOUND');
      }
    });
  });

  describe('expectRows', () => {
    it('returns data array when present', () => {
      const rows = [{ id: '1' }, { id: '2' }];
      const result = expectRows(rows, null);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when data is null and no error', () => {
      const result = expectRows(null, null);
      expect(result).toEqual([]);
    });

    it('throws mapped ApiError when error is present', () => {
      const dbErr = { code: '23505', message: 'dup' };
      expect(() => expectRows(null, dbErr)).toThrow(ApiError);
      try {
        expectRows(null, dbErr);
      } catch (err) {
        expect((err as ApiError).code).toBe('CONFLICT');
      }
    });
  });
});
