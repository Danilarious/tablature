import { expect, it } from 'vitest';
import { compositionSectionOptions, parseCompositionSections } from './composition-sections';
it('reads valid names defensively without throwing on malformed legacy documents', () => {
  for (const raw of ['{broken', '{}', 'null', '42', '[null,4,"x",{}]']) expect(compositionSectionOptions(raw)).toEqual([]);
  expect(compositionSectionOptions('[{"name":"Verse","notes":"keep"}]')).toEqual([{id:'legacy-0',name:'Verse'}]);
  expect(parseCompositionSections('{broken')).toBeNull();
  expect(parseCompositionSections('[null,{"notes":"preserve"}]')).toEqual([null,{notes:'preserve'}]);
});
