import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Colores de serie validados (dataviz) sobre la superficie oscura de las cards */
const INCOME_COLOR = '#0D9488'; // accent-600
const EXPENSE_COLOR = '#E64D72'; // brand-400
const NEGATIVE_COLOR = '#E64D72';
const LINE_COLOR = '#F59E0B'; // amber-500

export interface MonthDatum {
  /** YYYY-MM */
  ym: string;
  income: number;
  expense: number;
}

/** Rango temporal de la gráfica */
export type ChartRange = '6m' | '12m' | 'year';
/** Qué se dibuja */
export type ChartView = 'both' | 'balance' | 'cumulative';

export const RANGE_OPTIONS: { key: ChartRange; label: string }[] = [
  { key: '6m', label: '6 meses' },
  { key: '12m', label: '12 meses' },
  { key: 'year', label: 'Año' },
];
export const VIEW_OPTIONS: { key: ChartView; label: string }[] = [
  { key: 'both', label: 'Ingresos y gastos' },
  { key: 'balance', label: 'Balance' },
  { key: 'cumulative', label: 'Acumulado' },
];

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
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
}

interface Props {
  data: MonthDatum[];
  range: ChartRange;
  view: ChartView;
  /** Año mostrado cuando range === 'year' */
  year: number;
  onRange: (r: ChartRange) => void;
  onView: (v: ChartView) => void;
  onYear: (y: number) => void;
}

export default function FinanceChart({ data, range, view, year, onRange, onView, onYear }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;

  // Serie principal según la vista
  const balances = data.map((d) => d.income - d.expense);
  const cumulative = balances.reduce<number[]>((acc, b, i) => {
    acc.push((i > 0 ? acc[i - 1] : 0) + b);
    return acc;
  }, []);
  const series = view === 'balance' ? balances : view === 'cumulative' ? cumulative : [];

  // Eje Y: en «ingresos y gastos» siempre desde 0; en balance/acumulado puede
  // haber negativos, así que el eje se hace simétrico con el 0 en el centro.
  let min = 0;
  let max: number;
  let ticks: number[];
  if (view === 'both') {
    max = niceCeil(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
    ticks = [0, max / 2, max];
  } else {
    const hasNeg = series.some((v) => v < 0);
    const lim = niceCeil(Math.max(1, ...series.map((v) => Math.abs(v))));
    if (hasNeg) {
      min = -lim;
      max = lim;
      ticks = [-lim, 0, lim];
    } else {
      max = lim;
      ticks = [0, lim / 2, lim];
    }
  }
  const span = max - min;
  const pct = (v: number) => ((v - min) / span) * 100; // posición vertical en %
  const zero = pct(0);

  const title =
    range === 'year' ? `Año ${year}` : range === '12m' ? 'Últimos 12 meses' : 'Últimos 6 meses';
  const barW = n > 6 ? 'w-1.5 sm:w-3' : 'w-3 sm:w-4';
  const thisYear = new Date().getFullYear();

  // Puntos de la línea de acumulado (SVG 0..100 en ambos ejes)
  const linePoints = cumulative.map((v, i) => `${((i + 0.5) / n) * 100},${100 - pct(v)}`);

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {range === 'year' && (
            <button
              type="button"
              onClick={() => onYear(year - 1)}
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Año anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <p className="text-sm font-semibold text-white">Evolución · {title}</p>
          {range === 'year' && (
            <button
              type="button"
              onClick={() => onYear(year + 1)}
              disabled={year >= thisYear}
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Año siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Leyenda según la vista */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          {view === 'both' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
                Ingresos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />
                Gastos
              </span>
            </>
          ) : view === 'balance' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
                Positivo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: NEGATIVE_COLOR }} />
                Negativo
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: LINE_COLOR }} />
              Balance acumulado
            </span>
          )}
        </div>
      </div>

      {/* Filtros: rango y vista */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented options={RANGE_OPTIONS} value={range} onChange={onRange} ariaLabel="Rango" />
        <Segmented options={VIEW_OPTIONS} value={view} onChange={onView} ariaLabel="Vista" />
      </div>

      <div className="flex gap-2">
        {/* Eje Y: valores redondos */}
        <div className="relative h-40 w-10 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 text-[10px] tabular-nums text-zinc-500"
              style={{ bottom: `${pct(t)}%`, transform: 'translateY(50%)' }}
            >
              {EUR.format(t)}
            </span>
          ))}
        </div>

        {/* Área de dibujo */}
        <div className="relative h-40 min-w-0 flex-1">
          {/* Rejilla hairline, recesiva; la línea del 0 algo más marcada */}
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 && min < 0 ? 'border-white/15' : 'border-white/5'}`}
              style={{ bottom: `${pct(t)}%` }}
              aria-hidden
            />
          ))}

          {/* Línea de acumulado (SVG estirado; el trazo no se deforma) */}
          {view === 'cumulative' && n > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <polygon
                points={`${((0 + 0.5) / n) * 100},${100 - zero} ${linePoints.join(' ')} ${((n - 0.5) / n) * 100},${100 - zero}`}
                fill={LINE_COLOR}
                opacity="0.12"
              />
              <polyline
                points={linePoints.join(' ')}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}

          <div className="absolute inset-0 flex">
            {data.map((d, i) => {
              const bal = balances[i];
              const cum = cumulative[i];
              return (
                <div
                  key={d.ym}
                  className="relative h-full flex-1"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onTouchStart={() => setHover(hover === i ? null : i)}
                >
                  {view === 'both' && (
                    <div className="absolute inset-0 flex items-end justify-center gap-[2px]">
                      {/* Barras: remate redondeado arriba (data-end), base recta */}
                      <div
                        className={`${barW} rounded-t`}
                        style={{
                          height: `${Math.max(d.income > 0 ? 2 : 0, pct(d.income))}%`,
                          backgroundColor: INCOME_COLOR,
                        }}
                      />
                      <div
                        className={`${barW} rounded-t`}
                        style={{
                          height: `${Math.max(d.expense > 0 ? 2 : 0, pct(d.expense))}%`,
                          backgroundColor: EXPENSE_COLOR,
                        }}
                      />
                    </div>
                  )}

                  {view === 'balance' && (
                    // Barra desde la línea del 0: hacia arriba si positivo, hacia abajo si negativo
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 ${n > 6 ? 'w-2.5 sm:w-4' : 'w-4 sm:w-6'} ${
                        bal >= 0 ? 'rounded-t' : 'rounded-b'
                      }`}
                      style={{
                        bottom: `${bal >= 0 ? zero : pct(bal)}%`,
                        height: `${Math.max(bal !== 0 ? 1.5 : 0, Math.abs(pct(bal) - zero))}%`,
                        backgroundColor: bal >= 0 ? INCOME_COLOR : NEGATIVE_COLOR,
                      }}
                    />
                  )}

                  {view === 'cumulative' && (
                    <div
                      className="absolute left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-ink-900"
                      style={{ bottom: `${pct(cum)}%`, backgroundColor: LINE_COLOR }}
                    />
                  )}

                  {/* Tooltip al pasar */}
                  {hover === i && (
                    <div
                      className={`pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur ${
                        i < n / 3 ? 'left-0' : i >= (2 * n) / 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                      }`}
                    >
                      <p className="mb-1 font-semibold capitalize text-zinc-200">
                        {monthLabel(d.ym)} · {d.ym.slice(0, 4)}
                      </p>
                      {view !== 'cumulative' && (
                        <>
                          <p className="flex items-center gap-1.5 text-zinc-300">
                            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />
                            Ingresos{' '}
                            <span className="ml-auto pl-3 font-semibold tabular-nums">{EUR.format(d.income)}</span>
                          </p>
                          <p className="flex items-center gap-1.5 text-zinc-300">
                            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />
                            Gastos{' '}
                            <span className="ml-auto pl-3 font-semibold tabular-nums">{EUR.format(d.expense)}</span>
                          </p>
                        </>
                      )}
                      <p
                        className={`${view !== 'cumulative' ? 'mt-1 border-t border-white/10 pt-1' : ''} text-zinc-400`}
                      >
                        Balance{view === 'cumulative' ? ' del mes' : ''}{' '}
                        <span
                          className={`float-right pl-3 font-semibold tabular-nums ${
                            bal < 0 ? 'text-brand-300' : 'text-zinc-200'
                          }`}
                        >
                          {EUR.format(bal)}
                        </span>
                      </p>
                      {view === 'cumulative' && (
                        <p className="mt-1 border-t border-white/10 pt-1 text-zinc-400">
                          Acumulado{' '}
                          <span
                            className={`float-right pl-3 font-semibold tabular-nums ${
                              cum < 0 ? 'text-brand-300' : 'text-amber-300'
                            }`}
                          >
                            {EUR.format(cum)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Etiquetas de mes */}
      <div className="mt-1.5 flex pl-12">
        {data.map((d, i) => (
          <p
            key={d.ym}
            className={`min-w-0 flex-1 truncate text-center text-[10px] capitalize ${
              i === n - 1 && range !== 'year' ? 'font-semibold text-zinc-300' : 'text-zinc-500'
            }`}
          >
            {n > 6 ? monthLabel(d.ym).slice(0, 3) : monthLabel(d.ym)}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Control segmentado compacto (pastillas) */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
            value === o.key ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
