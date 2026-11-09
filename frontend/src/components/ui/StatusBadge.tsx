import { getBadgeClass } from '@/lib/format';
export function StatusBadge({ estado }: { estado: string | null | undefined }) {
  return <span className={`badge ${getBadgeClass(estado)}`}>{estado || '-'}</span>;
}
