import type { ArrangementStylePack, ArrangementStylePackId } from '@/src/nex-note/arrangement/spec';
import { CLASSICAL_BASIC_STYLE_PACK } from '@/src/nex-note/arrangement/style-packs/classical-basic';
import { GENERALBASS_STYLE_PACK } from '@/src/nex-note/arrangement/style-packs/generalbass';
import { JAZZ_CLOSE_STYLE_PACK } from '@/src/nex-note/arrangement/style-packs/jazz-close';

export const ARRANGEMENT_STYLE_PACKS: Record<ArrangementStylePackId, ArrangementStylePack> = {
  'classical-basic': CLASSICAL_BASIC_STYLE_PACK,
  generalbass: GENERALBASS_STYLE_PACK,
  'jazz-close': JAZZ_CLOSE_STYLE_PACK,
};

export function getArrangementStylePack(id: ArrangementStylePackId) {
  return ARRANGEMENT_STYLE_PACKS[id];
}
