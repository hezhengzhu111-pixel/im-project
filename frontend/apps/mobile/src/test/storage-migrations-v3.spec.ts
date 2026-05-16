import { getMigrationSteps, CURRENT_DB_VERSION, MIGRATIONS } from '@/services/storage/storageMigrations';

describe('Storage Migrations V3', () => {
  describe('CURRENT_DB_VERSION', () => {
    it('should be 3', () => {
      expect(CURRENT_DB_VERSION).toBe(3);
    });
  });

  describe('MIGRATIONS[3]', () => {
    it('should exist with 6 statements', () => {
      expect(MIGRATIONS[3]).toBeDefined();
      expect(MIGRATIONS[3]).toHaveLength(6);
    });

    it('should include all required ALTER TABLE statements', () => {
      const statements = MIGRATIONS[3];
      expect(statements).toContain('ALTER TABLE mobile_upload_tasks ADD COLUMN nextRetryAt INTEGER');
      expect(statements).toContain('ALTER TABLE mobile_upload_tasks ADD COLUMN maxRetryCount INTEGER');
      expect(statements).toContain('ALTER TABLE mobile_upload_tasks ADD COLUMN checksum TEXT');
      expect(statements).toContain('ALTER TABLE mobile_upload_tasks ADD COLUMN remoteFileId TEXT');
      expect(statements).toContain('ALTER TABLE mobile_upload_tasks ADD COLUMN lastAttemptAt INTEGER');
    });

    it('should include index creation', () => {
      const statements = MIGRATIONS[3];
      expect(statements).toContain(
        'CREATE INDEX IF NOT EXISTS idx_mobile_upload_tasks_status_retry ON mobile_upload_tasks(status, nextRetryAt)',
      );
    });
  });

  describe('getMigrationSteps', () => {
    it('should return V3 migration steps when upgrading from V2', () => {
      const steps = getMigrationSteps(2, 3);
      expect(steps).toHaveLength(1);
      expect(steps[0].version).toBe(3);
      expect(steps[0].statements).toEqual(MIGRATIONS[3]);
    });

    it('should return empty when already at current version', () => {
      const steps = getMigrationSteps(3, 3);
      expect(steps).toHaveLength(0);
    });

    it('should return empty for downgrade', () => {
      const steps = getMigrationSteps(3, 2);
      expect(steps).toHaveLength(0);
    });

    it('should return both V2 and V3 steps when upgrading from V1', () => {
      const steps = getMigrationSteps(1, 3);
      expect(steps).toHaveLength(2);
      expect(steps[0].version).toBe(2);
      expect(steps[1].version).toBe(3);
    });
  });
});
