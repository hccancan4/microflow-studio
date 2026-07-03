/**
 * ResultsPanel/constants — sekmeler arası paylaşılan recharts tema
 * sabitleri (token-güdümlü). Tek kaynak: tüm sekmeler buradan tüketir.
 */
import { TOKENS } from '../../theme/tokens';

export const AXIS_TICK = { fontSize: 10, fill: TOKENS.chartAxis } as const;
export const TOOLTIP_STYLE = {
  background: TOKENS.chartTooltipBg,
  border: `1px solid ${TOKENS.chartTooltipBorder}`,
  borderRadius: 4,
  fontSize: 11,
} as const;
