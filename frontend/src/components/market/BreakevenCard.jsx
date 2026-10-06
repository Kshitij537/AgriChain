import React from 'react';
import { formatINR, formatRate } from '../../utils/marketHelpers';

/**
 * Cultivation cost vs what the batch will actually realise — answers
 * "am I even making money on this crop".
 *
 * @param {object} props
 * @param {object} props.breakeven - Output of computeBreakeven()
 * @param {object} props.batch
 */
const BreakevenCard = ({ breakeven, batch }) => {
  if (!breakeven) return null;

  const { costPerKg, realizedPerKg, marginPerKg, totalSpent, netMargin, roiPct, profitable, costSharePct } =
    breakeven;

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <div>
            <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
              Cost Accounting
            </span>
            <h2 className="font-headline font-extrabold text-2xl text-on-surface">Cultivation Breakeven</h2>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface shrink-0">
            <span className="material-symbols-outlined text-xl">balance</span>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mb-6">
          Your investment in seeds, drip irrigation, fertilizer and labour against today&rsquo;s return.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-4 rounded-2xl bg-surface-container-low">
            <span className="text-[11px] font-medium text-on-surface-variant block uppercase">Total Spent</span>
            <span className="font-headline font-extrabold text-xl text-on-surface mt-1 block">
              {formatINR(totalSpent)}
            </span>
            <span className="text-[10px] text-on-surface-variant">
              For this {batch?.quantityKg} kg batch
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-surface-container-low">
            <span className="text-[11px] font-medium text-on-surface-variant block uppercase">
              Breakeven Cost
            </span>
            <span className="font-headline font-extrabold text-xl text-on-surface mt-1 block">
              {formatRate(costPerKg)} <span className="text-xs font-normal">/kg</span>
            </span>
            <span className="text-[10px] text-on-surface-variant">
              {formatINR(breakeven.costPerQuintal)} / quintal
            </span>
          </div>
        </div>

        {/* Cost vs realised split */}
        <div className="p-4 rounded-2xl bg-surface-container-low flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs gap-2">
            <span className="font-semibold text-on-surface">Cost vs Realized Price Gap</span>
            <span className={`font-bold shrink-0 ${profitable ? 'text-primary' : 'text-error'}`}>
              {formatRate(Math.abs(marginPerKg))} /kg {profitable ? 'net profit' : 'net loss'}
            </span>
          </div>
          <div className="w-full bg-surface-container-highest h-3 rounded-full overflow-hidden flex">
            <div
              className="bg-on-surface-variant/40 h-full"
              style={{ width: `${costSharePct}%` }}
              title={`Breakeven ${formatRate(costPerKg)}/kg`}
            />
            <div
              className={`h-full ${profitable ? 'bg-primary-fixed-dim' : 'bg-error'}`}
              style={{ width: `${Math.max(0, 100 - costSharePct)}%` }}
              title="Profit margin"
            />
          </div>
          <div className="flex justify-between text-[11px] text-on-surface-variant font-medium">
            <span>{formatRate(costPerKg)} /kg Cost</span>
            <span>{formatRate(realizedPerKg)} /kg Net Realized</span>
          </div>
        </div>

        <div
          className={`mt-6 p-4 rounded-2xl ${
            profitable ? 'bg-primary-container text-on-primary' : 'bg-error-container text-on-error-container'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`material-symbols-outlined text-lg ${profitable ? 'text-primary-fixed' : ''}`}>
              {profitable ? 'check_circle' : 'error'}
            </span>
            <span className="font-headline font-bold text-sm">
              {profitable ? 'Profitable Selling Zone' : 'Below Breakeven'}
            </span>
          </div>
          <p className={`text-xs leading-relaxed ${profitable ? 'text-on-primary/90' : ''}`}>
            {profitable ? (
              <>
                Market auction is currently <strong>{formatRate(marginPerKg)}/kg ABOVE</strong> your
                production breakeven. Selling this lot today secures approximately{' '}
                <strong>{formatINR(netMargin)} net margin</strong> above all farm input expenses.
              </>
            ) : (
              <>
                Today&rsquo;s auction sits <strong>{formatRate(Math.abs(marginPerKg))}/kg BELOW</strong>{' '}
                your production cost. Selling now realises a loss of{' '}
                <strong>{formatINR(Math.abs(netMargin))}</strong> against inputs.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-surface-container flex items-center justify-between text-xs text-on-surface-variant">
        <span>
          Target ROI:{' '}
          <strong className={profitable ? 'text-on-surface' : 'text-error'}>
            {roiPct > 0 ? '+' : ''}
            {roiPct.toFixed(1)}%
          </strong>
        </span>
        <span
          className={`inline-flex items-center gap-1 font-semibold ${
            profitable ? 'text-primary' : 'text-error'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {profitable ? 'trending_up' : 'trending_down'}
          </span>
          {profitable ? 'Strong Margin' : 'Negative Margin'}
        </span>
      </div>
    </div>
  );
};

export default BreakevenCard;
