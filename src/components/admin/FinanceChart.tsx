import { useState } from 'react';

/** Colores de serie validados (dataviz) sobre la superficie oscura de las cards */
const INCOME_COLOR = '#0D9488'; // accent-600
const EXPENSE_COLOR = '#E64D72'; // brand-400

export interface MonthDatum {
  /** YYYY-MM */
  ym: string;
  income: number;
  expense: number;
}

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Techo «bonito» para el eje (100, 200, 250, 500, 1000…) */
function niceCeil(v: number): number {
  if (v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const c = m * pow;
    if (v <= c) return c;
  }
  return 10 * pow;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'short' });
}

export default function FinanceChart({ data }: { data: MonthDatum[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceCeil(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
  const ticks = [0, max / 2, max];

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Evolución · últimos 6 meses</p>
        {/* Leyenda (2 series) */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
            Ingresos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />
            Gastos
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Eje Y: valores redondos */}
        <div className="relative h-40 w-10 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-zinc-500"
              style={{ bottom: `${(t / max) * 100}%`, transform: 'translateY(50%)' }}
            >
              {EUR.format(t)}
            </span>
          ))}
        </div>

        {/* Área de dibujo */}
        <div className="relative h-40 min-w-0 flex-1">
          {/* Rejilla hairline, recesiva */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-white/5"
              style={{ bottom: `${(t / max) * 100}%` }}
              aria-hidden
            />
          ))}

          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.ym}
                className="relative flex h-full flex-1 items-end justify-center gap-[2px]"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(hover === i ? null : i)}
              >
                {/* Barras: remate redondeado arriba (data-end), base recta */}
                <div
                  className="w-3 rounded-t sm:w-4"
                  style={{
                    height: `${Math.max(d.income > 0 ? 2 : 0, (d.income / max) * 100)}%`,
                    backgroundColor: INCOME_COLOR,
                  }}
                />
                <div
                  className="w-3 rounded-t sm:w-4"
                  style={{
                    height: `${Math.max(d.expense > 0 ? 2 : 0, (d.expense / max) * 100)}%`,
                    backgroundColor: EXPENSE_COLOR,
                  }}
                />

                {/* Tooltip al pasar */}
                {hover === i && (
                  <div
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur ${
                      i === 0 ? 'left-0' : i === data.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    <p className="mb-1 font-semibold capitalize text-zinc-200">
                      {monthLabel(d.ym)} · {d.ym.slice(0, 4)}
                    </p>
                    <p className="flex items-center gap-1.5 text-zinc-300">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
                      Ingresos <span className="ml-auto pl-3 font-semibold tabular-nums">{EUR.format(d.income)}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-zinc-300">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />
                      Gastos <span className="ml-auto pl-3 font-semibold tabular-nums">{EUR.format(d.expense)}</span>
                    </p>
                    <p className="mt-1 border-t border-white/10 pt-1 text-zinc-400">
                      Balance{' '}
                      <span className="float-right pl-3 font-semibold tabular-nums text-zinc-200">
                        {EUR.format(d.income - d.expense)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Etiquetas de mes */}
      <div className="mt-1.5 flex pl-12">
        {data.map((d, i) => (
          <p
            key={d.ym}
            className={`flex-1 text-center text-[10px] capitalize ${
              i === data.length - 1 ? 'font-semibold text-zinc-300' : 'text-zinc-500'
            }`}
          >
            {monthLabel(d.ym)}
          </p>
        ))}
      </div>
    </div>
  );
}
