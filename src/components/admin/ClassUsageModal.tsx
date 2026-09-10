import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Check,
  Gift,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import Modal from '../Modal';
import { deleteClassCredit, fetchMemberUsage, grantClassCredit } from '../../lib/api';
import { formatDateES, todayISO } from '../../lib/dates';
import { formatTime, memberFullName, type Member, type MemberUsage } from '../../lib/types';

interface Props {
  member: Member | null;
  onClose: () => void;
  /** Recarga la lista de socios para que los contadores queden al día */
  onChanged: () => Promise<void> | void;
}

/**
 * Consumo de clases de un socio: semana en curso y mes natural, con el detalle
 * de sus reservas y de las clases que el admin le ha devuelto.
 */
export default function ClassUsageModal({ member, onClose, onChanged }: Props) {
  const [usage, setUsage] = useState<MemberUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyCredit, setBusyCredit] = useState<string | null>(null);

  const memberId = member?.id;

  const load = useCallback(async () => {
    if (!memberId) return;
    try {
      setError(null);
      setUsage(await fetchMemberUsage(memberId));
    } catch (e) {
      console.error(e);
      setError('No se pudo cargar el consumo de clases.');
    }
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    setUsage(null);
    setGranting(false);
    setReason('');
    void load();
  }, [memberId, load]);

  async function handleGrant() {
    if (!memberId) return;
    setBusy(true);
    setError(null);
    try {
      await grantClassCredit(memberId, 1, todayISO(), reason);
      setReason('');
      setGranting(false);
      await load();
      await onChanged();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo devolver la clase.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(id: string) {
    setBusyCredit(id);
    setError(null);
    try {
      await deleteClassCredit(id);
      await load();
      await onChanged();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo deshacer.');
    } finally {
      setBusyCredit(null);
    }
  }

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title={member ? `Clases de ${memberFullName(member)}` : 'Clases'}
    >
      {usage === null ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Consumo: semana y mes */}
          <div className="grid grid-cols-2 gap-2">
            <div className="card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Esta semana
              </p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {usage.week_used}
                <span className="text-sm font-semibold text-zinc-500">/{usage.week_limit}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                desde el {formatDateES(usage.week_start)}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Este mes
              </p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {usage.month_used}
                {usage.month_limit != null && (
                  <span className="text-sm font-semibold text-zinc-500">/{usage.month_limit}</span>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {usage.month_limit != null ? 'tope del plan' : 'sin tope mensual'}
              </p>
            </div>
          </div>

          {/* Devolver una clase */}
          {granting ? (
            <div className="rounded-xl border border-accent-500/25 bg-accent-500/[0.07] p-3.5">
              <label
                htmlFor="credit-reason"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
              >
                Motivo <span className="normal-case text-zinc-600">(opcional)</span>
              </label>
              <input
                id="credit-reason"
                className="input"
                maxLength={200}
                placeholder="Ej. canceló tarde por trabajo"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Se le devuelve 1 clase de esta semana. Su contador baja al momento y podrá reservar
                una clase más.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setGranting(false)}
                  disabled={busy}
                  className="btn-ghost flex-1 !py-2 text-xs"
                >
                  <X className="h-4 w-4" /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleGrant()}
                  disabled={busy}
                  className="btn-primary flex-1 !py-2 text-xs"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {busy ? 'Devolviendo…' : 'Devolver clase'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setGranting(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition hover:border-accent-500/40 hover:bg-accent-500/[0.07]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/25">
                <Plus className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">Devolver una clase</span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  Le suma un crédito de esta semana, por ejemplo tras una cancelación tardía.
                </span>
              </span>
            </button>
          )}

          {/* Reservas de la semana */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Reservas de esta semana
            </p>
            {usage.week_bookings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-zinc-500">
                Sin reservas esta semana.
              </p>
            ) : (
              <div className="space-y-1.5">
                {usage.week_bookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{b.title}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      <span className="capitalize">
                        {new Date(`${b.class_date}T00:00:00`).toLocaleDateString('es-ES', {
                          weekday: 'short',
                        })}
                      </span>
                      {b.start_time ? ` ${formatTime(b.start_time.slice(0, 5))}` : ''}
                    </span>
                    {b.status === 'late_cancelled' && (
                      <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-brand-500/20">
                        Canceló tarde
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clases devueltas este mes */}
          {usage.credits.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Clases devueltas este mes
              </p>
              <div className="space-y-1.5">
                {usage.credits.map((c) => (
                  <div
                    key={c.id}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-accent-500/20 bg-accent-500/[0.06] px-3 py-2"
                  >
                    <Gift className="h-3.5 w-3.5 shrink-0 text-accent-300" />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                      +{c.amount} {c.amount === 1 ? 'clase' : 'clases'}
                      {c.reason ? <span className="text-zinc-400"> · {c.reason}</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] capitalize text-zinc-500">
                      {new Date(`${c.credit_date}T00:00:00`).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleUndo(c.id)}
                      disabled={busyCredit === c.id}
                      className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:text-brand-300 disabled:opacity-50"
                      aria-label="Deshacer devolución"
                      title="Deshacer devolución"
                    >
                      {busyCredit === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => void load()} className="btn-ghost !px-3 !py-2 text-xs">
              <RotateCcw className="h-4 w-4" /> Actualizar
            </button>
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
