import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Mail, User } from 'lucide-react';
import Modal from '../Modal';
import { updateMemberProfile } from '../../lib/api';
import { memberFullName, type Member } from '../../lib/types';

interface Props {
  member: Member | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Edita los datos personales de un socio (nombre, apellidos y teléfono).
 *
 * El nombre se propaga solo a sus reservas ya hechas, así que la lista de
 * apuntados a cada clase deja de mostrar el nombre antiguo.
 */
export default function EditMemberModal({ member, onClose, onSaved }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setFirstName(member.first_name ?? '');
      setLastName(member.last_name ?? '');
      setPhone(member.phone ?? '');
      setError(null);
    }
  }, [member]);

  if (!member) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    if (!firstName.trim() && !lastName.trim()) {
      setError('Escribe al menos un nombre o unos apellidos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateMemberProfile(member.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={member !== null} onClose={onClose} title={`Editar · ${memberFullName(member)}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="em-first"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            >
              Nombre
            </label>
            <input
              id="em-first"
              className="input"
              maxLength={60}
              placeholder="Nombre"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="em-last"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            >
              Apellidos
            </label>
            <input
              id="em-last"
              className="input"
              maxLength={60}
              placeholder="Apellidos"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="em-phone"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400"
          >
            Teléfono <span className="normal-case text-zinc-600">(opcional)</span>
          </label>
          <input
            id="em-phone"
            type="tel"
            className="input"
            maxLength={30}
            placeholder="600 000 000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* El email es su acceso a la app: no se cambia desde aquí */}
        {member.email && (
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{member.email}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              Acceso
            </span>
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500">
          <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Al cambiar el nombre se actualiza también en las listas de apuntados de sus clases, tanto
          las futuras como las ya pasadas.
        </p>

        {error && <p className="text-sm text-brand-300">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
