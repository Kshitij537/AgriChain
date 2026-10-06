import React from 'react';
import { formatINR } from '../../utils/marketHelpers';

/**
 * Ways to liquidate the batch other than the APMC auction yard.
 *
 * Channels are ranked by net return, but a higher-paying channel that takes
 * days to clear is flagged — for a perishable that delay is the whole risk.
 *
 * @param {object} props
 * @param {Array} props.channels
 * @param {object} props.batch
 */
const AlternativeChannels = ({ channels, batch }) => {
  if (!channels?.length) return null;

  const best = channels.find((c) => c.best);
  // A channel can quote more than the mandi and still be the wrong call: the
  // extra cash only exists if the produce survives the wait. Name that openly
  // rather than leaving a higher number sitting unexplained next to "Best Fit".
  const higherButSlower = channels.find(
    (c) => !c.best && c.caution && c.netReturn > (best?.netReturn ?? 0)
  );

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <div>
            <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
              Market Exploration
            </span>
            <h2 className="font-headline font-extrabold text-xl text-on-surface">
              Alternative Selling Channels
            </h2>
          </div>
          <span className="material-symbols-outlined text-2xl text-secondary shrink-0">storefront</span>
        </div>
        <p className="text-xs text-on-surface-variant mb-6">
          Other ways to move your {batch?.quantityKg} kg batch outside the APMC auction yard:
        </p>

        <div className="space-y-3">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 ${
                channel.best
                  ? 'bg-primary-fixed/20 border border-primary/30'
                  : 'bg-surface-container-low'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    channel.best
                      ? 'bg-primary text-on-primary'
                      : channel.id === 'fpo'
                      ? 'bg-secondary/10 text-secondary'
                      : 'bg-surface-container-high text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">{channel.icon}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface truncate">{channel.name}</span>
                    {channel.best && (
                      <span className="text-[10px] font-bold bg-primary text-on-primary px-1.5 py-0.5 rounded shrink-0">
                        Best Fit
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-on-surface-variant block truncate">
                    {channel.subtitle}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`font-headline font-extrabold text-sm ${
                    channel.best ? 'text-primary' : 'text-on-surface'
                  }`}
                >
                  {formatINR(channel.netReturn)}
                </span>
                {channel.note && (
                  <span
                    className={`text-[10px] block ${
                      channel.caution ? 'text-error' : 'text-on-surface-variant'
                    }`}
                  >
                    {channel.note}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {best && (
        <div className="mt-4 pt-3 text-xs text-on-surface-variant leading-relaxed">
          <span>
            <strong className="text-on-surface">Verdict:</strong> {best.name} remains optimal for the
            whole {batch?.quantityKg} kg lot today
            {higherButSlower ? (
              <>
                {' '}&mdash; {higherButSlower.name} quotes{' '}
                {formatINR(higherButSlower.netReturn - best.netReturn, { signed: true })} more, but{' '}
                {higherButSlower.note?.toLowerCase()} and a ripe {batch?.crop?.toLowerCase()} lot
                will not survive that wait intact.
              </>
            ) : (
              '.'
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default AlternativeChannels;
