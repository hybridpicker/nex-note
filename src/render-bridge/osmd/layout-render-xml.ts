import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { OsmdLayoutBridge } from './layout-plan-bridge';

/** Project layout controls into the already current XML without re-exporting
 * every note, relation and imported notation a second time. */
export function projectOsmdLayoutXml(xml: string, document: ScoreDocumentModel, bridge: OsmdLayoutBridge): string {
  const parsed = new DOMParser().parseFromString(xml, 'text/xml');
  const xmlParts = Array.from(parsed.getElementsByTagName('part'));
  const plans = new Map(bridge.measures.map(measure => [measure.measureId, measure]));
  for (const part of document.score.parts) {
    const xmlPart = xmlParts.find(candidate => candidate.getAttribute('id') === part.sourcePartId);
    if (!xmlPart) continue;
    const canonical = part.staves.find(staff => staff.measures.length)?.measures ?? [];
    // First <measure> per numeric `number` attribute (was a linear find per core measure). NaN keys
    // are skipped because `NaN === x` never matched in the linear search either.
    const sourceMeasures = Array.from(xmlPart.getElementsByTagName('measure'));
    const sourceMeasureByNumber = new Map<number, (typeof sourceMeasures)[number]>();
    for (const candidate of sourceMeasures) {
      const number = Number(candidate.getAttribute('number'));
      if (!Number.isNaN(number) && !sourceMeasureByNumber.has(number)) sourceMeasureByNumber.set(number, candidate);
    }
    for (const measure of canonical) {
      const plan = plans.get(measure.id);
      const element = sourceMeasureByNumber.get(measure.sourceMeasureNumber ?? measure.measureNumber);
      if (!plan || !element) continue;
      const prints = Array.from(element.childNodes).filter(node => node.nodeType === 1 && node.nodeName === 'print') as typeof element[];
      // Keep imported page/system margins and staff-layout fields. Only the
      // explicit layout-plan controls are replaced in this render projection.
      for (const print of prints) { print.removeAttribute('new-system'); print.removeAttribute('new-page'); }
      const print = prints[0] ?? parsed.createElement('print');
      if (!prints.length) element.insertBefore(print, element.firstChild);
      if (plan.breakBefore) print.setAttribute('new-system', 'yes');
      if (plan.pageBreakBefore) print.setAttribute('new-page', 'yes');
      if (plan.staffSpacing != null) {
        const layouts = Array.from(print.getElementsByTagName('staff-layout'));
        const layout = layouts.find(candidate => !candidate.hasAttribute('number')) ?? parsed.createElement('staff-layout');
        if (!layout.parentNode) print.appendChild(layout);
        const distance = layout.getElementsByTagName('staff-distance')[0] ?? parsed.createElement('staff-distance');
        if (!distance.parentNode) layout.appendChild(distance);
        distance.textContent = String(plan.staffSpacing);
      }
    }
  }
  return new XMLSerializer().serializeToString(parsed);
}
