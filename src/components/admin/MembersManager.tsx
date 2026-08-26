import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Clock3,
  Loader2,
  Mail,
  Phone,
  Power,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
} from 'lucide-react';
import Modal from '../Modal';
import {
  deleteMember,
  fetchMembers,
  inviteMember,
  resendInvite,
  updateMemberMembership,
} from '../../lib/api';
import { memberFullName, type Member, type MemberInput } from '../../lib/types';

const EMPTY: MemberInput = { first_name: '', last_name: '', phone: '', email: '' };

export default function MembersManager() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState<Member | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setMembers(await fetchMembers());
    } catch (e) {
      console.error(e);
      setError('No se pudieron cargar los socios.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleResend(m: Member) {
    if (!m.email) return;
    setBusyId(m.id);
    try {
      await resendInvite(m.email);
      window.alert(`Invitación reenviada a ${m.email}.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo reenviar.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(m: Member) {
    if (!window.confirm(`¿Eliminar a ${memberFullName(m)}? Perderá el acceso a la web.`)) return;
    setBusyId(m.id);
    try {
      await deleteMember(m.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Socios</h2>
        <button onClick={() => setOpen(true)} className="btn-primary !px-3.5 !py-2 text-xs">
          <UserPlus className="h-4 w-4" /> Dar de alta
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-brand-300">{error}</p>}

      {members === null ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
          Aún no hay socios. Pulsa «Dar de alta» para invitar al primero.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card flex min-w-0 items-center gap-3 p-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/15 font-display text-xs font-bold text-brand-300 ring-1 ring-brand-500/20">
                #{m.member_no}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-sm font-semibold text-white">{memberFullName(m)}</p>
                  {m.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-brand-500/30">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {!m.activated && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      <Clock3 className="h-3 w-3" /> Sin activar
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  {m.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {m.email}
                    </span>
                  )}
                  {m.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {m.phone}
                    </span>
                  )}
                </div>
                {m.role !== 'admin' && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {m.membership_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300 ring-1 ring-accent-500/25">
                        <BadgeCheck className="h-3 w-3" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-brand-500/20">
                        Inactivo
                      </span>
                    )}
                  </div>
                )}
              </div>
              {m.role !== 'admin' && (
                <button
                  onClick={() => setManaging(m)}
                  className="btn-icon"
                  aria-label="Gestionar membresía"
                  title="Gestionar membresía"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              )}
              {!m.activated && m.email && (
                <button
                  onClick={() => void handleResend(m)}
                  disabled={busyId === m.id}
                  className="btn-icon"
                  aria-label="Reenviar invitación"
                  title="Reenviar invitación"
                >
                  {busyId === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </button>
              )}
              {m.role !== 'admin' && (
                <button
                  onClick={() => void handleDelete(m)}
                  disabled={busyId === m.id}
                  className="btn-icon hover:!text-brand-300"
                  aria-label="Eliminar socio"
                  title="Eliminar socio"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <NewMemberModal open={open} onClose={() => setOpen(false)} onDone={load} />
      <MembershipModal member={managing} onClose={() => setManaging(null)} onSaved={load} />
    </section>
  );
}

function NewMemberModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState<MemberInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setError(null);
      setDone(false);
    }
  }, [open]);

  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await inviteMember(form);
      setDone(true);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de alta al socio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Dar de alta un socio">
      {done ? (
        <div className="space-y-4 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/15 ring-2 ring-accent-500/40"
          >
            <Mail className="h-7 w-7 text-accent-400" />
          </motion.div>
          <div>
            <p className="font-display text-base font-bold text-white">¡Socio dado de alta!</p>
            <p className="mt-1 text-sm text-zinc-400">
              Le hemos enviado un email a <span className="font-medium text-zinc-200">{form.email}</span>{' '}
              para que cree su contraseña.
            </p>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="m-first" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Nombre
              </label>
              <input
                id="m-first"
                required
                className="input"
                placeholder="Nombre"
                value={form.first_name}
                onChange={(e) => set('first_name', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="m-last" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Apellidos
              </label>
              <input
                id="m-last"
                required
                className="input"
                placeholder="Apellidos"
                value={form.last_name}
                onChange={(e) => set('last_name', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="m-phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Teléfono
            </label>
            <input
              id="m-phone"
              type="tel"
              className="input"
              placeholder="Opcional"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="m-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Email
            </label>
            <input
              id="m-email"
              type="email"
              required
              className="input"
              placeholder="socio@email.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
              Recibirá un email para crear su contraseña y activar la cuenta.
            </p>
          </div>

          {error && <p className="text-sm text-brand-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Enviando…' : 'Dar de alta e invitar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MembershipModal({
  member,
  onClose,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setActive(member.membership_active);
      setError(null);
    }
  }, [member]);

  if (!member) return null;

  async function handleSave() {
    if (!member) return;
    setSaving(true);
    setError(null);
    try {
      await updateMemberMembership(member.id, { membership_active: active });
      await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={member !== null} onClose={onClose} title={`Membresía · ${memberFullName(member)}`}>
      <div className="space-y-4">
        {/* Activo / inactivo */}
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition ${
            active
              ? 'border-accent-500/40 bg-accent-500/10'
              : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Power className={`h-4 w-4 ${active ? 'text-accent-400' : 'text-zinc-500'}`} />
            {active ? 'Socio activo' : 'Socio inactivo'}
          </span>
          <span className={`text-xs ${active ? 'text-accent-300' : 'text-zinc-500'}`}>
            {active ? 'puede reservar' : 'no puede reservar'}
          </span>
        </button>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          Un socio inactivo no puede reservar clases hasta que lo reactives (por ejemplo, tras el
          pago). El número de clases por semana se configura para todo el box en «Configuración».
        </p>

        {error && <p className="text-sm text-brand-300">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
