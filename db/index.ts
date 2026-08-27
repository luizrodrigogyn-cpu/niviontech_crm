type Row = Record<string, unknown>;

const isLocalNode = typeof process !== 'undefined' && process.release?.name === 'node';
const workerEnv = isLocalNode ? null : (await import('cloudflare:workers')).env;

const memory = {
  orgs: new Map<string, Row>(),
  members: new Map<string, Row>(),
  profiles: new Map<string, Row>(),
  snapshots: new Map<string, Row>(),
};

function localD1() {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async first<T>() {
          if (normalized.includes('from crm_org_members')) return (memory.members.get(String(values[0])) || null) as T | null;
          if (normalized.includes('from crm_orgs where org_id')) return (memory.orgs.get(String(values[0])) || null) as T | null;
          if (normalized.includes('from crm_orgs where invite_code')) {
            return ([...memory.orgs.values()].find((row) => row.invite_code === values[0]) || null) as T | null;
          }
          return null;
        },
        async run() {
          if (normalized.startsWith('create ')) return { meta: { changes: 0 } };
          if (normalized.startsWith('insert into crm_orgs')) {
            const [org_id, payload, updated_at, device_id, invite_code] = values;
            memory.orgs.set(String(org_id), { org_id, payload, revision: 0, updated_at, device_id, invite_code });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('insert into crm_org_members')) {
            const [user_id, org_id, role, joined_at] = values;
            memory.members.set(String(user_id), { user_id, org_id, role, joined_at });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('insert into crm_member_profiles')) {
            const [user_id, org_id, email, display_name, profile, updated_at] = values;
            memory.profiles.set(String(user_id), { user_id, org_id, email, display_name, profile, updated_at });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('insert into crm_org_snapshots')) {
            const [id, org_id, payload, revision, created_at, device_id] = values;
            memory.snapshots.set(String(id), { id, org_id, payload, revision, created_at, device_id });
            return { meta: { changes: 1 } };
          }
          if (normalized.startsWith('delete from crm_org_snapshots')) {
            const orgId = String(values[0]);
            const rows = [...memory.snapshots.entries()]
              .filter(([, row]) => row.org_id === orgId)
              .sort((a, b) => Number(b[1].revision) - Number(a[1].revision));
            rows.slice(30).forEach(([id]) => memory.snapshots.delete(id));
            return { meta: { changes: Math.max(0, rows.length - 30) } };
          }
          if (normalized.startsWith('update crm_orgs set payload')) {
            const [payload, revision, updated_at, device_id, org_id, expectedRevision] = values;
            const current = memory.orgs.get(String(org_id));
            if (!current || Number(current.revision) !== Number(expectedRevision)) return { meta: { changes: 0 } };
            memory.orgs.set(String(org_id), { ...current, payload, revision, updated_at, device_id });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

const localDatabase = localD1();

export function getD1() {
  if (workerEnv?.DB) return workerEnv.DB;
  if (isLocalNode) return localDatabase;
  throw new Error('Cloudflare D1 binding DB is unavailable.');
}
