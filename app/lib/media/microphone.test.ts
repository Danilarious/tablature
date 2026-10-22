import { expect, it } from 'vitest';
import { instrumentAudioConstraints } from './microphone';
it('requests supported raw audio constraints off', () => {
  expect(instrumentAudioConstraints({echoCancellation:true,noiseSuppression:true,autoGainControl:true})).toEqual({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
});
it('omits unsupported constraints', () => {
  expect(instrumentAudioConstraints({echoCancellation:true})).toEqual({audio:{echoCancellation:false}});
  expect(instrumentAudioConstraints({})).toEqual({audio:true});
});
