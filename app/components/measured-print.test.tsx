import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import PrintableTablature from './PrintableTablature';
import TabGrid from './TabGrid';
import { emptyMeasure } from '../lib/music/measures';
it('prints measured durations, rests, grace, techniques and final boundaries', () => {
  const columns=emptyMeasure('6/8');
  columns[0]={...columns[0],autoRest:false,rest:false,notes:[{stringIndex:0,fret:5}],technique:'h'};
  columns.splice(1,0,{...columns[0],id:'grace',kind:'grace',notes:[{stringIndex:0,fret:7}]});
  columns[columns.length-1].barlineAfter='final';
  const html=renderToStaticMarkup(<PrintableTablature stringCount={5} pitches={['G4','D3','G3','B3','D4']} columns={columns}/>);
  expect(html).toContain('6/8'); expect(html).toContain('Complete'); expect(html).toContain('eighth');
  expect(html).toContain('grace'); expect(html).toContain('𝄾'); expect(html).toContain('6px double'); expect(html).toContain('>h</sup>');
  const live=renderToStaticMarkup(<TabGrid stringCount={5} pitches={[]} columns={columns}/>);
  expect(live).toContain('data-compound-group="true"'); expect(live).toContain('border-r-[7px]');
});
